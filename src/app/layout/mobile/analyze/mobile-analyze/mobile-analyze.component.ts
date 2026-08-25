import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  computed,
  signal,
  effect,
  OnDestroy,
  Injector,
  afterNextRender,
  TemplateRef,
} from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Chart, Plugin } from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { AnalyzeFeatureFacadeService } from '../../../../services/analyze-feature-facade.service';
import { MobileUiService } from '../../../../services/mobile-ui.service';
import {
  AnalyzeService,
  CategoryScore,
} from '../../../../services/analyze.service';
import { AllCategoriesDialogData } from '../../../right/analyze/overlay/all-categories-dialog.component';
import { PlacesDialogData } from '../../../right/analyze/places/places-dialog.component';
import { PlacesService } from '../../../../services/places.service';
import { MapService } from '../../../../services/map.service';
import { InfoDialogComponent } from '../../../../shared/info-overlay/info-dialog.component';
import { LegendInfoComponent } from '../../../../shared/legend-info/legend-info.component';
import {
  gradeColor,
  scoreColor,
  QUALITY_COLORS,
  QUALITY_LETTERS,
} from '../../analyze-chart.utils';
import { ScoreColorsService } from '../../../../services/score-colors.service';
import { CategoryLegendItem, MobilePlacesMap } from '../../mobile-places-map';
import { CompositionNode } from '../../../../interfaces/composition';
import {
  CategoryCompositionPanelComponent,
  CompositionActivityMeta,
} from '../../../../shared/category-composition-panel/category-composition-panel.component';

function gradeFromIndex(index: number): string {
  const indexValue = index / 100;
  if (indexValue <= 0 || !Number.isFinite(indexValue)) return 'N/A';
  if (indexValue < 0.24) return 'A+';
  if (indexValue < 0.27) return 'A';
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

const LABEL_FONT = 'bold 11px sans-serif';
const LABEL_PADDING = 8;

const horizontalBarLabelsPlugin: Plugin<'bar'> = {
  id: 'horizontalBarLabels',
  afterDatasetsDraw(chart, _args, opts) {
    const labels = (opts as { labels?: string[] })?.labels;
    if (!labels?.length) return;

    const { ctx, chartArea } = chart;
    const meta = chart.getDatasetMeta(0);
    const labelX = chartArea.left + LABEL_PADDING;
    meta.data.forEach((bar, i) => {
      const text = labels[i];
      if (!text) return;

      const { y } = bar.getProps(['y'], true);

      ctx.save();
      ctx.font = LABEL_FONT;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 3;
      ctx.fillText(text, labelX, y);
      ctx.restore();
    });
  },
};

Chart.register(horizontalBarLabelsPlugin);

@Component({
  selector: 'app-mobile-analyze',
  imports: [
    TranslateModule,
    DecimalPipe,
    NgTemplateOutlet,
    MatProgressSpinner,
    MatIcon,
    ChartModule,
    CategoryCompositionPanelComponent,
  ],
  templateUrl: './mobile-analyze.component.html',
  styleUrl: './mobile-analyze.component.scss',
})
export class MobileAnalyzeComponent implements OnDestroy {
  facade = inject(AnalyzeFeatureFacadeService);
  mobileUi = inject(MobileUiService);
  private translate = inject(TranslateService);
  private analyzeService = inject(AnalyzeService);
  private placesService = inject(PlacesService);
  private mapService = inject(MapService);
  private scoreColorsService = inject(ScoreColorsService);
  private dialog = inject(MatDialog);
  private injector = inject(Injector);

  @ViewChild('placesRelevanceInfoTpl') placesRelevanceInfoTpl?: TemplateRef<unknown>;

  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLElement>;

  readonly step = this.mobileUi.analyzeStep;
  readonly qualityColors = QUALITY_COLORS;
  readonly qualityLetters = QUALITY_LETTERS;
  readonly timeLegendItems = this.scoreColorsService.legendItems;
  readonly hasScoreColors = this.scoreColorsService.hasConfig;


  // Activities detail state
  activitiesData = signal<AllCategoriesDialogData | null>(null);
  activitiesCategories = signal<CategoryScore[]>([]);
  activitiesChartData = signal<unknown>(null);
  activitiesChartOptions = signal<unknown>(null);
  activitiesChartHeight = signal(200);
  activitiesLoading = signal(false);
  activitiesError = signal<string | null>(null);


  // Places state
  placesTitle = signal('');
  placesLoading = signal(true);
  placesError = signal<string | null>(null);
  placesScoreMode = signal(false);
  placesLegendItems = signal<CategoryLegendItem[]>([]);
  placesLegendExpanded = signal(true);
  placesRelevanceInfoText = '';
  placesComposition = signal<CompositionNode | null>(null);
  placesCompositionMeta = signal<Record<number, CompositionActivityMeta>>({});
  placesCompositionExpanded = signal(false);
  placesOverallMetricLabel = signal<string | null>(null);
  placesOverallMetricColor = signal<string | null>(null);
  placesHighlightedActivity = signal<string | null>(null);

  private placesMap?: MobilePlacesMap;
  private lastLoadedStep: string | null = null;

  constructor() {
    this.placesRelevanceInfoText = this.translate.instant(
      'analyze.placesDialog.categoryRelevanceInfo',
    );

    effect(() => {
      const step = this.mobileUi.analyzeStep();
      const payload = this.mobileUi.analyzeSubSheet();

      if (step === this.lastLoadedStep) {
        return;
      }

      if (step === 'activities' && payload?.type === 'analyze-activities') {
        this.lastLoadedStep = step;
        this.activitiesData.set(payload.data);
        this.loadActivities();
      } else if (step === 'places' && payload?.type === 'analyze-places') {
        this.lastLoadedStep = step;
        this.loadPlaces(payload.data);
      } else if (step === 'main') {
        this.lastLoadedStep = step;
        this.teardownPlaces();
      }
    });
  }

  ngOnDestroy(): void {
    this.teardownPlaces();
  }


  back(): void {
    this.lastLoadedStep = null;
    this.mobileUi.backToAnalyze();
  }

  openAllActivities(): void {
    const data = this.facade.buildAllCategoriesDialogData();
    if (data) {
      this.lastLoadedStep = null;
      this.mobileUi.openAnalyzeDetail('activities', data);
    }
  }


  openPlaces(cat: CategoryScore): void {
    const data = this.facade.buildPlacesDialogData(cat.category_id, cat.category_name);
    if (data) {
      this.lastLoadedStep = null;
      this.mobileUi.openAnalyzePlaces(data);
    }
  }

  openPlacesFromMap(): void {
    const cats = this.facade.analyzeData()?.categories;
    if (cats?.length === 1) {
      this.openPlaces(cats[0]);
    }
  }

  onActivitiesChartSelect(event: { element?: { index?: number } }): void {
    const idx = event?.element?.index;
    if (idx == null) return;
    const cat = this.activitiesCategories()[idx];
    if (cat) this.onActivitiesCategoryClick(cat);
  }

  onActivitiesCategoryClick(cat: CategoryScore): void {
    const d = this.activitiesData();
    if (!d) return;
    const places: PlacesDialogData = {
      featureType: d.featureType,
      featureId: d.featureId,
      profileIds: d.profileIds,
      categoryIds: [cat.category_id],
      categoryNames: cat.category_name,
      personaId: d.personaId,
      isScoreMode: d.isScoreMode,
      categoryScore: cat.score,
      categoryIndex: cat.index,
    };
    this.lastLoadedStep = null;
    this.mobileUi.openAnalyzePlaces(places);
  }

  onMainCategoryClick(cat: CategoryScore): void {
    this.openPlaces(cat);
  }

  togglePlacesCategory(name: string): void {
    this.placesMap?.selectActivity(name);
  }

  onPlacesActivityHover(name: string | null): void {
    this.placesMap?.setHoveredActivity(name);
  }

  togglePlacesLegendExpanded(): void {
    this.placesLegendExpanded.update((expanded) => !expanded);
  }

  readonly gradeFromIndex = gradeFromIndex;

  placesMetricTextColor(score: number, index: number): string {
    return this.placesScoreMode()
      ? scoreColor(score, this.scoreColorsService.getConfig())
      : gradeColor(index);
  }

  readonly formatPlacesCompositionMetric = (
    score: number,
    index: number
  ): { label: string; color: string } => {
    const label = this.placesScoreMode()
      ? `${(score / 60).toFixed(1)} ${this.translate.instant('map.popup.minutes')}`
      : gradeFromIndex(index);
    return {
      label,
      color: this.placesMetricTextColor(score, index),
    };
  };

  openLegendInfo(event: Event): void {
    event.stopPropagation();
    this.openInfoDialog(LegendInfoComponent);
  }


  openPlacesRelevanceInfo(event: Event): void {
    event.stopPropagation();
    const tpl = this.placesRelevanceInfoTpl;
    if (tpl) {
      this.dialog.open(InfoDialogComponent, {
        ...this.dialogSize(),
        panelClass: 'info-dialog-panel',
        data: { content: tpl },
      });
    }
  }

  detailIsScoreMode(): boolean {
    const step = this.step();
    if (step === 'main') {
      return this.facade.isScoreMode();
    }
    if (step === 'activities') {
      return this.activitiesData()?.isScoreMode ?? false;
    }
    return this.placesScoreMode();
  }

  private dialogSize() {
    return this.mobileUi.isMobile()
      ? { width: '100vw', maxWidth: '100vw', maxHeight: '90vh' }
      : { width: '80vw', maxWidth: '80vw', maxHeight: '80vh' };
  }

  private openInfoDialog(content: typeof LegendInfoComponent): void {
    this.dialog.open(InfoDialogComponent, {
      ...this.dialogSize(),
      panelClass: 'info-dialog-panel',
      data: { content },
    });
  }

  private loadActivities(): void {
    const d = this.activitiesData();
    if (!d) return;
    this.activitiesLoading.set(true);
    this.activitiesError.set(null);
    this.analyzeService
      .getAnalyze({
        feature_type: d.featureType,
        feature_id: d.featureId,
        profile_ids: d.profileIds,
        category_ids: d.categoryIds,
        persona_id: d.personaId,
        top5: false,
      })
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        this.activitiesLoading.set(false);
        if (!res?.categories) {
          this.activitiesError.set(
            this.translate.instant('analyze.allCategoriesDialog.errorLoadingCategories'),
          );
          return;
        }
        const sorted = [...res.categories].sort((a, b) => b.weight - a.weight);
        this.activitiesCategories.set(sorted);
        this.buildActivitiesChart(sorted, d);
      });
  }

  private buildActivitiesChart(
    categories: CategoryScore[],
    d: AllCategoriesDialogData,
  ): void {
    const barHeight = 28;
    const weights = categories.map((c) => c.weight * 100);
    const maxWeight = Math.max(...weights, 0);
    const xAxisMax = Math.max(5, Math.ceil(maxWeight / 5) * 5);
    const colors = categories.map((c) =>
      d.isScoreMode ? scoreColor(c.score, this.scoreColorsService.getConfig()) : gradeColor(c.index),
    );

    this.activitiesChartHeight.set(categories.length * barHeight + 56);
    this.activitiesChartData.set({
      labels: categories.map((c) => c.category_name),
      datasets: [
        {
          label: this.translate.instant('analyze.relevancePercent'),
          data: weights,
          backgroundColor: colors,
          borderColor: '#fff',
          borderWidth: 1,
          barThickness: barHeight - 6,
          clip: false,
        },
      ],
    });
    this.activitiesChartOptions.set({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      clip: false,
      layout: { padding: { top: 4, right: 12, bottom: 4, left: 4 } },
      plugins: {
        legend: { display: false },
        horizontalBarLabels: {
          labels: categories.map((c) => c.category_name),
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: () => '',
            label: (context: { dataIndex: number }) => {
              const index = context.dataIndex;
              const cat = categories[index];
              const activityLabel = this.translate.instant('analyze.activity');
              const relevanceLabel = this.translate.instant('analyze.relevance');
              const minutesLabel = this.translate.instant('map.popup.minutes');
              const ratingLabel = d.isScoreMode
                ? this.translate.instant('map.popup.score')
                : this.translate.instant('map.popup.index');
              const ratingValue = d.isScoreMode
                ? `${Math.round(cat.score / 60)} ${minutesLabel}`
                : d.getGrade(cat.index);
              return [
                `${activityLabel}: ${cat.category_name}`,
                `${ratingLabel} ${ratingValue}`,
                `${relevanceLabel}: ${weights[index].toFixed(1)}%`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: xAxisMax,
          ticks: {
            color: '#fff',
            font: { size: 9 },
            stepSize: xAxisMax <= 25 ? 5 : Math.ceil(xAxisMax / 10),
          },
          grid: { color: 'rgba(255, 255, 255, 0.1)', drawBorder: false },
          title: {
            display: true,
            text: this.translate.instant('analyze.relevance'),
            color: '#fff',
            font: { size: 10, weight: 'bold' },
            padding: { top: 6 },
          },
        },
        y: { display: false, reverse: true, grid: { display: false } },
      },
    });
  }


  private async loadPlaces(data: PlacesDialogData): Promise<void> {
    this.teardownPlaces();
    this.placesLegendExpanded.set(true);
    if (data.categoryScore != null || data.categoryIndex != null) {
      const score = Number(data.categoryScore ?? 0);
      const index = Number(data.categoryIndex ?? 0);
      const label = data.isScoreMode
        ? `${(score / 60).toFixed(1)} ${this.translate.instant('map.popup.minutes')}`
        : gradeFromIndex(index);
      this.placesOverallMetricLabel.set(label);
      this.placesOverallMetricColor.set(
        data.isScoreMode
          ? scoreColor(score, this.scoreColorsService.getConfig())
          : gradeColor(index),
      );
    } else {
      this.placesOverallMetricLabel.set(null);
      this.placesOverallMetricColor.set(null);
    }
    this.placesMap = new MobilePlacesMap(
      {
        title: this.placesTitle,
        isLoading: this.placesLoading,
        error: this.placesError,
        isScoreMode: this.placesScoreMode,
        categoryLegendItems: this.placesLegendItems,
        composition: this.placesComposition,
        compositionActivityMeta: this.placesCompositionMeta,
        highlightedActivityName: this.placesHighlightedActivity,
      },
      this.placesService,
      this.mapService,
      this.translate,
      this.injector,
    );
    await this.placesMap.load(data);
    this.applyPlacesOverallFromBackend();
    afterNextRender(
      () => {
        const el = this.mapContainer?.nativeElement;
        if (el) {
          this.placesMap?.attach(el);
        }
      },
      { injector: this.injector },
    );
  }

  /** Prefer composition.activityScore from places API when present. */
  private applyPlacesOverallFromBackend(): void {
    const metrics = this.placesComposition()?.activityScore;
    if (!metrics) {
      return;
    }
    const isScoreMode = this.placesScoreMode();
    const label = isScoreMode
      ? `${(metrics.score / 60).toFixed(1)} ${this.translate.instant('map.popup.minutes')}`
      : gradeFromIndex(metrics.index);
    this.placesOverallMetricLabel.set(label);
    this.placesOverallMetricColor.set(
      isScoreMode
        ? scoreColor(metrics.score, this.scoreColorsService.getConfig())
        : gradeColor(metrics.index),
    );
  }

  private teardownPlaces(): void {
    this.placesMap?.destroy();
    this.placesMap = undefined;
    this.placesHighlightedActivity.set(null);
  }
}
