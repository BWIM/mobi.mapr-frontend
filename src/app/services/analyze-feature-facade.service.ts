import { Injectable, inject, signal, computed, DestroyRef, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ShareAccessService } from './share-access.service';
import { FeatureSelectionService, MapLibreFeatureData } from '../shared/services/feature-selection.service';
import { MapService, FeatureInfoResponse, ContentLayerFilters } from './map.service';
import { FilterConfigService } from './filter-config.service';
import {
  AnalyzeService,
  AnalyzeResponse,
  CategoryScore,
} from './analyze.service';
import { TranslateService } from '@ngx-translate/core';
import { ScoreColorsService } from './score-colors.service';
import { getGrade, getGradeColor, MAP_GRADE_ALPHA } from '../utils/grade.util';

@Injectable({
  providedIn: 'root',
})
export class AnalyzeFeatureFacadeService {
  private featureSelection = inject(FeatureSelectionService);
  private mapService = inject(MapService);
  private filterConfig = inject(FilterConfigService);
  private analyzeService = inject(AnalyzeService);
  private translate = inject(TranslateService);
  private scoreColorsService = inject(ScoreColorsService);
  private destroyRef = inject(DestroyRef);
  private shareAccess = inject(ShareAccessService);

  private subscription?: Subscription;
  private savedFeatureType: 'municipality' | 'hexagon' | 'county' | 'state' | null = null;
  private selectedCompareSide: 'left' | 'right' = 'left';
  private previousFilters: ContentLayerFilters | null = null;
  private isInitialFilterLoad = true;

  readonly selectedFeature = signal<MapLibreFeatureData | null>(null);
  readonly featureInfo = signal<FeatureInfoResponse | null>(null);
  readonly analyzeData = signal<AnalyzeResponse | null>(null);
  readonly isLoadingFeatureInfo = signal(false);
  readonly isLoadingAnalyze = signal(false);
  readonly featureInfoError = signal<string | null>(null);
  readonly analyzeError = signal<string | null>(null);
  readonly activitiesChartData = signal<unknown>(null);
  readonly activitiesChartOptions = signal<unknown>(null);

  readonly isLoading = computed(
    () => this.isLoadingFeatureInfo() || this.isLoadingAnalyze(),
  );

  readonly hexagonId = computed(() => {
    const f = this.selectedFeature();
    if (!f || this.savedFeatureType !== 'hexagon') {
      return null;
    }
    const id = f.properties?.['id'] ?? f.id;
    return typeof id === 'number' ? id : parseInt(String(id), 10);
  });

  constructor() {
    effect(() => {
      const compareMode = this.filterConfig.isMapCompareMode();
      const filters =
        compareMode && this.selectedCompareSide === 'right'
          ? this.filterConfig.rightContentLayerFilters()
          : this.filterConfig.contentLayerFilters();

      if (this.isInitialFilterLoad) {
        this.previousFilters = filters ? { ...filters } : null;
        this.isInitialFilterLoad = false;
        return;
      }

      if (filters && this.previousFilters) {
        const filtersChanged =
          JSON.stringify([...this.previousFilters.profile_ids].sort((a, b) => a - b)) !==
            JSON.stringify([...filters.profile_ids].sort((a, b) => a - b)) ||
          JSON.stringify(this.previousFilters.state_ids?.sort()) !==
            JSON.stringify(filters.state_ids?.sort()) ||
          JSON.stringify(this.previousFilters.category_ids?.sort()) !==
            JSON.stringify(filters.category_ids?.sort()) ||
          this.previousFilters.persona_id !== filters.persona_id ||
          JSON.stringify(this.previousFilters.regiostar_ids?.sort()) !==
            JSON.stringify(filters.regiostar_ids?.sort());

        if (filtersChanged) {
          const feature = this.selectedFeature();
          if (feature && this.savedFeatureType) {
            this.loadFeature(feature);
          }
        }
      }

      this.previousFilters = filters ? { ...filters } : null;
    });

    // Score vs quality only changes display of existing values — rebuild chart colors.
    effect(() => {
      this.filterConfig.selectedBewertung();
      const analyze = this.analyzeData();
      if (analyze?.categories?.length && !this.shouldShowMap()) {
        this.buildActivitiesChart(analyze.categories);
      }
    });
  }
  connect(): void {
    if (!this.subscription) {
      this.subscription = this.featureSelection.selectedMapLibreFeature$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((feature) => this.onFeatureSelected(feature));
    }
    this.onFeatureSelected(this.featureSelection.getCurrentMapLibreFeature());
  }

  private onFeatureSelected(feature: MapLibreFeatureData | null): void {
    if (feature) {
      this.selectedFeature.set(feature);
      this.selectedCompareSide = this.featureSelection.getSelectedMapLibreFeatureSide();
      const featureType = this.mapService.getFeatureTypeFromTileProperty(feature);
      if (featureType) {
        this.savedFeatureType = featureType;
        this.loadFeature(feature);
      } else {
        this.featureInfoError.set(
          this.translate.instant('analyze.featureInfo.errorLoading'),
        );
      }
    } else {
      this.reset();
    }
  }

  disconnect(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.reset();
  }

  reset(): void {
    this.selectedFeature.set(null);
    this.featureInfo.set(null);
    this.analyzeData.set(null);
    this.activitiesChartData.set(null);
    this.featureInfoError.set(null);
    this.analyzeError.set(null);
    this.savedFeatureType = null;
    this.selectedCompareSide = 'left';
  }

  private getProfileContext(): { profileIds: number[]; filters: ContentLayerFilters } | null {
    const useRight =
      this.filterConfig.isMapCompareMode() && this.selectedCompareSide === 'right';
    const profileIds = useRight
      ? this.filterConfig.rightCurrentProfileIds()
      : this.filterConfig.currentProfileIds();
    const filters = useRight
      ? this.filterConfig.rightContentLayerFilters()
      : this.filterConfig.contentLayerFilters();
    if (!profileIds?.length || !filters) {
      return null;
    }
    return { profileIds, filters };
  }

  shouldShowMap(): boolean {
    // The places map needs /places/; without it the activity list is shown instead.
    if (!this.shareAccess.canUsePlaces()) {
      return false;
    }
    const hasCategories = this.filterConfig.hasCategories();
    const single = this.analyzeData()?.categories?.length === 1;
    return !hasCategories || !!single;
  }

  isScoreMode(): boolean {
    return this.getProfileContext()?.filters.feature_type === 'score';
  }

  getSortedCategories(): CategoryScore[] {
    const cats = this.analyzeData()?.categories;
    if (!cats) {
      return [];
    }
    return [...cats].sort((a, b) => b.weight - a.weight).slice(0, 5);
  }

  getGrade(index: number): string {
    return getGrade(index) ?? this.translate.instant('map.popup.error');
  }

  getRatingDisplay(info: FeatureInfoResponse | null): string {
    if (!info) return '';
    if (this.filterConfig.selectedBewertung() === 'zeit') {
      const minutes = (info.score / 60).toFixed(1);
      return `${minutes} ${this.translate.instant('map.popup.minutes')}`;
    }
    return this.getGrade(info.index);
  }

  getRatingColor(info: FeatureInfoResponse | null): string {
    if (!info) return 'rgba(128, 128, 128, 0.7)';
    if (this.filterConfig.selectedBewertung() === 'zeit') {
      return this.scoreColor(info.score);
    }
    return this.gradeColor(info.index);
  }

  getRankPercentage(rank: number | null | undefined, total: number | null | undefined): string {
    if (!rank || !total) return 'N/A';
    return `Top ${Math.ceil((rank / total) * 100)}%`;
  }

  buildAllCategoriesDialogData(): import('../layout/right/analyze/overlay/all-categories-dialog.component').AllCategoriesDialogData | null {
    const feature = this.selectedFeature();
    if (!feature || !this.savedFeatureType) return null;
    const featureIdRaw = feature.properties?.['id'] ?? feature.id;
    const featureId =
      typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
    if (!featureId || isNaN(featureId)) return null;
    const profileContext = this.getProfileContext();
    if (!profileContext) return null;
    const { profileIds, filters } = profileContext;
    return {
      featureType: this.savedFeatureType,
      featureId,
      profileIds,
      categoryIds: filters.category_ids,
      personaId: filters.persona_id,
      isScoreMode: filters.feature_type === 'score',
      featureName: this.featureInfo()?.name,
      getGrade: (i: number) => this.getGrade(i),
    };
  }

  buildPlacesDialogData(
    categoryId?: number,
    categoryName?: string,
  ): import('../layout/right/analyze/places/places-dialog.component').PlacesDialogData | null {
    const base = this.buildAllCategoriesDialogData();
    if (!base) return null;
    const match =
      categoryId != null
        ? this.analyzeData()?.categories?.find((c) => c.category_id === categoryId)
        : this.analyzeData()?.categories?.length === 1
          ? this.analyzeData()!.categories[0]
          : undefined;
    return {
      featureType: base.featureType,
      featureId: base.featureId,
      profileIds: base.profileIds,
      categoryIds: categoryId ? [categoryId] : base.categoryIds,
      categoryNames: categoryName || '',
      personaId: base.personaId,
      isScoreMode: base.isScoreMode,
      categoryScore: match?.score,
      categoryIndex: match?.index,
      featureName: base.featureName,
    };
  }

  private loadFeature(feature: MapLibreFeatureData): void {
    const map = this.mapService.getMap();
    if (!map || !this.savedFeatureType) return;

    const featureIdRaw = feature.properties?.['id'] ?? feature.id;
    const featureId =
      typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
    if (!featureId || isNaN(featureId)) return;

    const profileContext = this.getProfileContext();
    if (!profileContext) return;
    const { profileIds, filters } = profileContext;

    this.isLoadingFeatureInfo.set(true);
    this.isLoadingAnalyze.set(true);
    this.featureInfoError.set(null);
    this.analyzeError.set(null);

    forkJoin({
      featureInfo: this.mapService
        .getFeatureInfo({
          feature_type: this.savedFeatureType,
          feature_id: featureId,
          profile_ids: profileIds,
          category_ids: filters.category_ids,
          persona_id: filters.persona_id,
          regiostar_ids: filters.regiostar_ids,
          state_ids: filters.state_ids,
        })
        .pipe(catchError(() => of(null))),
      analyzeData: this.analyzeService
        .getAnalyze({
          feature_type: this.savedFeatureType,
          feature_id: featureId,
          profile_ids: profileIds,
          category_ids: filters.category_ids,
          persona_id: filters.persona_id,
          top5: true,
        })
        .pipe(catchError(() => of(null))),
    }).subscribe((result) => {
      this.isLoadingFeatureInfo.set(false);
      this.isLoadingAnalyze.set(false);

      this.featureInfo.set(result.featureInfo);
      const analyze = result.analyzeData;
      this.analyzeData.set(analyze);

      if (!this.shouldShowMap() && analyze?.categories) {
        this.buildActivitiesChart(analyze.categories);
      }
    });
  }

  private buildActivitiesChart(categories: CategoryScore[]): void {
    const sorted = [...categories].sort((a, b) => b.weight - a.weight).slice(0, 5);
    const isScore = this.isScoreMode();
    const colors = sorted.map((cat) =>
      isScore ? this.scoreColor(cat.score) : this.gradeColorSolid(cat.index),
    );
    const weights = sorted.map((c) => c.weight * 100);
    this.activitiesChartData.set({
      labels: sorted.map((_, i) => String(i + 1)),
      datasets: [
        {
          label: this.translate.instant('analyze.relevancePercent'),
          data: weights,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 1,
        },
      ],
    });
    this.activitiesChartOptions.set(this.mobileChartOptions(sorted, weights));
  }

  private mobileChartOptions(
    sorted: { category_name?: string; index: number }[],
    weights: number[],
  ): object {
    return {
      indexAxis: 'x',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (ctx: { dataIndex: number }[]) => {
              const i = ctx[0]?.dataIndex ?? 0;
              return (sorted[i] as CategoryScore)?.category_name ?? '';
            },
            label: (ctx: { dataIndex: number }) => {
              const i = ctx.dataIndex;
              const cat = sorted[i] as CategoryScore;
              return [
                `${this.translate.instant('analyze.rating')}: ${this.getGrade(cat?.index ?? 0)}`,
                `${weights[i]?.toFixed(1) ?? 0}%`,
              ];
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: '#fff', font: { size: 10 } }, grid: { display: false } },
        y: {
          beginAtZero: true,
          max: 25,
          ticks: { color: '#fff', font: { size: 10 }, stepSize: 5 },
          grid: { color: 'rgba(255,255,255,0.1)' },
        },
      },
    };
  }

  private gradeColor(index: number): string {
    return getGradeColor(index, MAP_GRADE_ALPHA);
  }

  private gradeColorSolid(index: number): string {
    return getGradeColor(index);
  }

  private scoreColor(score: number): string {
    return this.scoreColorsService.getColorForScore(score);
  }
}
