import { Injectable, inject, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FeatureSelectionService, MapLibreFeatureData } from '../shared/services/feature-selection.service';
import { MapService, FeatureInfoResponse } from './map.service';
import { FilterConfigService } from './filter-config.service';
import {
  AnalyzeService,
  AnalyzeResponse,
  CategoryScore,
  PersonaBreakdown,
} from './analyze.service';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root',
})
export class AnalyzeFeatureFacadeService {
  private featureSelection = inject(FeatureSelectionService);
  private mapService = inject(MapService);
  private filterConfig = inject(FilterConfigService);
  private analyzeService = inject(AnalyzeService);
  private translate = inject(TranslateService);
  private destroyRef = inject(DestroyRef);

  private subscription?: Subscription;
  private savedFeatureType: 'municipality' | 'hexagon' | 'county' | 'state' | null = null;

  readonly selectedFeature = signal<MapLibreFeatureData | null>(null);
  readonly featureInfo = signal<FeatureInfoResponse | null>(null);
  readonly analyzeData = signal<AnalyzeResponse | null>(null);
  readonly personasData = signal<PersonaBreakdown[] | null>(null);
  readonly isLoadingFeatureInfo = signal(false);
  readonly isLoadingAnalyze = signal(false);
  readonly isLoadingPersonas = signal(false);
  readonly featureInfoError = signal<string | null>(null);
  readonly analyzeError = signal<string | null>(null);
  readonly personasError = signal<string | null>(null);
  readonly activitiesChartData = signal<unknown>(null);
  readonly activitiesChartOptions = signal<unknown>(null);
  readonly personasChartData = signal<unknown>(null);
  readonly personasChartOptions = signal<unknown>(null);
  readonly activePersonaTab = signal<'activities' | 'personas'>('activities');

  readonly isLoading = computed(
    () =>
      this.isLoadingFeatureInfo() ||
      this.isLoadingAnalyze() ||
      this.isLoadingPersonas(),
  );

  readonly hexagonId = computed(() => {
    const f = this.selectedFeature();
    if (!f || this.savedFeatureType !== 'hexagon') {
      return null;
    }
    const id = f.properties?.['id'] ?? f.id;
    return typeof id === 'number' ? id : parseInt(String(id), 10);
  });

  connect(): void {
    if (!this.subscription) {
      this.subscription = this.featureSelection.selectedMapLibreFeature$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((feature) => this.onFeatureSelected(feature));
    }
    // Replay current selection when the sheet opens (may have been set before subscribe)
    this.onFeatureSelected(this.featureSelection.getCurrentMapLibreFeature());
  }

  private onFeatureSelected(feature: MapLibreFeatureData | null): void {
    if (feature) {
      this.selectedFeature.set(feature);
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
    this.personasData.set(null);
    this.activitiesChartData.set(null);
    this.personasChartData.set(null);
    this.featureInfoError.set(null);
    this.analyzeError.set(null);
    this.personasError.set(null);
    this.savedFeatureType = null;
  }

  shouldShowMap(): boolean {
    const hasCategories = this.filterConfig.hasCategories();
    const single = this.analyzeData()?.categories?.length === 1;
    return !hasCategories || !!single;
  }

  isAllPersonas(): boolean {
    return this.filterConfig.contentLayerFilters()?.persona_id === 54;
  }

  isScoreMode(): boolean {
    return this.filterConfig.contentLayerFilters()?.feature_type === 'score';
  }

  getSortedCategories(): CategoryScore[] {
    const cats = this.analyzeData()?.categories;
    if (!cats) {
      return [];
    }
    return [...cats].sort((a, b) => b.weight - a.weight).slice(0, 5);
  }

  getSortedPersonas(): PersonaBreakdown[] {
    const p = this.personasData();
    if (!p) {
      return [];
    }
    return [...p].sort((a, b) => b.weight - a.weight).slice(0, 4);
  }

  getGrade(index: number): string {
    const indexValue = index / 100;
    if (indexValue <= 0) return this.translate.instant('map.popup.error');
    if (indexValue < 0.28) return 'A+';
    if (indexValue < 0.32) return 'A';
    if (indexValue < 0.35) return 'A-';
    if (indexValue < 0.4) return 'B+';
    if (indexValue < 0.45) return 'B';
    if (indexValue < 0.5) return 'B-';
    if (indexValue < 0.56) return 'C+';
    if (indexValue < 0.63) return 'C';
    if (indexValue < 0.71) return 'C-';
    if (indexValue < 0.8) return 'D+';
    if (indexValue < 0.9) return 'D';
    if (indexValue < 1.0) return 'D-';
    if (indexValue < 1.12) return 'E+';
    if (indexValue < 1.26) return 'E';
    if (indexValue < 1.41) return 'E-';
    if (indexValue < 1.59) return 'F+';
    if (indexValue < 1.78) return 'F';
    return 'F-';
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

  getRankPercentage(rank: number | null, total: number | null): string {
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
    const profileIds = this.filterConfig.currentProfileIds();
    const filters = this.filterConfig.contentLayerFilters();
    if (!profileIds?.length || !filters) return null;
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
    return {
      featureType: base.featureType,
      featureId: base.featureId,
      profileIds: base.profileIds,
      categoryIds: categoryId ? [categoryId] : base.categoryIds,
      categoryNames: categoryName || '',
      personaId: base.personaId,
      isScoreMode: base.isScoreMode,
    };
  }

  buildPersonasDialogData(): import('../layout/right/analyze/overlay/personas-dialog.component').PersonasDialogData | null {
    const base = this.buildAllCategoriesDialogData();
    if (!base) return null;
    return {
      featureType: base.featureType,
      featureId: base.featureId,
      profileIds: base.profileIds,
      categoryIds: base.categoryIds,
      personaId: base.personaId,
      isScoreMode: base.isScoreMode,
      featureName: base.featureName,
      getGrade: base.getGrade,
    };
  }

  private loadFeature(feature: MapLibreFeatureData): void {
    const map = this.mapService.getMap();
    if (!map || !this.savedFeatureType) return;

    const featureIdRaw = feature.properties?.['id'] ?? feature.id;
    const featureId =
      typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
    if (!featureId || isNaN(featureId)) return;

    const profileIds = this.filterConfig.currentProfileIds();
    const filters = this.filterConfig.contentLayerFilters();
    if (!profileIds?.length || !filters) return;

    this.isLoadingFeatureInfo.set(true);
    this.isLoadingAnalyze.set(true);
    this.featureInfoError.set(null);
    this.analyzeError.set(null);

    const shouldLoadPersonas = filters.persona_id === 54;
    if (shouldLoadPersonas) {
      this.isLoadingPersonas.set(true);
      this.personasError.set(null);
    }

    const requests = {
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
    };

    const personasRequest = shouldLoadPersonas
      ? this.analyzeService
          .getPersonas({
            feature_type: this.savedFeatureType,
            feature_id: featureId,
            profile_ids: profileIds,
            category_ids: filters.category_ids,
            persona_id: 54,
          })
          .pipe(catchError(() => of(null)))
      : of(null);

    forkJoin({
      ...requests,
      personasData: personasRequest,
    }).subscribe((result) => {
      this.isLoadingFeatureInfo.set(false);
      this.isLoadingAnalyze.set(false);
      this.isLoadingPersonas.set(false);

      this.featureInfo.set(result.featureInfo);
      const analyze = result.analyzeData;
      this.analyzeData.set(analyze);

      if (shouldLoadPersonas) {
        this.personasData.set(result.personasData);
      }

      if (!this.shouldShowMap() && analyze?.categories) {
        this.buildActivitiesChart(analyze.categories);
      }
      if (shouldLoadPersonas && result.personasData) {
        this.buildPersonasChart(result.personasData);
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

  private buildPersonasChart(personas: PersonaBreakdown[]): void {
    const sorted = [...personas].sort((a, b) => b.weight - a.weight).slice(0, 4);
    const isScore = this.isScoreMode();
    const colors = sorted.map((p) =>
      isScore ? this.scoreColor(p.score) : this.gradeColorSolid(p.index),
    );
    this.personasChartData.set({
      labels: sorted.map((_, i) => String(i + 1)),
      datasets: [
        {
          label: this.translate.instant('analyze.populationPercent'),
          data: sorted.map((p) => p.weight * 100),
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 1,
          maxBarThickness: 40,
        },
      ],
    });
    const personaWeights = sorted.map((p) => p.weight * 100);
    this.personasChartOptions.set({
      ...this.mobileChartOptions(sorted, personaWeights),
      scales: {
        x: { ticks: { color: '#fff', font: { size: 10 } }, grid: { display: false } },
        y: {
          beginAtZero: true,
          max: 25,
          ticks: { color: '#fff', font: { size: 10 }, stepSize: 5 },
          grid: { color: 'rgba(255,255,255,0.1)' },
        },
      },
    });
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
    const v = index / 100;
    if (v <= 0) return 'rgba(128, 128, 128, 0.7)';
    if (v < 0.35) return 'rgba(50, 97, 45, 0.7)';
    if (v < 0.5) return 'rgba(60, 176, 67, 0.7)';
    if (v < 0.71) return 'rgba(238, 210, 2, 0.7)';
    if (v < 1.0) return 'rgba(237, 112, 20, 0.7)';
    if (v < 1.41) return 'rgba(194, 24, 7, 0.7)';
    return 'rgba(150, 86, 162, 0.7)';
  }

  private gradeColorSolid(index: number): string {
    const v = index / 100;
    if (v <= 0) return 'rgba(128, 128, 128, 1)';
    if (v < 0.35) return 'rgba(50, 97, 45, 1)';
    if (v < 0.5) return 'rgba(60, 176, 67, 1)';
    if (v < 0.71) return 'rgba(238, 210, 2, 1)';
    if (v < 1.0) return 'rgba(237, 112, 20, 1)';
    if (v < 1.41) return 'rgba(194, 24, 7, 1)';
    return 'rgba(150, 86, 162, 1)';
  }

  private scoreColor(score: number): string {
    if (score < 600) return 'rgb(46, 125, 50)';
    if (score < 900) return 'rgb(102, 187, 106)';
    if (score < 1200) return 'rgb(255, 241, 118)';
    if (score < 1800) return 'rgb(253,216,53)';
    if (score < 2700) return 'rgb(239, 83, 80)';
    return 'rgb(183, 28, 28)';
  }
}
