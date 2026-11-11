import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ResolveEnd, Router, UrlTree } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FilterConfigService, AdminLevel } from '../services/filter-config.service';
import { MapService } from '../services/map.service';
import { ProjectsService } from '../services/project.service';
import { DashboardSessionService } from '../services/dashboard-session.service';
import { LanguageService } from '../services/language.service';
import { ScoreColorsService } from '../services/score-colors.service';
import {
  FeatureSelectionService,
  MapLibreFeatureData,
} from '../shared/services/feature-selection.service';
import {
  ALL_QUALITY_BRACKETS,
  DashboardUrlState,
  DashboardUrlStateKey,
  FeatureRef,
  FeatureTileType,
  URL_PARAM,
  featureRefFromFeature,
  featureRefsEqual,
  parseDashboardUrlState,
  serializeDashboardUrlState,
} from './url-params';

/** Debounce for writing state changes into the URL. */
const WRITE_DEBOUNCE_MS = 300;
/** Viewport differences below these are rounding noise from the URL format. */
const VIEWPORT_ZOOM_EPSILON = 0.01;
const VIEWPORT_COORD_EPSILON = 1e-4;
/** Marks navigations that only mirror state into the URL (they must not be read back). */
const WRITE_MARKER = 'urlStateWrite';

const FILTER_KEYS: readonly DashboardUrlStateKey[] = [
  'bewertung',
  'profileIds',
  'qualityBrackets',
  'timeBrackets',
  'regiostarIds',
  'stateIds',
  'layer',
];
const FEATURE_KEYS: readonly DashboardUrlStateKey[] = ['feature', 'featureSide', 'feature2'];

const TILE_TYPE_TO_ADMIN_LEVEL: Record<FeatureTileType, AdminLevel> = {
  h: 'hexagon',
  m: 'municipality',
  c: 'county',
  s: 'state',
};

interface PendingTarget {
  projectId?: number;
  shareKey?: string;
}

/**
 * Keeps the dashboard view state and the URL in sync, in both directions.
 *
 * Reading: every navigation to `/dashboard` that was not written by this service is parsed into a
 * *pending* state. Pending values are applied step by step as soon as their prerequisites exist
 * (language/viewport/stats level → filters → compare view → difference view → selected features).
 * All values go through the regular state setters, so validation and permission rules apply:
 * a viewer gets everything their access level allows, the rest is dropped.
 *
 * Writing: whenever the state changes, the URL is updated (debounced, `replaceUrl`). Values that
 * are still pending are written as they came in, so nothing is lost while the app loads.
 *
 * Project access (`project_id`, `share_key`, `overview`) is handled by DashboardComponent and
 * ProjectNavigationService; this service only reads it to know which project a URL targets.
 *
 * All parameter names and formats are defined in `url-params.ts`.
 */
@Injectable({
  providedIn: 'root',
})
export class UrlStateService {
  private router = inject(Router);
  private filterConfig = inject(FilterConfigService);
  private mapService = inject(MapService);
  private projectService = inject(ProjectsService);
  private session = inject(DashboardSessionService);
  private languageService = inject(LanguageService);
  private scoreColors = inject(ScoreColorsService);
  private featureSelection = inject(FeatureSelectionService);
  private destroyRef = inject(DestroyRef);

  private readonly pending = signal<DashboardUrlState>({});
  private readonly pendingTarget = signal<PendingTarget | null>(null);
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly lang = signal(this.languageService.getCurrentLanguage());
  private readonly feature1 = toSignal(this.featureSelection.selectedMapLibreFeature$, {
    initialValue: null,
  });
  private readonly feature1Side = toSignal(this.featureSelection.selectedMapLibreFeatureSide$, {
    initialValue: 'left' as const,
  });
  private readonly feature2 = toSignal(this.featureSelection.selectedMapLibreFeature2$, {
    initialValue: null,
  });

  constructor() {
    this.languageService
      .onLanguageChange()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.lang.set(event.lang));

    // The service is created by the dashboard while the first navigation is still running,
    // so pick that URL up now; later navigations are caught before their components activate.
    const initialUrl = this.router.currentNavigation()?.finalUrl;
    this.ingest(initialUrl ? this.router.serializeUrl(initialUrl) : this.router.url);

    this.router.events
      .pipe(
        filter((event): event is ResolveEnd => event instanceof ResolveEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        const navigation = this.router.currentNavigation();
        const ownWrite =
          navigation?.trigger === 'imperative' && navigation.extras.state?.[WRITE_MARKER] === true;
        if (!ownWrite) {
          this.ingest(event.urlAfterRedirects);
        }
      });

    effect(() => this.applyPendingStep());

    effect(() => {
      // Track everything that ends up in the URL.
      this.collectCurrentState();
      this.pending();
      if (!this.canWrite()) {
        return;
      }
      untracked(() => this.scheduleWrite());
    });
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  private ingest(url: string): void {
    const tree = this.router.parseUrl(url);
    if (!this.isDashboardTree(tree)) {
      return;
    }

    const params = tree.queryParams;
    const projectId = Number(params[URL_PARAM.projectId]);
    const shareKey = params[URL_PARAM.shareKey];
    this.pendingTarget.set({
      projectId: Number.isSafeInteger(projectId) && projectId > 0 ? projectId : undefined,
      shareKey: typeof shareKey === 'string' && shareKey.length > 0 ? shareKey : undefined,
    });

    const state = parseDashboardUrlState(params);

    // Values without prerequisites are applied right away (before the map is created).
    if (state.lang && this.languageService.isLanguageAvailable(state.lang)) {
      if (state.lang !== this.languageService.getCurrentLanguage()) {
        this.languageService.setLanguage(state.lang);
      }
    }
    if (state.viewport && !this.viewportMatchesCurrent(state.viewport)) {
      this.mapService.requestViewport(state.viewport);
    }
    if (state.statsLevel) {
      this.filterConfig.setStatsLevel(state.statsLevel);
    }
    delete state.lang;
    delete state.viewport;
    delete state.statsLevel;

    this.pending.set(this.withoutValuesMatchingCurrent(state));
    this.filterConfig.setUrlCompareIntent(
      !!this.pending().compareProfileIds && !this.filterConfig.isMapCompareMode()
    );
  }

  /** Applies the next pending step whose prerequisites are met. Runs as an effect. */
  private applyPendingStep(): void {
    const pending = this.pending();
    if (Object.keys(pending).length === 0) {
      return;
    }
    if (!this.targetMatchesLoadedProject() || !this.filterConfig.isProjectFilterStateReady()) {
      return;
    }

    // 1. Filters (profiles, rating, legend, advanced filters, forced layer)
    if (FILTER_KEYS.some((key) => key in pending)) {
      untracked(() => {
        this.filterConfig.applyExternalFilterState({
          bewertung: pending.bewertung,
          profileIds: pending.profileIds,
          qualityBrackets: pending.qualityBrackets,
          timeBrackets: pending.timeBrackets,
          regiostarIds: pending.regiostarIds,
          stateIds: pending.stateIds,
          layer: pending.layer,
        });
        this.clearPending(FILTER_KEYS);
      });
      return;
    }

    // 2. Compare view
    if (pending.compareProfileIds) {
      untracked(() => {
        const accepted = this.filterConfig.applyExternalCompareState(pending.compareProfileIds!);
        this.clearPending(accepted ? ['compareProfileIds'] : ['compareProfileIds', 'diff']);
      });
      return;
    }

    // Wait until a requested compare view has been built.
    const compareMode = this.filterConfig.isMapCompareMode();
    if (
      this.filterConfig.pendingMapCompareEnable() ||
      this.filterConfig.hasUrlCompareIntent() ||
      this.filterConfig.isMapModeTransitionInProgress() ||
      (compareMode && !this.filterConfig.compareMapsReady())
    ) {
      return;
    }

    // 3. Difference view (only exists inside the compare view)
    if (pending.diff !== undefined) {
      untracked(() => {
        if (compareMode && pending.diff !== this.filterConfig.isDifferenceView()) {
          this.filterConfig.toggleDifferenceView();
        }
        this.clearPending(['diff']);
      });
      return;
    }

    // 4. Selected features, once the content layer is on the map
    if (pending.feature) {
      if (this.mapService.isMapLoading() || this.mapService.currentProfileIds() === null) {
        return;
      }
      untracked(() => {
        this.applyFeatures(pending);
        this.clearPending(FEATURE_KEYS);
      });
      return;
    }

    // Anything left cannot be applied on its own (e.g. a side without a feature).
    untracked(() => this.pending.set({}));
  }

  private applyFeatures(pending: DashboardUrlState): void {
    const feature = pending.feature!;
    if (!this.isFeatureAllowed(feature)) {
      return;
    }
    const side =
      pending.featureSide === 'right' && this.filterConfig.isMapCompareMode() ? 'right' : 'left';
    if (
      !featureRefsEqual(featureRefFromFeature(this.feature1()), feature) ||
      this.feature1Side() !== side
    ) {
      this.featureSelection.setSelectedMapLibreFeature(this.toFeatureData(feature), side);
    }

    const feature2 = pending.feature2;
    if (feature2 && this.isFeatureAllowed(feature2)) {
      if (!featureRefsEqual(featureRefFromFeature(this.feature2()), feature2)) {
        this.featureSelection.setSelectedMapLibreFeature2(this.toFeatureData(feature2));
      }
    } else if (this.feature2()) {
      this.featureSelection.clearComparison();
    }
  }

  /** Share-key viewers only get the layers their access allows. */
  private isFeatureAllowed(ref: FeatureRef): boolean {
    if (!this.filterConfig.isShareKeyOnly()) {
      return true;
    }
    return this.filterConfig.availableAdminLevels().includes(TILE_TYPE_TO_ADMIN_LEVEL[ref.type]);
  }

  /** Minimal feature: the analyze panel loads name and figures via `/feature-info/`. */
  private toFeatureData(ref: FeatureRef): MapLibreFeatureData {
    return { id: ref.id, properties: { id: ref.id, t: ref.type } };
  }

  private clearPending(keys: readonly DashboardUrlStateKey[]): void {
    const next = { ...this.pending() };
    for (const key of keys) {
      delete next[key];
    }
    this.pending.set(next);
  }

  /** Drops pending values that already equal the live state (e.g. after an internal navigation). */
  private withoutValuesMatchingCurrent(state: DashboardUrlState): DashboardUrlState {
    if (!this.targetMatchesLoadedProject() || !this.filterConfig.isProjectFilterStateReady()) {
      return state;
    }
    const current = serializeDashboardUrlState(this.collectCurrentState());
    const incoming = serializeDashboardUrlState(state);
    const result: DashboardUrlState = { ...state };
    for (const key of Object.keys(state) as DashboardUrlStateKey[]) {
      if (FEATURE_KEYS.includes(key)) {
        continue;
      }
      const param = URL_PARAM[key];
      if (current[param] === incoming[param]) {
        delete result[key];
      }
    }
    if (
      state.feature &&
      FEATURE_KEYS.every((key) => current[URL_PARAM[key]] === incoming[URL_PARAM[key]])
    ) {
      for (const key of FEATURE_KEYS) {
        delete result[key];
      }
    }
    return result;
  }

  private viewportMatchesCurrent(viewport: { zoom: number; lat: number; lng: number }): boolean {
    const current = this.mapService.viewport();
    return (
      !!current &&
      Math.abs(current.zoom - viewport.zoom) < VIEWPORT_ZOOM_EPSILON &&
      Math.abs(current.lat - viewport.lat) < VIEWPORT_COORD_EPSILON &&
      Math.abs(current.lng - viewport.lng) < VIEWPORT_COORD_EPSILON
    );
  }

  /** True when the loaded project is the one the last ingested URL points to. */
  private targetMatchesLoadedProject(): boolean {
    const project = this.projectService.project();
    if (!project) {
      return false;
    }
    const target = this.pendingTarget();
    if (target?.projectId !== undefined) {
      return project.id === target.projectId;
    }
    if (target?.shareKey !== undefined) {
      // Logged-in users get share-key links translated to project_id first (DashboardComponent).
      return !this.session.isAuthenticated() && this.session.shareKey() === target.shareKey;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  private canWrite(): boolean {
    return this.targetMatchesLoadedProject() && this.filterConfig.isProjectFilterStateReady();
  }

  private scheduleWrite(): void {
    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer);
    }
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.writeNow();
    }, WRITE_DEBOUNCE_MS);
  }

  private writeNow(): void {
    if (!this.isDashboardTree(this.router.parseUrl(this.router.url)) || this.router.currentNavigation()) {
      return;
    }
    if (!this.canWrite()) {
      return;
    }

    const state = this.mergeWithPending(this.collectCurrentState(), this.pending());
    const tree = this.router.createUrlTree(['/dashboard'], {
      queryParams: serializeDashboardUrlState(state),
      queryParamsHandling: 'merge',
    });
    const url = this.router.serializeUrl(tree);
    if (url === this.router.url) {
      return;
    }
    void this.router.navigateByUrl(tree, { replaceUrl: true, state: { [WRITE_MARKER]: true } });
  }

  /** Pending values win, so a URL is not overwritten before it has been applied. */
  private mergeWithPending(current: DashboardUrlState, pending: DashboardUrlState): DashboardUrlState {
    const merged: DashboardUrlState = { ...current, ...pending };
    if (pending.feature) {
      merged.featureSide = pending.featureSide;
      merged.feature2 = pending.feature2;
    }
    if (pending.compareProfileIds && pending.diff === undefined) {
      merged.diff = current.diff;
    }
    return merged;
  }

  /** Live view state, with defaults left out so links stay short. */
  private collectCurrentState(): DashboardUrlState {
    const fc = this.filterConfig;
    const state: DashboardUrlState = {
      lang: this.lang(),
      bewertung: fc.selectedBewertung(),
      statsLevel: fc.statsLevel(),
    };

    const viewport = this.mapService.viewport();
    if (viewport) {
      state.viewport = viewport;
    }

    const profileIds = fc.selectedModes();
    if (profileIds.length > 0) {
      state.profileIds = profileIds;
    }

    const compareMode = fc.isMapCompareMode();
    if (compareMode) {
      state.compareProfileIds = fc.rightSelectedModes();
      if (fc.isDifferenceView()) {
        state.diff = true;
      }
    }

    const layer = fc.selectedAdminLevel();
    if (fc.layerMode() === 'manual' && layer) {
      state.layer = layer;
    }

    const quality = fc.selectedQualityBrackets();
    if (!this.isFullSelection(quality, ALL_QUALITY_BRACKETS)) {
      state.qualityBrackets = [...quality];
    }
    const time = fc.selectedTimeBrackets();
    if (!this.isFullSelection(time, this.scoreColors.bracketIds())) {
      state.timeBrackets = [...time];
    }

    if (!fc.isShareKeyOnly()) {
      const regiostars = fc.selectedRegioStars();
      if (!this.isFullSelection(regiostars, fc.allRegioStars().map((r) => r.id), true)) {
        state.regiostarIds = [...regiostars];
      }
      const states = fc.selectedStates();
      if (!this.isFullSelection(states, fc.allStates().map((s) => s.id), true)) {
        state.stateIds = [...states];
      }
    }

    const feature = featureRefFromFeature(this.feature1());
    if (feature) {
      state.feature = feature;
      if (compareMode && this.feature1Side() === 'right') {
        state.featureSide = 'right';
      }
      const feature2 = featureRefFromFeature(this.feature2());
      if (feature2 && !featureRefsEqual(feature, feature2)) {
        state.feature2 = feature2;
      }
    }

    return state;
  }

  /** `emptyMeansAll`: for filters where an empty selection is treated as "everything". */
  private isFullSelection<T>(selected: readonly T[], all: readonly T[], emptyMeansAll = false): boolean {
    if (selected.length === 0) {
      return emptyMeansAll || all.length === 0;
    }
    const set = new Set(selected);
    return all.length === set.size && all.every((item) => set.has(item));
  }

  private isDashboardTree(tree: UrlTree): boolean {
    const segments = tree.root.children['primary']?.segments ?? [];
    return segments.length === 1 && segments[0].path === 'dashboard';
  }
}
