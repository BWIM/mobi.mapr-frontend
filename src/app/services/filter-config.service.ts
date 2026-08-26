import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { Router } from '@angular/router';
import { ProfileService } from './profile.service';
import { ProjectsService } from './project.service';
import { SettingsService } from './settings.service';
import { Map as MapLibreMap } from 'maplibre-gl';
import { MapService, ContentLayerFilters } from './map.service';
import { DashboardSessionService } from './dashboard-session.service';
import { Profile, ProfileOption } from '../interfaces/profile';
import { MatDialog } from '@angular/material/dialog';
import { FilterDialogComponent, FilterDialogData } from '../layout/left/filter-dialog/filter-dialog.component';
import { PersonaService } from './persona.service';
import { RegioStarService } from './regiostar.service';
import { StateService } from './state.service';
import { CategoryService } from './category.service';
import { Persona } from '../interfaces/persona';
import { RegioStar } from '../interfaces/regiostar';
import { Category } from '../interfaces/category';
import { State } from '../interfaces/features';
import { forkJoin } from 'rxjs';
import { ScoreColorsService } from './score-colors.service';

export type QualityBracket = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type TimeBracket = string;
export type AdminLevel = 'state' | 'county' | 'municipality' | 'hexagon';
export type LayerMode = 'auto' | 'manual';

const ALL_QUALITY_BRACKETS: QualityBracket[] = ['A', 'B', 'C', 'D', 'E', 'F'];
const ADMIN_LEVELS: AdminLevel[] = ['state', 'county', 'municipality', 'hexagon'];
const ADMIN_LEVEL_RANK: Record<AdminLevel, number> = {
  state: 0,
  county: 1,
  municipality: 2,
  hexagon: 3,
};
@Injectable({
  providedIn: 'root'
})
export class FilterConfigService {
  private profileService = inject(ProfileService);
  private projectService = inject(ProjectsService);
  private settingsService = inject(SettingsService);
  private mapService = inject(MapService);
  private dashboardSessionService = inject(DashboardSessionService);
  private dialog = inject(MatDialog);
  private personaService = inject(PersonaService);
  private regiostarService = inject(RegioStarService);
  private stateService = inject(StateService);
  private categoryService = inject(CategoryService);
  private scoreColorsService = inject(ScoreColorsService);
  private router = inject(Router);

  // Internal state signals
  private _selectedModes = signal<number[]>([]);
  private _selectedBewertung = signal<'qualitaet' | 'zeit'>('qualitaet');
  private _selectedPersonas = signal<number | null>(null);
  private _selectedRegioStars = signal<number[]>([]);
  private _selectedStates = signal<number[]>([]);
  private _selectedAdminLevel = signal<'state' | 'county' | 'municipality' | 'hexagon' | null>(null);
  private _layerMode = signal<LayerMode>('auto');
  private _currentMapZoom = signal<number>(7);
  private _layerFallbackNoticeNonce = signal<number>(0);
  private _selectedQualityBrackets = signal<QualityBracket[]>([...ALL_QUALITY_BRACKETS]);
  private _selectedTimeBrackets = signal<TimeBracket[]>([]);
  private _isMapCompareMode = signal<boolean>(false);
  private _isDifferenceView = signal<boolean>(false);
  private _pendingMapCompareEnable = signal<boolean>(false);
  private _rightSelectedModes = signal<number[]>([]);
  private _mapLayerRefreshNonce = signal<number>(0);
  private _mapModeTransitionInProgress = signal<boolean>(false);
  private _urlCompareIntent = signal<boolean>(false);
  private _urlCompareProfileIds = signal<number[]>([]);
  private _compareMapsReady = signal<boolean>(false);

  private _allProfiles = signal<Profile[]>([]);
  private _modeOptions = signal<ProfileOption[]>([]);
  private profilesLoading = false;
  private profilesLoadAttempts = 0;
  private readonly maxProfilesLoadAttempts = 3;

  // Filter data
  private _allCategories = signal<Category[]>([]);
  private _allPersonas = signal<Persona[]>([]);
  private _allRegioStars = signal<RegioStar[]>([]);
  private _allStates = signal<State[]>([]);
  
  // Track when filter data is loaded (for initialization order)
  private _isFilterDataLoaded = signal<boolean>(false);
  /** Project id that the loaded filter data belongs to (guards stale async completions). */
  private _filterDataProjectId = signal<number | null>(null);
  /** Bumped on every project switch to invalidate in-flight map work. */
  private projectLoadGeneration = 0;
  
  // Track if URL params have been applied (to prevent re-applying on every effect run)
  private _urlParamsApplied = signal<boolean>(false);
  
  // Track which projects have had filters initialized (to only preselect on first load)
  private _initializedProjectIds = new Set<number>();
  
  // Track if settings have been loaded from localStorage (to distinguish first load from reload)
  private _settingsLoaded = false;

  // Public readonly signals
  readonly selectedModes = this._selectedModes.asReadonly();
  readonly selectedBewertung = this._selectedBewertung.asReadonly();
  readonly selectedPersonas = this._selectedPersonas.asReadonly();
  readonly selectedRegioStars = this._selectedRegioStars.asReadonly();
  readonly selectedStates = this._selectedStates.asReadonly();
  readonly selectedAdminLevel = this._selectedAdminLevel.asReadonly();
  readonly layerMode = this._layerMode.asReadonly();
  readonly currentMapZoom = this._currentMapZoom.asReadonly();
  readonly layerFallbackNoticeNonce = this._layerFallbackNoticeNonce.asReadonly();
  readonly selectedQualityBrackets = this._selectedQualityBrackets.asReadonly();
  readonly selectedTimeBrackets = this._selectedTimeBrackets.asReadonly();
  readonly modeOptions = this._modeOptions.asReadonly();
  readonly allProfiles = this._allProfiles.asReadonly();
  readonly allCategories = this._allCategories.asReadonly();
  /** Categories are used as activities; selection is always "all". */
  readonly allActivities = computed(() =>
    this._allCategories().map(category => ({
      id: category.id,
      name: category.name,
      display_name: category.display_name,
      description: category.description
    }))
  );
  readonly selectedActivities = computed(() => this._allCategories().map(category => category.id));
  readonly allPersonas = this._allPersonas.asReadonly();
  readonly allRegioStars = this._allRegioStars.asReadonly();
  readonly allStates = this._allStates.asReadonly();
  readonly isMapCompareMode = this._isMapCompareMode.asReadonly();
  readonly isDifferenceView = this._isDifferenceView.asReadonly();
  readonly pendingMapCompareEnable = this._pendingMapCompareEnable.asReadonly();
  readonly canUseMapCompare = computed(
    () =>
      this.dashboardSessionService.isAuthenticated() ||
      !!this.projectService.project()?.group
  );
  readonly hasUrlCompareIntent = this._urlCompareIntent.asReadonly();
  readonly compareMapsReady = this._compareMapsReady.asReadonly();
  readonly canConfirmMapCompare = computed(() => {
    if (!this._pendingMapCompareEnable()) {
      return false;
    }
    if (!this.canUseMapCompare()) {
      return false;
    }
    if (!this.projectService.project()) {
      return false;
    }
    if (this._allProfiles().length === 0) {
      return false;
    }
    if (!this._isFilterDataLoaded()) {
      return false;
    }
    if (!this.contentLayerFilters() || !this.rightContentLayerFilters()) {
      return false;
    }
    if (this._selectedModes().length === 0 || this._rightSelectedModes().length === 0) {
      return false;
    }
    return true;
  });
  readonly rightSelectedModes = this._rightSelectedModes.asReadonly();
  readonly isMapModeTransitionInProgress = this._mapModeTransitionInProgress.asReadonly();
  readonly isModeSelectionLocked = computed(
    () => this._mapModeTransitionInProgress() || this.mapService.isMapLoading()
  );

  // Computed signal to check if project is MID (replaces is_mid check)
  // A project is MID if category length != 1 (i.e., 0 or 2+ categories)
  readonly hasCategories = computed(() => this._allCategories().length !== 1);
  readonly isShareKeyOnly = computed(() => this.dashboardSessionService.accessMethod() === 'share_key');
  readonly isRegiostarFilterMode = computed(() => {
    const all = this._allRegioStars();
    const selected = this._selectedRegioStars();
    return all.length > 0 && selected.length > 0 && selected.length < all.length;
  });
  readonly availableAdminLevels = computed<AdminLevel[]>(() => {
    if (!this.isShareKeyOnly()) {
      return [...ADMIN_LEVELS];
    }

    return this.getShareKeySelectableAdminLevels(this.getZoomForAdminLevel());
  });
  readonly effectiveAdminLevel = computed<AdminLevel>(() => {
    if (this._layerMode() === 'manual' && this._selectedAdminLevel()) {
      return this._selectedAdminLevel()!;
    }
    return this.determineDefaultAdminLevel(this.getZoomForAdminLevel(), this.isRegiostarFilterMode());
  });

  readonly groupedRegioStars = computed(() => {
    const regiostars = this._allRegioStars();
    const grouped = new Map<string, RegioStar[]>();
    
    regiostars.forEach(regiostar => {
      const key = (regiostar.class_name?.display_name) || 'Other';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(regiostar);
    });
    
    return Array.from(grouped.entries()).map(([class_name, items]) => ({
      class_name,
      regiostars: items.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    })).sort((a, b) => {
      const aName = a.class_name || '';
      const bName = b.class_name || '';
      return aName.localeCompare(bName);
    });
  });

  /** Sorted selected profile IDs within project base_profiles (API profile_ids). */
  readonly currentProfileIds = computed((): number[] | null => {
    return this.getSelectedBaseProfileIds(this._selectedModes());
  });

  readonly rightCurrentProfileIds = computed((): number[] | null => {
    return this.getSelectedBaseProfileIds(this._rightSelectedModes());
  });

  readonly contentLayerFilters = computed<ContentLayerFilters | null>(() => {
    const profileIds = this.currentProfileIds();
    return this.buildContentLayerFilters(profileIds);
  });

  readonly rightContentLayerFilters = computed<ContentLayerFilters | null>(() => {
    const profileIds = this.rightCurrentProfileIds();
    return this.buildContentLayerFilters(profileIds);
  });

  private buildContentLayerFilters(profileIds: number[] | null): ContentLayerFilters | null {
    if (!profileIds || profileIds.length === 0) {
      return null;
    }

    const featureType: 'index' | 'score' = this._selectedBewertung() === 'zeit' ? 'score' : 'index';
    const selectedAdminLevel = this.effectiveAdminLevel();

    return {
      profile_ids: profileIds,
      feature_type: featureType,
      state_ids: this.resolveIdsForTileFilter(this._selectedStates(), () =>
        this._allStates().map(s => s.id)
      ),
      regiostar_ids: this.resolveIdsForTileFilter(this._selectedRegioStars(), () =>
        this._allRegioStars().map(r => r.id)
      ),
      admin_level: selectedAdminLevel,
      selected_quality_brackets: [...this._selectedQualityBrackets()],
      selected_time_brackets: [...this._selectedTimeBrackets()]
    };
  }

  /**
   * Empty or "all selected" both mean unfiltered tiles — omit the param so
   * preselect-all after catalog load does not force a second tile fetch.
   * allIds are read lazily so an empty selection does not depend on catalog load.
   */
  private resolveIdsForTileFilter(
    selected: number[],
    getAllIds: () => number[]
  ): number[] | undefined {
    if (selected.length === 0) {
      return undefined;
    }
    const allIds = getAllIds();
    if (allIds.length > 0 && selected.length === allIds.length) {
      const allSet = new Set(allIds);
      if (selected.every(id => allSet.has(id))) {
        return undefined;
      }
    }
    return selected;
  }

  private getSelectedBaseProfileIds(selectedIds: number[]): number[] | null {
    const project = this.projectService.project();

    if (!project || !project.base_profiles || selectedIds.length === 0) {
      return null;
    }

    const allowed = new Set(project.base_profiles);
    const selectedProfileIds = [...new Set(selectedIds.filter(id => allowed.has(id)))]
      .sort((a, b) => a - b);

    return selectedProfileIds.length > 0 ? selectedProfileIds : null;
  }

  // Fallback Material icon names when a profile has no icon_name
  private readonly modeIcons: { [key: string]: string } = {
    'pedestrian': 'directions_walk',
    'bicycle': 'directions_bike',
    'car': 'directions_car',
    'bus': 'directions_bus',
    'transit': 'train',
    'tram': 'tram',
    'default': 'directions'
  };

  // Guard to prevent concurrent updateMapLayer calls
  private updateMapLayerInProgress = false;
  /** Set when a single-map update was skipped; flushed after the in-flight update completes. */
  private mapUpdateRetryNeeded = false;
  /** Set when a compare update was skipped; flushed after the in-flight update completes. */
  private compareUpdateRetryNeeded = false;
  private compareLayerSyncRetries = 0;
  private compareLayerSyncScheduled = false;
  private readonly maxCompareLayerSyncRetries = 5;

  constructor() {
    // Initialize data loading
    this.loadProfilesAndModes();

    // Track previous project ID to detect project changes
    let previousProjectId: number | null = null;

    // React to project changes to load all filter data and update mode selection
    effect(() => {
      const currentProject = this.projectService.project();
      if (currentProject) {
        // Reset filters when loading a (new) project so selections come from project data,
        // not from previously stored localStorage settings.
        if (previousProjectId === null || previousProjectId !== currentProject.id) {
          // Force all advanced filter selections to be re-preselected from freshly loaded project data.
          // validateFilterSelections preselects "all" when these signals are empty / null.
          this._selectedModes.set([]);
          this._rightSelectedModes.set([]);
          this._isMapCompareMode.set(false);
          this._isDifferenceView.set(false);
          this._pendingMapCompareEnable.set(false);
          this._compareMapsReady.set(false);
          this._selectedPersonas.set(null);
          this._selectedRegioStars.set([]);
          this._selectedStates.set([]);

          // "Automatic" admin level by default on project load.
          this._selectedAdminLevel.set(null);
          this._layerMode.set('auto');
          this._selectedQualityBrackets.set([...ALL_QUALITY_BRACKETS]);
          this._selectedTimeBrackets.set([...this.scoreColorsService.bracketIds()]);

          // Reset filter-data gating so the map waits for the new project's filter options.
          this._isFilterDataLoaded.set(false);
          this._filterDataProjectId.set(null);
          this.projectLoadGeneration++;
          this.updateMapLayerInProgress = false;
          this.compareUpdateRetryNeeded = false;
          this.mapUpdateRetryNeeded = false;

          // Allow URL params to be re-applied when switching projects.
          this._urlParamsApplied.set(false);

          // Remove old project from initialized set (new project needs initialization)
          if (previousProjectId !== null) {
            this._initializedProjectIds.delete(previousProjectId);
          }

          // If profiles are already loaded, re-apply URL params now.
          if (this._allProfiles().length > 0) {
            this.applyUrlParams();
          }
        }
        previousProjectId = currentProject.id;

        // Load all filter data when project is loaded
        this.loadAllFilterData(currentProject.id);
        
        // Update mode selection if profiles are already loaded
        // This will update mode options and validate selection (including URL params)
        if (this._allProfiles().length > 0) {
          this.updateModeSelection(currentProject.base_profiles);
          this.tryEnableCompareFromUrl();
        } else {
          // Profiles may have failed or not finished on cold start — retry so modes/circles can resolve.
          this.loadProfilesAndModes();
        }
      } else {
        // Reset when project is cleared
        previousProjectId = null;
        this._isFilterDataLoaded.set(false);
        this._filterDataProjectId.set(null);
        this.projectLoadGeneration++;
        this.updateMapLayerInProgress = false;
        this.compareUpdateRetryNeeded = false;
        this.mapUpdateRetryNeeded = false;
        this._compareMapsReady.set(false);
        // Reset URL params applied flag when project is cleared
        this._urlParamsApplied.set(false);
        // Clear initialized project IDs when project is cleared
        this._initializedProjectIds.clear();
      }
    });

    effect(() => {
      this.dashboardSessionService.accessMethod();
      this.tryEnableCompareFromUrl();
    });

    effect(() => {
      this.dashboardSessionService.accessMethod();
      this._currentMapZoom();
      this._layerMode();
      this._selectedRegioStars();
      this._allRegioStars();
      this.syncLayerForZoomInternal({ emitFallbackNotice: false, persist: false });
    });

    // React to filter changes and update map
    let previousFilters: ContentLayerFilters | null = null;
    let previousLeftFilters: ContentLayerFilters | null = null;
    let previousRightFilters: ContentLayerFilters | null = null;
    let isInitialLoad = true;
    let compareInitialLoad = true;
    let differenceInitialLoad = true;
    let wasCompareOrDifference = false;
    effect(() => {
      const compareMode = this._isMapCompareMode();
      const differenceView = this._isDifferenceView();
      const filters = this.contentLayerFilters();
      const rightFilters = this.rightContentLayerFilters();
      const compareMapsReady = this._compareMapsReady();
      this._mapLayerRefreshNonce();
      this.effectiveAdminLevel();
      this._currentMapZoom();
      this._layerMode();
      this._selectedAdminLevel();

      if (compareMode && differenceView) {
        wasCompareOrDifference = true;
        this._selectedModes();
        this._rightSelectedModes();
        this._selectedQualityBrackets();
        this._selectedTimeBrackets();
        compareInitialLoad = true;
        if (this.mapService.hasCompareMaps()) {
          differenceInitialLoad = true;
          previousLeftFilters = null;
          previousRightFilters = null;
        }

        const scheduleRetryIfNeeded = () => {
          if (differenceInitialLoad) {
            this.scheduleCompareLayerSync();
          }
        };

        if (this._mapModeTransitionInProgress()) {
          scheduleRetryIfNeeded();
          return;
        }
        if (!filters || !rightFilters) {
          scheduleRetryIfNeeded();
          return;
        }
        if (!compareMapsReady || this.mapService.hasCompareMaps()) {
          scheduleRetryIfNeeded();
          return;
        }

        const diffMap = this.mapService.getMap();
        if (!diffMap) {
          scheduleRetryIfNeeded();
          return;
        }
        if (this.updateMapLayerInProgress) {
          scheduleRetryIfNeeded();
          return;
        }

        const leftChanged = differenceInitialLoad || this.filtersDiffer(previousLeftFilters, filters);
        const rightChanged = differenceInitialLoad || this.filtersDiffer(previousRightFilters, rightFilters);

        if (!leftChanged && !rightChanged) {
          if (differenceInitialLoad && !this.mapService.hasDifferenceLayers(diffMap)) {
            scheduleRetryIfNeeded();
          }
          return;
        }

        const leftFullReload =
          leftChanged &&
          (differenceInitialLoad || this.needsContentLayerFullReload(previousLeftFilters, filters));
        const rightFullReload =
          rightChanged &&
          (differenceInitialLoad ||
            this.needsContentLayerFullReload(previousRightFilters, rightFilters));
        const fullReload = differenceInitialLoad || leftFullReload || rightFullReload;

        void this.updateDifferenceMapLayers(filters, rightFilters, fullReload).then((applied) => {
          if (applied && this.mapService.hasDifferenceLayers(diffMap)) {
            previousLeftFilters = this.cloneContentLayerFilters(filters);
            previousRightFilters = this.cloneContentLayerFilters(rightFilters);
            differenceInitialLoad = false;
            this.compareLayerSyncRetries = 0;
          } else if (differenceInitialLoad) {
            this.scheduleCompareLayerSync();
          }
          if (this.compareUpdateRetryNeeded) {
            this.compareUpdateRetryNeeded = false;
            this.scheduleCompareLayerSync();
          }
        }).catch((error) => {
          console.error('Error in updateDifferenceMapLayers:', error);
          if (differenceInitialLoad) {
            this.scheduleCompareLayerSync();
          }
        });
        return;
      }

      if (compareMode) {
        wasCompareOrDifference = true;
        differenceInitialLoad = true;
        if (!this.mapService.hasCompareMaps()) {
          compareInitialLoad = true;
          previousLeftFilters = null;
          previousRightFilters = null;
        }
        // Explicitly track mode selections so side-specific updates always re-run.
        this._selectedModes();
        this._rightSelectedModes();

        const scheduleRetryIfNeeded = () => {
          if (compareInitialLoad) {
            this.scheduleCompareLayerSync();
          }
        };

        if (this._mapModeTransitionInProgress()) {
          scheduleRetryIfNeeded();
          return;
        }
        if (!filters || !rightFilters) {
          scheduleRetryIfNeeded();
          return;
        }
        if (!compareMapsReady || !this.mapService.hasCompareMaps()) {
          scheduleRetryIfNeeded();
          return;
        }

        const leftMap = this.mapService.getMap();
        const rightMap = this.mapService.getCompareRightMap();
        if (!leftMap || !rightMap) {
          scheduleRetryIfNeeded();
          return;
        }
        if (this.updateMapLayerInProgress) {
          scheduleRetryIfNeeded();
          return;
        }

        const leftChanged = compareInitialLoad || this.filtersDiffer(previousLeftFilters, filters);
        const rightChanged = compareInitialLoad || this.filtersDiffer(previousRightFilters, rightFilters);
        const leftFullReload = leftChanged && (
          compareInitialLoad ||
          this.needsContentLayerFullReload(previousLeftFilters, filters)
        );
        const rightFullReload = rightChanged && (
          compareInitialLoad ||
          this.needsContentLayerFullReload(previousRightFilters, rightFilters)
        );
        const onlyLeftChanged = leftChanged && !rightChanged;
        const onlyRightChanged = rightChanged && !leftChanged;

        if (!leftChanged && !rightChanged) {
          if (compareInitialLoad && (!this.mapHasContentLayer(leftMap) || !this.mapHasContentLayer(rightMap))) {
            scheduleRetryIfNeeded();
          }
          return;
        }

        void this.updateCompareMapLayers(
          filters,
          rightFilters,
          leftFullReload,
          rightFullReload,
          onlyLeftChanged,
          onlyRightChanged,
          leftChanged,
          rightChanged
        ).then(applied => {
          const leftOk = this.mapHasContentLayer(leftMap);
          const rightOk = this.mapHasContentLayer(rightMap);

          if (applied && leftOk && rightOk) {
            previousLeftFilters = this.cloneContentLayerFilters(filters);
            previousRightFilters = this.cloneContentLayerFilters(rightFilters);
            compareInitialLoad = false;
            this.compareLayerSyncRetries = 0;
          } else if (compareInitialLoad) {
            this.scheduleCompareLayerSync();
          }
          if (this.compareUpdateRetryNeeded) {
            this.compareUpdateRetryNeeded = false;
            this.scheduleCompareLayerSync();
          }
        }).catch(error => {
          console.error('Error in updateCompareMapLayers:', error);
          if (compareInitialLoad) {
            this.scheduleCompareLayerSync();
          }
        });
        return;
      }

      previousLeftFilters = null;
      previousRightFilters = null;
      compareInitialLoad = true;
      differenceInitialLoad = true;
      this.compareLayerSyncRetries = 0;
      if (wasCompareOrDifference) {
        isInitialLoad = true;
        wasCompareOrDifference = false;
      }

      if (filters) {
        if (this._mapModeTransitionInProgress()) {
          return;
        }
        if (this.updateMapLayerInProgress) {
          if (!previousFilters || this.filtersDiffer(previousFilters, filters)) {
            this.mapUpdateRetryNeeded = true;
          }
          return;
        }

        // Persona is an analytics overlay only — do not reload baked map tiles.
        if (previousFilters && !this.filtersDiffer(previousFilters, filters)) {
          previousFilters = this.cloneContentLayerFilters(filters);
          return;
        }

        const adminLevelChanged =
          previousFilters !== null && previousFilters.admin_level !== filters.admin_level;
        const isFullReload = isInitialLoad || adminLevelChanged;
        const wasInitialLoad = isInitialLoad;
        // Snapshot before await so catalog preselect-all (same tile URL) does not queue a retry.
        previousFilters = this.cloneContentLayerFilters(filters);

        void this.updateMapLayer(filters, isFullReload, false).then(applied => {
          if (!applied) {
            if (wasInitialLoad) {
              previousFilters = null;
              isInitialLoad = true;
            }
            return;
          }
          const latestFilters = this.contentLayerFilters();
          if (latestFilters) {
            previousFilters = this.cloneContentLayerFilters(latestFilters);
          }
          if (wasInitialLoad) {
            isInitialLoad = false;
          }
        }).catch(error => {
          if (wasInitialLoad) {
            previousFilters = null;
            isInitialLoad = true;
          }
          if (isFullReload) {
            console.error('Error in updateMapLayer (full reload):', error);
          } else {
            console.error('Error in updateMapLayer (tile update):', error);
          }
        });
      } else {
        this.mapService.removeContentLayer();
        previousFilters = null;
        isInitialLoad = true;
      }
    });

    effect(() => {
      if (!this.canUseMapCompare()) {
        this._pendingMapCompareEnable.set(false);
        if (this._isMapCompareMode()) {
          this._mapModeTransitionInProgress.set(true);
          this._isDifferenceView.set(false);
          this._isMapCompareMode.set(false);
        }
      }
    });

    // React to persona changes and deselect car mode if persona cannot use car
    effect(() => {
      const selectedPersonaId = this._selectedPersonas();
      const allPersonas = this._allPersonas();
      const selectedModes = this._selectedModes();
      const rightSelectedModes = this._rightSelectedModes();

      if (selectedPersonaId !== null) {
        const selectedPersona = allPersonas.find(p => p.id === selectedPersonaId);

        if (selectedPersona && selectedPersona.can_use_car === false) {
          const carProfileIds = this.getCarProfileIds();

          if (carProfileIds.some(id => selectedModes.includes(id))) {
            this._selectedModes.set(selectedModes.filter(id => !carProfileIds.includes(id)));
            this.validateModeSelection();
            this.saveSettings();
          }

          if (carProfileIds.some(id => rightSelectedModes.includes(id))) {
            this._rightSelectedModes.set(rightSelectedModes.filter(id => !carProfileIds.includes(id)));
            this.validateRightModeSelection();
          }
        }
      }
    });

    // Load settings from localStorage
    this.loadSettings();
  }

  /**
   * Load profiles and modes from API
   */
  private loadProfilesAndModes(): void {
    if (this.profilesLoading || this._allProfiles().length > 0) {
      return;
    }
    if (this.profilesLoadAttempts >= this.maxProfilesLoadAttempts) {
      return;
    }

    this.profilesLoading = true;
    this.profilesLoadAttempts++;
    this.profileService.getProfiles(1, 1000).subscribe({
      next: (response) => {
        this.profilesLoading = false;
        this._allProfiles.set(response.results);
        this.applyUrlParams();
        this.updateModeSelectionFromProject();
        this.validateModeSelection();
      },
      error: (error) => {
        this.profilesLoading = false;
        console.error('Error loading profiles:', error);
        // Retry shortly if a project is already waiting on profile_ids (cold-start auth races).
        if (
          this.projectService.project() &&
          this._allProfiles().length === 0 &&
          this.profilesLoadAttempts < this.maxProfilesLoadAttempts
        ) {
          setTimeout(() => this.loadProfilesAndModes(), 500);
        }
      }
    });
  }

  private parseProfileIdsParam(param: string): number[] {
    const ids = param
      .split(',')
      .map(s => Number(s.trim()))
      .filter(n => !isNaN(n));
    if (ids.length === 0) {
      return [];
    }
    const knownIds = new Set(this._allProfiles().map(p => p.id));
    return [...new Set(ids.filter(id => knownIds.has(id)))];
  }

  /**
   * Apply URL parameters for profile_ids, compare_profile_ids, and bewertung
   * Called after profiles are loaded
   */
  private applyUrlParams(): void {
    // Only apply URL params once
    if (this._urlParamsApplied()) {
      return;
    }

    if (this._allProfiles().length === 0) {
      return;
    }

    // Read URL query parameters
    const urlTree = this.router.parseUrl(this.router.url);
    const queryParams = urlTree.queryParams;

    // Apply bewertung parameter
    if (queryParams['bewertung']) {
      const bewertung = queryParams['bewertung'];
      if (bewertung === 'zeit' || bewertung === 'qualitaet') {
        this._selectedBewertung.set(bewertung);
        this.saveSettings();
      }
    }

    // Apply profile_ids parameter (comma-separated integers)
    const profileIdsParam = queryParams['profile_ids'];
    if (profileIdsParam && typeof profileIdsParam === 'string') {
      const profileIds = this.parseProfileIdsParam(profileIdsParam);
      if (profileIds.length > 0) {
        this._selectedModes.set(profileIds);
        this.saveSettings();
        const currentProject = this.projectService.project();
        if (currentProject && currentProject.base_profiles) {
          this.validateModeSelection();
        }
      }
    }

    this.parseUrlCompareIntent(queryParams);

    // Apply legend_brackets parameter (comma-separated values)
    // If the parameter is missing, default to "all selected".
    const legendBracketsParam = queryParams['legend_brackets'];
    if (legendBracketsParam && typeof legendBracketsParam === 'string') {
      const values = legendBracketsParam
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);

      const qualityValues = values.filter((v): v is QualityBracket => ALL_QUALITY_BRACKETS.includes(v as QualityBracket));
      const availableTimeBrackets = this.scoreColorsService.bracketIds();
      const timeValues = values.filter((v): v is TimeBracket => availableTimeBrackets.includes(v));

      if (qualityValues.length > 0) {
        this._selectedQualityBrackets.set([...new Set(qualityValues)]);
      }
      if (timeValues.length > 0) {
        this._selectedTimeBrackets.set([...new Set(timeValues)]);
      }
      this.saveSettings();
    } else {
      this._selectedQualityBrackets.set([...ALL_QUALITY_BRACKETS]);
      this._selectedTimeBrackets.set([...this.scoreColorsService.bracketIds()]);
      this.saveSettings();
    }

    // Mark URL params as applied
    this._urlParamsApplied.set(true);

    this.tryEnableCompareFromUrl();
  }

  private parseUrlCompareIntent(queryParams?: Record<string, unknown>): void {
    if (this._allProfiles().length === 0) {
      return;
    }

    const params = queryParams ?? this.router.parseUrl(this.router.url).queryParams;
    const compareProfileIdsParam = params['compare_profile_ids'];
    if (compareProfileIdsParam && typeof compareProfileIdsParam === 'string') {
      const compareProfileIds = this.parseProfileIdsParam(compareProfileIdsParam);
      if (compareProfileIds.length > 0) {
        this._urlCompareIntent.set(true);
        this._urlCompareProfileIds.set(compareProfileIds);
      }
    }
  }

  private tryEnableCompareFromUrl(): void {
    if (!this._urlCompareIntent() || !this.canUseMapCompare()) {
      return;
    }

    const project = this.projectService.project();
    if (!project || this._allProfiles().length === 0) {
      return;
    }

    const profileIds = this._urlCompareProfileIds();
    if (profileIds.length === 0) {
      return;
    }

    if (this._isMapCompareMode()) {
      return;
    }

    if (this._pendingMapCompareEnable()) {
      this._rightSelectedModes.set(profileIds);
      this.validateRightModeSelection();
      return;
    }

    this.requestEnableMapCompare(profileIds);
  }

  private scheduleCompareLayerSync(): void {
    if (this.compareLayerSyncScheduled || this.compareLayerSyncRetries >= this.maxCompareLayerSyncRetries) {
      return;
    }
    this.compareLayerSyncScheduled = true;
    this.compareLayerSyncRetries++;
    requestAnimationFrame(() => {
      this.compareLayerSyncScheduled = false;
      this.refreshMapLayers();
    });
  }

  /**
   * Load all filter data (RegioStars, States, Categories and Personas)
   * Always tries to load categories - if none are returned, the project doesn't support categories
   * For share_key-only users, skip loading and use defaults (empty arrays = undefined in API = all items)
   * @param projectId - The current project ID to track initialization
   */
  private loadAllFilterData(projectId?: number): void {
    const loadGeneration = this.projectLoadGeneration;
    const expectedProjectId = projectId;
    const isShareKeyOnly = this.dashboardSessionService.accessMethod() === 'share_key';
    
    // Always load RegioStars, States, Categories and Personas (including for share_key users so they can see the data)
    const regiostars$ = this.regiostarService.getRegioStars(1, 100);
    const states$ = this.stateService.getStates(1, 100);
    const categories$ = this.categoryService.getCategories(1, 100);
    const personas$ = this.personaService.getPersonas(1, 100);

    forkJoin({
      regiostars: regiostars$,
      states: states$,
      categories: categories$,
      personas: personas$
    }).subscribe({
      next: (responses) => {
        if (!this.isProjectLoadCurrent(loadGeneration, expectedProjectId)) {
          return;
        }

        this._allRegioStars.set(responses.regiostars.results);
        this._allStates.set(responses.states.results);
        this._allCategories.set(responses.categories.results);
        this._allPersonas.set(responses.personas.results);

        // For share_key users, always preselect all items (they can't modify anyway)
        if (isShareKeyOnly) {
          this.validateSelectedPersona();
          this.preselectAllRegioStars();
          this.preselectAllStates();
          
          if (expectedProjectId !== undefined) {
            this._initializedProjectIds.add(expectedProjectId);
          }
          this.markFilterDataLoadedForProject(expectedProjectId);
          return;
        }

        // Check if this is first load (not initialized) and if settings were loaded from localStorage
        const isFirstLoad = projectId !== undefined && !this._initializedProjectIds.has(projectId);
        const hasLoadedSettings = this._settingsLoaded;
        
        if (isFirstLoad && !hasLoadedSettings) {
          // First load with no saved settings - preselect all items
          this.validateSelectedPersona();
          this.preselectAllRegioStars();
          this.preselectAllStates();
          
          // Mark this project as initialized
          this._initializedProjectIds.add(projectId);
        } else {
          // Either not first load or settings were loaded - validate existing selections
          this.validateFilterSelections();
          // Mark as initialized if not already
          if (projectId !== undefined) {
            this._initializedProjectIds.add(projectId);
          }
        }
        
        this.markFilterDataLoadedForProject(expectedProjectId);
      },
      error: (error) => {
        console.error('Error loading filter data:', error);
        if (!this.isProjectLoadCurrent(loadGeneration, expectedProjectId)) {
          return;
        }
        // Still mark as loaded to allow the flow to continue
        this.markFilterDataLoadedForProject(expectedProjectId);
      }
    });
  }

  private isProjectLoadCurrent(loadGeneration: number, expectedProjectId?: number): boolean {
    if (loadGeneration !== this.projectLoadGeneration) {
      return false;
    }

    if (expectedProjectId === undefined) {
      return true;
    }

    return this.projectService.project()?.id === expectedProjectId;
  }

  private markFilterDataLoadedForProject(projectId?: number): void {
    const currentProjectId = this.projectService.project()?.id;
    if (projectId !== undefined && currentProjectId !== projectId) {
      return;
    }

    this._filterDataProjectId.set(currentProjectId ?? null);
    this._isFilterDataLoaded.set(true);
  }

  /**
   * Keep a selected persona only if it exists in the loaded list.
   * Never invent a default — omitted persona uses the baked project mix.
   */
  private validateSelectedPersona(): void {
    const currentSelection = this._selectedPersonas();
    if (currentSelection === null) {
      return;
    }
    const personaExists = this._allPersonas().some(p => p.id === currentSelection);
    if (!personaExists) {
      this._selectedPersonas.set(null);
    }
  }

  /**
   * Preselect all regiostars
   */
  private preselectAllRegioStars(): void {
    const allRegioStarIds = this._allRegioStars().map(r => r.id);
    this._selectedRegioStars.set([...allRegioStarIds]);
  }

  /**
   * Preselect all states
   */
  private preselectAllStates(): void {
    const allStateIds = this._allStates().map(s => s.id);
    this._selectedStates.set([...allStateIds]);
  }

  /**
   * Validate existing filter selections against loaded data
   * Removes invalid selections but preserves valid ones
   * If selections are empty, preselects all available items
   */
  private validateFilterSelections(): void {
    this.syncIdSelection(
      this._selectedRegioStars(),
      new Set(this._allRegioStars().map(r => r.id)),
      ids => this._selectedRegioStars.set(ids)
    );
    this.syncIdSelection(
      this._selectedStates(),
      new Set(this._allStates().map(s => s.id)),
      ids => this._selectedStates.set(ids)
    );
    this.validateSelectedPersona();
  }

  /**
   * Update profile options based on project base_profiles
   */
  private updateModeSelectionFromProject(): void {
    const currentProject = this.projectService.project();
    if (currentProject && currentProject.base_profiles) {
      this.updateModeSelection(currentProject.base_profiles);
    }
  }

  /**
   * Update available profile options and validate selection
   */
  private updateModeSelection(baseProfiles: number[]): void {
    if (!baseProfiles || baseProfiles.length === 0 || this._allProfiles().length === 0) {
      this._modeOptions.set([]);
      return;
    }

    const profilesById = new Map(this._allProfiles().map(profile => [profile.id, profile]));
    const options: ProfileOption[] = [];

    baseProfiles.forEach(profileId => {
      const profile = profilesById.get(profileId);
      if (!profile) {
        return;
      }
      const modeName = profile.mode?.name ?? '';
      options.push({
        id: profile.id,
        name: profile.name,
        display_name: profile.display_name,
        icon: profile.icon_name
          || profile.mode?.icon_name
          || this.modeIcons[modeName.toLowerCase()]
          || this.modeIcons['default'],
        modeName
      });
    });

    this._modeOptions.set(options);

    this.validateModeSelection();
    this.validateRightModeSelection();
  }

  private getProfileIdsInProject(): Set<number> {
    const currentProject = this.projectService.project();
    const profileIds = new Set<number>();
    if (!currentProject?.base_profiles) {
      return profileIds;
    }

    const knownIds = new Set(this._allProfiles().map(p => p.id));
    currentProject.base_profiles.forEach(profileId => {
      if (knownIds.has(profileId)) {
        profileIds.add(profileId);
      }
    });
    return profileIds;
  }

  private getCarProfileIds(): number[] {
    return this._allProfiles()
      .filter(profile => profile.mode?.name.toLowerCase() === 'car')
      .map(profile => profile.id);
  }

  private syncIdSelection(
    currentIds: number[],
    allowedIds: Set<number>,
    setter: (ids: number[]) => void
  ): void {
    if (allowedIds.size === 0) {
      return;
    }

    if (currentIds.length === 0) {
      setter(Array.from(allowedIds));
      return;
    }

    const validIds = currentIds.filter(id => allowedIds.has(id));
    if (validIds.length === 0) {
      setter(Array.from(allowedIds));
    } else if (validIds.length !== currentIds.length) {
      setter(validIds);
    }
  }

  /**
   * Validate and update profile selection against available project profiles
   */
  private validateModeSelection(): void {
    this.syncIdSelection(this._selectedModes(), this.getProfileIdsInProject(), ids => this._selectedModes.set(ids));
  }

  private validateRightModeSelection(): void {
    this.syncIdSelection(this._rightSelectedModes(), this.getProfileIdsInProject(), ids => this._rightSelectedModes.set(ids));
  }

  /**
   * Toggle profile selection. At least one profile must remain selected.
   */
  toggleMode(modeId: number): void {
    const currentModes = this._selectedModes();
    const index = currentModes.indexOf(modeId);
    if (index > -1) {
      if (currentModes.length === 1) {
        return;
      }
      this._selectedModes.set(currentModes.filter(id => id !== modeId));
    } else {
      this._selectedModes.set([...currentModes, modeId]);
    }
    this.saveSettings();
  }

  /**
   * True when this mode is selected and it is the only selected mode (cannot deselect).
   */
  isOnlySelectedMode(modeId: number): boolean {
    const modes = this._selectedModes();
    return modes.length === 1 && modes.includes(modeId);
  }

  /**
   * Check if mode is selected
   */
  isModeSelected(modeId: number): boolean {
    return this._selectedModes().includes(modeId);
  }

  requestEnableMapCompare(rightModeIds?: number[]): void {
    if (!this.canUseMapCompare() || this._isMapCompareMode() || this._pendingMapCompareEnable()) {
      return;
    }

    if (rightModeIds?.length) {
      this._rightSelectedModes.set(rightModeIds);
    } else {
      this._rightSelectedModes.set([...this._selectedModes()]);
    }
    this.validateRightModeSelection();
    this._pendingMapCompareEnable.set(true);
  }

  confirmEnableMapCompare(): void {
    if (!this._pendingMapCompareEnable()) {
      return;
    }
    this._pendingMapCompareEnable.set(false);
    this._isMapCompareMode.set(true);
  }

  toggleMapCompare(): void {
    if (!this.canUseMapCompare()) {
      return;
    }

    if (this._isMapCompareMode()) {
      this._mapModeTransitionInProgress.set(true);
      this._pendingMapCompareEnable.set(false);
      this._isDifferenceView.set(false);
      this._isMapCompareMode.set(false);
      this._urlCompareIntent.set(false);
      this._urlCompareProfileIds.set([]);
      this.clearCompareProfileIdsFromUrl();
      return;
    }

    this.requestEnableMapCompare();
  }

  toggleDifferenceView(): void {
    if (!this._isMapCompareMode()) {
      return;
    }
    this._mapModeTransitionInProgress.set(true);
    this._compareMapsReady.set(false);
    this.mapService.unbindDifferenceSync();
    this._isDifferenceView.update((value) => !value);
  }

  private clearCompareProfileIdsFromUrl(): void {
    const urlTree = this.router.parseUrl(this.router.url);
    if (!urlTree.queryParams['compare_profile_ids']) {
      return;
    }
    const { compare_profile_ids: _, ...remaining } = urlTree.queryParams;
    void this.router.navigate([], {
      queryParams: remaining,
      replaceUrl: true,
    });
  }

  setMapModeTransitionInProgress(inProgress: boolean): void {
    this._mapModeTransitionInProgress.set(inProgress);
  }

  setCompareMapsReady(ready: boolean): void {
    this._compareMapsReady.set(ready);
    if (ready) {
      this.refreshMapLayers();
    }
  }

  resetMapLayerUpdateState(): void {
    this.updateMapLayerInProgress = false;
    this.mapUpdateRetryNeeded = false;
  }

  refreshMapLayers(): void {
    this._mapLayerRefreshNonce.update(value => value + 1);
  }

  toggleRightMode(modeId: number): void {
    const currentModes = this._rightSelectedModes();
    const index = currentModes.indexOf(modeId);
    if (index > -1) {
      if (currentModes.length === 1) {
        return;
      }
      this._rightSelectedModes.set(currentModes.filter(id => id !== modeId));
    } else {
      this._rightSelectedModes.set([...currentModes, modeId]);
    }
  }

  isRightOnlySelectedMode(modeId: number): boolean {
    const modes = this._rightSelectedModes();
    return modes.length === 1 && modes.includes(modeId);
  }

  isRightModeSelected(modeId: number): boolean {
    return this._rightSelectedModes().includes(modeId);
  }

  /**
   * Check if a profile is disabled based on persona selection
   */
  isModeDisabled(profileId: number): boolean {
    const selectedPersonaId = this._selectedPersonas();
    if (selectedPersonaId === null) {
      return false;
    }
    
    const selectedPersona = this._allPersonas().find(p => p.id === selectedPersonaId);
    if (!selectedPersona) {
      return false;
    }

    const profile = this._allProfiles().find(p => p.id === profileId);
    if (profile?.mode?.name.toLowerCase() === 'car') {
      return selectedPersona.can_use_car === false;
    }
    
    return false;
  }

  /**
   * Set mobility evaluation (bewertung)
   */
  setBewertung(bewertung: 'qualitaet' | 'zeit'): void {
    this._selectedBewertung.set(bewertung);
    this.saveSettings();
  }

  toggleQualityBracket(bracket: QualityBracket): void {
    const current = this._selectedQualityBrackets();
    if (current.includes(bracket)) {
      this._selectedQualityBrackets.set(current.filter(b => b !== bracket));
    } else {
      this._selectedQualityBrackets.set([...current, bracket]);
    }
    this.saveSettings();
  }

  toggleTimeBracket(bracket: TimeBracket): void {
    const current = this._selectedTimeBrackets();
    if (current.includes(bracket)) {
      this._selectedTimeBrackets.set(current.filter(b => b !== bracket));
    } else {
      this._selectedTimeBrackets.set([...current, bracket]);
    }
    this.saveSettings();
  }

  isQualityBracketSelected(bracket: QualityBracket): boolean {
    return this._selectedQualityBrackets().includes(bracket);
  }

  isTimeBracketSelected(bracket: TimeBracket): boolean {
    return this._selectedTimeBrackets().includes(bracket);
  }

  setAdminLevel(adminLevel: 'state' | 'county' | 'municipality' | 'hexagon' | null): void {
    if (adminLevel === null) {
      this.setLayerModeAuto();
      return;
    }
    this.selectLayerFromUi(adminLevel);
  }

  setCurrentMapZoom(zoom: number): boolean {
    const previousZoom = this._currentMapZoom();
    const previousEffectiveLevel = this.effectiveAdminLevel();
    this._currentMapZoom.set(zoom);
    const fallbackTriggered = this.syncLayerForZoom(previousZoom);

    const effectiveLevelChanged = this.effectiveAdminLevel() !== previousEffectiveLevel;
    const roundedZoomChanged = Math.round(zoom) !== Math.round(previousZoom);
    if (effectiveLevelChanged || roundedZoomChanged) {
      this.refreshMapLayers();
    }

    return fallbackTriggered;
  }

  selectLayerFromUi(adminLevel: AdminLevel): void {
    if (!this.availableAdminLevels().includes(adminLevel)) {
      return;
    }

    if (this._layerMode() === 'manual' && this._selectedAdminLevel() === adminLevel) {
      this.setLayerModeAuto();
      return;
    }

    this._layerMode.set('manual');
    this._selectedAdminLevel.set(adminLevel);
    this.saveSettings();
    this.refreshMapLayers();
  }

  setLayerModeAuto(): void {
    this._layerMode.set('auto');
    this._selectedAdminLevel.set(null);
    this.syncLayerForZoomInternal({ emitFallbackNotice: false, persist: true });
    this.refreshMapLayers();
  }

  syncLayerForZoom(previousZoom?: number): boolean {
    return this.syncLayerForZoomInternal({ emitFallbackNotice: true, persist: true }, previousZoom);
  }

  private syncLayerForZoomInternal(
    options: { emitFallbackNotice: boolean; persist: boolean },
    previousZoom?: number
  ): boolean {
    const availableLevels = this.availableAdminLevels();
    const currentSelected = this._selectedAdminLevel();
    const zoom = this._currentMapZoom();
    const zoomingOut = previousZoom !== undefined && zoom < previousZoom;
    let fallbackTriggered = false;
    let changed = false;

    if (this._layerMode() === 'manual') {
      if (!currentSelected || !availableLevels.includes(currentSelected)) {
        this._layerMode.set('auto');
        this._selectedAdminLevel.set(null);
        fallbackTriggered = true;
        changed = true;
      } else if (zoomingOut) {
        const defaultAtZoom = this.determineDefaultAdminLevel(zoom, this.isRegiostarFilterMode());
        if (this.isAdminLevelCoarserThan(defaultAtZoom, currentSelected)) {
          this._layerMode.set('auto');
          this._selectedAdminLevel.set(null);
          changed = true;
        }
      }
    } else if (currentSelected !== null) {
      this._selectedAdminLevel.set(null);
      changed = true;
    }

    if (fallbackTriggered && options.emitFallbackNotice) {
      this._layerFallbackNoticeNonce.update(value => value + 1);
    }

    if (changed && options.persist) {
      this.saveSettings();
    }

    return fallbackTriggered;
  }

  private isAdminLevelCoarserThan(coarse: AdminLevel, fine: AdminLevel): boolean {
    return ADMIN_LEVEL_RANK[coarse] < ADMIN_LEVEL_RANK[fine];
  }

  /**
   * Share-key users may lock municipality/hexagon one admin level above the automatic layer.
   */
  private getShareKeySelectableAdminLevels(zoom: number): AdminLevel[] {
    const regiostarFilterMode = this.isRegiostarFilterMode();
    const defaultLevel = this.determineDefaultAdminLevel(zoom, regiostarFilterMode);

    if (regiostarFilterMode) {
      const levels: AdminLevel[] = ['municipality'];
      if (defaultLevel === 'municipality' || defaultLevel === 'hexagon') {
        levels.push('hexagon');
      }
      return levels;
    }

    const levels = this.getAdminLevelsUpTo(defaultLevel);
    const nextFiner = this.getNextFinerAdminLevel(defaultLevel);
    if (nextFiner === 'municipality' || nextFiner === 'hexagon') {
      levels.push(nextFiner);
    }
    return [...new Set(levels)];
  }

  private getAdminLevelsUpTo(level: AdminLevel): AdminLevel[] {
    const index = ADMIN_LEVELS.indexOf(level);
    return ADMIN_LEVELS.slice(0, index + 1);
  }

  private getNextFinerAdminLevel(level: AdminLevel): AdminLevel | null {
    const index = ADMIN_LEVELS.indexOf(level);
    if (index < 0 || index >= ADMIN_LEVELS.length - 1) {
      return null;
    }
    return ADMIN_LEVELS[index + 1];
  }

  getAdminLevelDisabledHintKey(adminLevel: AdminLevel): string | null {
    if (this.availableAdminLevels().includes(adminLevel)) {
      return null;
    }

    if (!this.isShareKeyOnly()) {
      return 'map.layerSwitcher.disabledGeneric';
    }

    if (this.isRegiostarFilterMode() && (adminLevel === 'state' || adminLevel === 'county')) {
      return 'map.layerSwitcher.disabledRegiostarFilter';
    }

    if (adminLevel === 'municipality') {
      return 'map.layerSwitcher.disabledEnforceMunicipality';
    }

    if (adminLevel === 'hexagon') {
      return 'map.layerSwitcher.disabledEnforceHexagon';
    }

    if (adminLevel === 'county') {
      return 'map.layerSwitcher.disabledZoom';
    }

    return 'map.layerSwitcher.disabledGeneric';
  }

  /** Mirrors backend `determine_admin_level` when no admin_level override is sent. */
  private determineDefaultAdminLevel(zoom: number, regiostarFilterMode: boolean): AdminLevel {
    const z = Math.round(zoom);
    if (regiostarFilterMode) {
      return z < 9 ? 'municipality' : 'hexagon';
    }
    if (z <= 7) {
      return 'state';
    }
    if (z <= 8) {
      return 'county';
    }
    if (z <= 9) {
      return 'municipality';
    }
    return 'hexagon';
  }

  /**
   * Check if bewertung is selected
   */
  isBewertungSelected(bewertung: 'qualitaet' | 'zeit'): boolean {
    return this._selectedBewertung() === bewertung;
  }

  /**
   * Open filter dialog for advanced filters
   * Disabled for share_key-only users
   */
  openFilterDialog(): void {
    // Prevent opening filter dialog for share_key-only users
    if (this.dashboardSessionService.accessMethod() === 'share_key') {
      return;
    }

    const dialogData: FilterDialogData = {
      selectedRegioStars: this._selectedRegioStars(),
      selectedStates: this._selectedStates(),
    };

    const dialogRef = this.dialog.open(FilterDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this._selectedRegioStars.set(result.selectedRegioStars || []);
        this._selectedStates.set(result.selectedStates || []);
        this.saveSettings();
      }
    });
  }

  /**
   * Reset advanced filters to default (all selected)
   * Does not reset modes, only resets: regiostars, states
   */
  resetAdvancedFilters(): void {
    const allRegioStarIds = this._allRegioStars().map(r => r.id);
    this._selectedRegioStars.set([...allRegioStarIds]);

    const allStateIds = this._allStates().map(s => s.id);
    this._selectedStates.set([...allStateIds]);

    this.saveSettings();
  }

  private getZoomForAdminLevel(): number {
    // Keep reactive dependency on zoom sync even when the map instance is not ready yet.
    const trackedZoom = this._currentMapZoom();
    const liveZoom = this.mapService.getMap()?.getZoom();
    if (typeof liveZoom === 'number' && Number.isFinite(liveZoom)) {
      return liveZoom;
    }
    return trackedZoom;
  }

  private resolveFiltersForMapApply(filters: ContentLayerFilters): ContentLayerFilters {
    return {
      ...filters,
      admin_level: this.effectiveAdminLevel(),
    };
  }

  private needsContentLayerFullReload(
    previousFilters: ContentLayerFilters | null,
    filters: ContentLayerFilters
  ): boolean {
    if (!previousFilters) {
      return true;
    }

    if (previousFilters.admin_level !== filters.admin_level) {
      return true;
    }

    if (previousFilters.feature_type !== filters.feature_type) {
      return true;
    }

    const previousProfileIds = [...previousFilters.profile_ids].sort((a, b) => a - b).join(',');
    const profileIds = [...filters.profile_ids].sort((a, b) => a - b).join(',');
    return previousProfileIds !== profileIds;
  }

  private filtersDiffer(
    previousFilters: ContentLayerFilters | null,
    filters: ContentLayerFilters
  ): boolean {
    if (!previousFilters) {
      return true;
    }

    return (
      JSON.stringify([...previousFilters.profile_ids].sort((a, b) => a - b)) !== JSON.stringify([...filters.profile_ids].sort((a, b) => a - b)) ||
      previousFilters.feature_type !== filters.feature_type ||
      JSON.stringify(previousFilters.state_ids?.sort()) !== JSON.stringify(filters.state_ids?.sort()) ||
      JSON.stringify(previousFilters.category_ids?.sort()) !== JSON.stringify(filters.category_ids?.sort()) ||
      JSON.stringify(previousFilters.regiostar_ids?.sort()) !== JSON.stringify(filters.regiostar_ids?.sort()) ||
      previousFilters.admin_level !== filters.admin_level ||
      JSON.stringify(previousFilters.selected_quality_brackets) !== JSON.stringify(filters.selected_quality_brackets) ||
      JSON.stringify(previousFilters.selected_time_brackets) !== JSON.stringify(filters.selected_time_brackets)
    );
  }

  private cloneContentLayerFilters(filters: ContentLayerFilters): ContentLayerFilters {
    return {
      ...filters,
      profile_ids: [...filters.profile_ids],
      state_ids: filters.state_ids ? [...filters.state_ids] : undefined,
      category_ids: filters.category_ids ? [...filters.category_ids] : undefined,
      regiostar_ids: filters.regiostar_ids ? [...filters.regiostar_ids] : undefined,
      selected_quality_brackets: filters.selected_quality_brackets
        ? [...filters.selected_quality_brackets]
        : undefined,
      selected_time_brackets: filters.selected_time_brackets
        ? [...filters.selected_time_brackets]
        : undefined,
    };
  }

  private mapHasContentLayer(targetMap: MapLibreMap): boolean {
    return !!targetMap.getSource('content-layer');
  }

  private async updateDifferenceMapLayers(
    leftFilters: ContentLayerFilters,
    rightFilters: ContentLayerFilters,
    fullReload: boolean
  ): Promise<boolean> {
    const targetMap = this.mapService.getMap();
    if (!targetMap || this.mapService.hasCompareMaps()) {
      return false;
    }

    if (this.updateMapLayerInProgress) {
      this.compareUpdateRetryNeeded = true;
      return false;
    }

    const loadGeneration = this.projectLoadGeneration;
    this.updateMapLayerInProgress = true;
    try {
      this.mapService.setMapLoading(true);

      if (!this.isProjectLoadCurrent(loadGeneration)) {
        return false;
      }

      const leftToApply = this.resolveFiltersForMapApply(leftFilters);
      const rightToApply = this.resolveFiltersForMapApply(rightFilters);

      if (fullReload || !this.mapService.hasDifferenceLayers(targetMap)) {
        const loaded = await this.mapService.loadDifferenceLayersOnMap(
          targetMap,
          leftToApply,
          rightToApply,
          false
        );
        if (loaded) {
          targetMap.resize();
        }
        return loaded && this.isProjectLoadCurrent(loadGeneration);
      }

      await this.mapService.updateDifferenceLayersOnMap(targetMap, leftToApply, rightToApply);
      return this.isProjectLoadCurrent(loadGeneration);
    } catch (error) {
      console.error('Error in updateDifferenceMapLayers:', error);
      this.mapService.setMapLoading(false);
      return false;
    } finally {
      this.updateMapLayerInProgress = false;
    }
  }

  private async updateCompareMapLayers(
    leftFilters: ContentLayerFilters,
    rightFilters: ContentLayerFilters,
    leftFullReload: boolean,
    rightFullReload: boolean,
    onlyLeftChanged: boolean = false,
    onlyRightChanged: boolean = false,
    leftChanged: boolean = true,
    rightChanged: boolean = true
  ): Promise<boolean> {
    const leftMap = this.mapService.getMap();
    const rightMap = this.mapService.getCompareRightMap();
    if (!leftMap || !rightMap) {
      return false;
    }

    if (this.updateMapLayerInProgress) {
      this.compareUpdateRetryNeeded = true;
      return false;
    }

    const shouldUpdateLeft = leftChanged && !onlyRightChanged;
    const shouldUpdateRight = rightChanged && !onlyLeftChanged;
    const loadGeneration = this.projectLoadGeneration;

    this.updateMapLayerInProgress = true;
    try {
      this.mapService.setMapLoading(true);

      if (!this.isProjectLoadCurrent(loadGeneration)) {
        return false;
      }

      let success = false;

      const loadTasks: Promise<boolean>[] = [];
      if (shouldUpdateLeft) {
        loadTasks.push(
          this.updateMapLayer(leftFilters, leftFullReload, false, leftMap)
        );
      }
      if (shouldUpdateRight) {
        loadTasks.push(
          this.updateMapLayer(rightFilters, rightFullReload, false, rightMap)
        );
      }

      const results = await Promise.all(loadTasks);
      success = loadTasks.length > 0 && results.every(Boolean);

      if (shouldUpdateRight && !this.mapHasContentLayer(rightMap)) {
        const rightRetryOk = await this.updateMapLayer(
          rightFilters,
          true,
          false,
          rightMap
        );
        success = rightRetryOk;
      }

      if (success) {
        leftMap.resize();
        rightMap.resize();
      }

      return success;
    } finally {
      this.updateMapLayerInProgress = false;
    }
  }

  /**
   * Update map layer with current filters
   * @param filters - The filter parameters
   * @param fullReload - Whether to do a full reload with zoom to bounds (default: true)
   */
  private async updateMapLayer(
    filters: ContentLayerFilters,
    fullReload: boolean = true,
    zoomToBounds: boolean = false,
    targetMap?: MapLibreMap
  ): Promise<boolean> {
    const loadGeneration = this.projectLoadGeneration;

    if (!targetMap) {
      if (this.updateMapLayerInProgress) {
        console.log('updateMapLayer already in progress, skipping concurrent call');
        return false;
      }
      this.updateMapLayerInProgress = true;
    }

    try {
      this.mapService.setMapLoading(true);

      if (!this.isProjectLoadCurrent(loadGeneration)) {
        return false;
      }

      const filtersToApply = this.resolveFiltersForMapApply(filters);

      const activeMap = targetMap ?? this.mapService.getMap();
      if (activeMap) {
        if (fullReload) {
          const loaded = await this.mapService.loadContentLayerOnMap(activeMap, filtersToApply, zoomToBounds, false);
          if (!this.isProjectLoadCurrent(loadGeneration)) {
            return false;
          }
          if (loaded) {
            activeMap.resize();
          }
          return loaded;
        }
        await this.mapService.updateContentLayerOnMap(activeMap, filtersToApply);
        return this.isProjectLoadCurrent(loadGeneration);
      } else if (fullReload) {
        await this.mapService.loadContentLayer(filtersToApply, zoomToBounds);
      } else {
        await this.mapService.updateContentLayerTiles(filtersToApply);
      }
      return this.isProjectLoadCurrent(loadGeneration);
    } catch (error) {
      console.error('Error in updateMapLayer:', error);
      this.mapService.setMapLoading(false);
      return false;
    } finally {
      if (!targetMap) {
        this.updateMapLayerInProgress = false;
        if (this.mapUpdateRetryNeeded) {
          this.mapUpdateRetryNeeded = false;
          this.refreshMapLayers();
        }
      }
    }
  }

  /**
   * Load settings from localStorage
   */
  private loadSettings(): void {
    const settings = this.settingsService.loadSettings();
    this._settingsLoaded = settings !== null && settings !== undefined;
    if (settings) {
      this._selectedBewertung.set((settings.bewertung === 'zeit' ? 'zeit' : 'qualitaet') as 'qualitaet' | 'zeit');
      
      this._layerMode.set(settings.layerMode === 'manual' ? 'manual' : 'auto');
      if (settings.layerMode === 'manual' && settings.adminLevel !== undefined && settings.adminLevel !== null) {
        this._selectedAdminLevel.set(settings.adminLevel);
      } else {
        this._selectedAdminLevel.set(null);
      }

      const allQuality = settings.legendBrackets?.quality;
      if (Array.isArray(allQuality) && allQuality.length > 0) {
        const validQuality = allQuality.filter((v): v is QualityBracket => ALL_QUALITY_BRACKETS.includes(v as QualityBracket));
        this._selectedQualityBrackets.set(validQuality.length > 0 ? [...new Set(validQuality)] : [...ALL_QUALITY_BRACKETS]);
      } else {
        this._selectedQualityBrackets.set([...ALL_QUALITY_BRACKETS]);
      }

      const allTime = settings.legendBrackets?.time;
      const availableTimeBrackets = this.scoreColorsService.bracketIds();
      if (Array.isArray(allTime) && allTime.length > 0) {
        const validTime = allTime.filter((v): v is TimeBracket => availableTimeBrackets.includes(v));
        this._selectedTimeBrackets.set(
          validTime.length > 0 ? [...new Set(validTime)] : [...availableTimeBrackets]
        );
      } else {
        this._selectedTimeBrackets.set([...availableTimeBrackets]);
      }

      // Load filter settings (RegioStars and states only — activities/personas are not user-selectable)
      if (settings.filters) {
        this._selectedPersonas.set(null);
        this._selectedRegioStars.set(settings.filters.regiostars || []);
        this._selectedStates.set(settings.filters.states || []);
      }

      // Load profile selection (will be validated later)
      if (settings.verkehrsmittel && settings.verkehrsmittel.length > 0) {
        this._selectedModes.set([...settings.verkehrsmittel]);
      }
    }
  }

  /**
   * Save current settings to localStorage
   */
  private saveSettings(): void {
    this.settingsService.saveSettings({
      verkehrsmittel: [...this._selectedModes()],
      bewertung: this._selectedBewertung(),
      adminLevel: this._layerMode() === 'manual' ? this._selectedAdminLevel() : null,
      layerMode: this._layerMode(),
      legendBrackets: {
        quality: [...this._selectedQualityBrackets()],
        time: [...this._selectedTimeBrackets()]
      },
      filters: {
        activities: [],
        personas: this._selectedPersonas(),
        regiostars: [...this._selectedRegioStars()],
        states: [...this._selectedStates()]
      }
    });
  }
}
