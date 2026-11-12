import { Component, OnInit, OnDestroy, inject, AfterViewInit, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, formatNumber } from '@angular/common';
import { Subscription, catchError, of, forkJoin, firstValueFrom } from 'rxjs';
import { FeatureSelectionService, MapCompareSide } from '../../../shared/services/feature-selection.service';
import { MapService, FeatureInfoResponse, ContentLayerFilters } from '../../../services/map.service';
import { FilterConfigService } from '../../../services/filter-config.service';
import { AnalyzeService, AnalyzeResponse, CategoryScore } from '../../../services/analyze.service';
import { ProjectsService } from '../../../services/project.service';
import { PlacesService, Place } from '../../../services/places.service';
import { ShareAccessService } from '../../../services/share-access.service';
import { MatDialog } from '@angular/material/dialog';
import { SharedModule } from '../../../shared/shared.module';
import { AllCategoriesDialogComponent, AllCategoriesDialogData } from './overlay/all-categories-dialog.component';
import { PlacesDialogComponent, PlacesDialogData } from './places/places-dialog.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MobileUiService } from '../../../services/mobile-ui.service';
import { ScoreColorsService } from '../../../services/score-colors.service';
import { CompositionNode } from '../../../interfaces/composition';
import {
  CategoryCompositionPanelComponent,
  CompositionActivityMeta,
} from '../../../shared/category-composition-panel/category-composition-panel.component';
import { getContrastTextColor, getGradeColor } from '../../../utils/grade-colors.util';
import { LocaleNumberPipe, currentNumberLocale } from '../../../shared/pipes/locale-number.pipe';

interface ActivityValue {
  /** Relevance in percent (0-100). */
  relevance: number;
  color: string;
  /** Grade (e.g. "B+") or travel time, depending on the selected rating mode. */
  rating: string;
}

interface ActivityRow {
  category: CategoryScore;
  /** One entry per compared feature; null when the activity is missing for that feature. */
  values: (ActivityValue | null)[];
}

@Component({
  selector: 'app-analyze',
  imports: [LocaleNumberPipe, CommonModule, SharedModule, TranslateModule, CategoryCompositionPanelComponent],
  templateUrl: './analyze.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './analyze.component.css',
})
export class AnalyzeComponent implements OnInit, OnDestroy, AfterViewInit {
  selectedFeature: any | null = null;
  featureInfo: FeatureInfoResponse | null = null;
  isLoadingFeatureInfo: boolean = false;
  featureInfoError: string | null = null;
  /** Selected feature is outside the active Regionalklassen/Bundesländer filter. */
  featureExcludedByFilter = false;

  // Selected feature id (used for subtle UI hints like "Hexagon {id}")
  private selectedFeatureId: number | null = null;
  
  // Second feature for comparison
  selectedFeature2: any | null = null;
  featureInfo2: FeatureInfoResponse | null = null;
  isLoadingFeatureInfo2: boolean = false;
  featureInfoError2: string | null = null;
  featureExcludedByFilter2 = false;

  // Selected feature id for feature 2 (comparison mode)
  private selectedFeatureId2: number | null = null;
  
  // Analyze chart data
  analyzeData: AnalyzeResponse | null = null;
  isLoadingAnalyze: boolean = false;
  analyzeError: string | null = null;
  /** Top 5 activities, rendered as labelled horizontal bars. */
  activityRows: ActivityRow[] | null = null;
  
  // Analyze chart data for feature 2
  analyzeData2: AnalyzeResponse | null = null;
  isLoadingAnalyze2: boolean = false;
  analyzeError2: string | null = null;
  
  
  // Places summary data (composition / activity grades; map opens as overlay)
  private places: Place[] = [];
  private categoryData: Array<{
    name: string;
    weight: number;
    score: number;
    index: number;
    places: Place[];
    activity_id?: number;
  }> = [];
  private categoryColors = new Map<string, string>();
  /** Leaf activity list for places summary / composition panel. */
  categoryLegendItems: Array<{
    name: string;
    color: string;
    weight: number;
    relevance: number;
    enabled: boolean;
    score: number;
    index: number;
    activity_id?: number;
  }> = [];
  composition: CompositionNode | null = null;
  compositionActivityMeta: Record<number, CompositionActivityMeta> = {};
  placesOverallMetricLabel: string | null = null;
  placesOverallMetricColor: string | null = null;
  isLoadingPlaces: boolean = false;
  placesError: string | null = null;
  /** Places map overlay is only available for municipality / hexagon. */
  placesMapAvailable = false;
  private colorPalette = [
    '#FF0000', '#00FF00', '#0066FF', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80',
    '#EC7063', '#5DADE2', '#58D68D', '#F4D03F', '#AF7AC5'
  ];

  // Quality (index) colors - A through F (must match map.service.ts getIndexFillColorExpression())
  qualityColors = [
    { letter: 'A', color: 'rgb(50, 97, 45)' },
    { letter: 'B', color: 'rgb(60, 176, 67)' },
    { letter: 'C', color: 'rgb(238, 210, 2)' },
    { letter: 'D', color: 'rgb(237, 112, 20)' },
    { letter: 'E', color: 'rgb(194, 24, 7)' },
    { letter: 'F', color: 'rgb(197, 136, 187)' }
  ];

  private featureSelectionService = inject(FeatureSelectionService);
  private mapService = inject(MapService);
  private filterConfigService = inject(FilterConfigService);
  private analyzeService = inject(AnalyzeService);
  private projectsService = inject(ProjectsService);
  private placesService = inject(PlacesService);
  private shareAccess = inject(ShareAccessService);
  /** Places dialog / map; hidden when a share disables `places`. */
  readonly canUsePlaces = this.shareAccess.canUsePlaces;
  private dialog = inject(MatDialog);
  private translate = inject(TranslateService);
  private mobileUi = inject(MobileUiService);
  private scoreColorsService = inject(ScoreColorsService);
  private featureSubscription?: Subscription;
  private featureSubscription2?: Subscription;
  private featureInfoSubscription?: Subscription;
  private featureInfoSubscription2?: Subscription;
  private analyzeSubscription?: Subscription;
  private analyzeSubscription2?: Subscription;
  private languageSubscription?: Subscription;
  private currentLoadingFeatureId: number | null = null;
  private currentLoadingFeatureId2: number | null = null;
  private previousFilters: ContentLayerFilters | null = null;
  private isInitialFilterLoad = true;
  private savedFeatureType: 'municipality' | 'hexagon' | 'county' | 'state' | null = null;
  private savedFeatureType2: 'municipality' | 'hexagon' | 'county' | 'state' | null = null;
  private pendingReload = false; // Track if we're waiting for map to load before reloading
  private selectedCompareSide: MapCompareSide = 'left';
  private previousLeftFilters: ContentLayerFilters | null = null;
  private previousRightFilters: ContentLayerFilters | null = null;
  
  // Comparison mode computed property
  get isComparisonMode(): boolean {
    return this.selectedFeature !== null && this.selectedFeature2 !== null;
  }

  get isHexagonSelected(): boolean {
    return this.savedFeatureType === 'hexagon';
  }

  get isHexagonSelected2(): boolean {
    return this.savedFeatureType2 === 'hexagon';
  }

  get hexagonId(): number | null {
    return this.selectedFeatureId;
  }

  get hexagonId2(): number | null {
    return this.selectedFeatureId2;
  }

  constructor() {
    // Watch for filter changes and reload data instead of resetting
    effect(() => {
      const compareMode = this.filterConfigService.isMapCompareMode();
      const leftFilters = this.filterConfigService.contentLayerFilters();
      const rightFilters = this.filterConfigService.rightContentLayerFilters();
      const filters =
        compareMode && this.selectedCompareSide === 'right' ? rightFilters : leftFilters;
      const previousFilters =
        compareMode && this.selectedCompareSide === 'right'
          ? this.previousRightFilters
          : this.previousLeftFilters;
      
      // Skip reload on initial load
      if (this.isInitialFilterLoad) {
        this.previousLeftFilters = leftFilters ? { ...leftFilters } : null;
        this.previousRightFilters = rightFilters ? { ...rightFilters } : null;
        this.previousFilters = filters ? { ...filters } : null;
        this.isInitialFilterLoad = false;
        return;
      }
      
      // Only reload if filters actually changed
      if (filters && previousFilters) {
        const filtersChanged = 
          JSON.stringify([...previousFilters.profile_ids].sort((a, b) => a - b)) !== JSON.stringify([...filters.profile_ids].sort((a, b) => a - b)) ||
          JSON.stringify(previousFilters.state_ids?.sort()) !== JSON.stringify(filters.state_ids?.sort()) ||
          JSON.stringify(previousFilters.category_ids?.sort()) !== JSON.stringify(filters.category_ids?.sort()) ||
          previousFilters.persona_id !== filters.persona_id ||
          JSON.stringify(previousFilters.regiostar_ids?.sort()) !== JSON.stringify(filters.regiostar_ids?.sort());
        
        if (filtersChanged) {
          // Reload data for selected features instead of resetting
          // Wait for map to finish loading first
          this.reloadDataForSelectedFeatures();
        }
      } else if (filters !== previousFilters) {
        // Filters changed from null to non-null or vice versa - reset component
        this.resetComponent();
      }
      
      this.previousLeftFilters = leftFilters ? { ...leftFilters } : null;
      this.previousRightFilters = rightFilters ? { ...rightFilters } : null;
      this.previousFilters = filters ? { ...filters } : null;
    });

    effect(() => {
      const isMapLoading = this.mapService.isMapLoading();
      if (!isMapLoading && this.pendingReload) {
        this.pendingReload = false;
        this.executeReload();
      }
    });

    // Score vs quality only changes how existing values are shown — no API reload.
    effect(() => {
      this.filterConfigService.selectedBewertung();
      if (this.categoryData.length === 0 && !this.analyzeData?.categories?.length) {
        return;
      }
      this.refreshPlacesMetricDisplay();
    });
  }

  ngOnInit() {
    // Subscribe to feature selection changes
    this.featureSubscription = this.featureSelectionService.selectedMapLibreFeature$.subscribe(
      (feature) => {
        if (feature) {
          this.selectedFeature = feature;
          this.selectedCompareSide = this.featureSelectionService.getSelectedMapLibreFeatureSide();
          // Extract and save feature type from tile property 't' immediately when feature is selected
          const featureType = this.mapService.getFeatureTypeFromTileProperty(feature);
          if (featureType) {
            this.savedFeatureType = featureType;
            this.loadFeatureInfo(feature);
          } else {
            console.error('Feature type could not be determined from tile property "t"');
            this.featureInfoError = this.translate.instant('analyze.featureInfo.errorLoading');
            this.isLoadingFeatureInfo = false;
            this.isLoadingAnalyze = false;
          }
        } else {
          // Only reset if feature 2 is also null (complete reset)
          if (!this.selectedFeature2) {
            this.resetComponent();
          } else {
            // Clear only feature 1 data
            this.selectedFeature = null;
            this.featureInfo = null;
          this.selectedFeatureId = null;
            this.analyzeData = null;
            this.activityRows = null;
            // Reinitialize charts with feature 2 data only
            if (this.analyzeData2 && this.analyzeData2.categories) {
              this.initializeActivitiesChart(this.analyzeData2.categories);
            }
          }
        }
      }
    );

    // Subscribe to second feature selection changes
    this.featureSubscription2 = this.featureSelectionService.selectedMapLibreFeature2$.subscribe(
      (feature) => {
        if (feature) {
          this.selectedFeature2 = feature;
          // Extract and save feature type from tile property 't' immediately when feature is selected
          const featureType = this.mapService.getFeatureTypeFromTileProperty(feature);
          if (featureType) {
            this.savedFeatureType2 = featureType;
            this.loadFeatureInfo2(feature);
          } else {
            console.error('Feature type could not be determined from tile property "t"');
            this.featureInfoError2 = this.translate.instant('analyze.featureInfo.errorLoading');
            this.isLoadingFeatureInfo2 = false;
            this.isLoadingAnalyze2 = false;
          }
        } else {
          // Clear feature 2 data
          this.selectedFeature2 = null;
          this.featureInfo2 = null;
          this.selectedFeatureId2 = null;
          this.analyzeData2 = null;
          this.savedFeatureType2 = null;
          // If feature 1 is also null, do full reset
          if (!this.selectedFeature) {
            this.resetComponent();
          } else {
            // Reinitialize charts with feature 1 data only
            if (this.analyzeData && this.analyzeData.categories) {
              this.initializeActivitiesChart(this.analyzeData.categories);
            }
          }
        }
      }
    );

    // Rebuild activity rows on language change so units (e.g. "min") are translated
    this.languageSubscription = this.translate.onLangChange.subscribe(() => this.refreshActivityRows());
  }

  ngAfterViewInit() {
    // Places summary is data-driven; the map opens only via the places dialog overlay.
  }

  ngOnDestroy() {
    if (this.featureSubscription) {
      this.featureSubscription.unsubscribe();
    }
    if (this.featureSubscription2) {
      this.featureSubscription2.unsubscribe();
    }
    if (this.featureInfoSubscription) {
      this.featureInfoSubscription.unsubscribe();
    }
    if (this.featureInfoSubscription2) {
      this.featureInfoSubscription2.unsubscribe();
    }
    if (this.analyzeSubscription) {
      this.analyzeSubscription.unsubscribe();
    }
    if (this.analyzeSubscription2) {
      this.analyzeSubscription2.unsubscribe();
    }
    if (this.languageSubscription) {
      this.languageSubscription.unsubscribe();
    }
    // Angular effects are automatically cleaned up on component destruction
  }

  /**
   * Reset the component state
   */
  private resetComponent(): void {
    // Cancel any ongoing requests
    if (this.featureInfoSubscription) {
      this.featureInfoSubscription.unsubscribe();
      this.featureInfoSubscription = undefined;
    }
    if (this.featureInfoSubscription2) {
      this.featureInfoSubscription2.unsubscribe();
      this.featureInfoSubscription2 = undefined;
    }
    if (this.analyzeSubscription) {
      this.analyzeSubscription.unsubscribe();
      this.analyzeSubscription = undefined;
    }
    if (this.analyzeSubscription2) {
      this.analyzeSubscription2.unsubscribe();
      this.analyzeSubscription2 = undefined;
    }
    // Clean up map
    this.places = [];
    this.categoryData = [];
    this.categoryLegendItems = [];
    this.composition = null;
    this.compositionActivityMeta = {};
    this.placesOverallMetricLabel = null;
    this.placesOverallMetricColor = null;
    this.placesMapAvailable = false;
    this.categoryColors.clear();
    this.selectedFeature = null;
    this.selectedFeatureId = null;
    this.featureInfo = null;
    this.featureInfoError = null;
    this.featureExcludedByFilter = false;
    this.isLoadingFeatureInfo = false;
    this.currentLoadingFeatureId = null;
    this.analyzeData = null;
    this.activityRows = null;
    this.isLoadingAnalyze = false;
    this.analyzeError = null;
    this.isLoadingPlaces = false;
    this.placesError = null;
    this.savedFeatureType = null;
    // Reset feature 2
    this.selectedFeature2 = null;
    this.selectedFeatureId2 = null;
    this.featureInfo2 = null;
    this.featureInfoError2 = null;
    this.featureExcludedByFilter2 = false;
    this.isLoadingFeatureInfo2 = false;
    this.currentLoadingFeatureId2 = null;
    this.analyzeData2 = null;
    this.isLoadingAnalyze2 = false;
    this.analyzeError2 = null;
    this.savedFeatureType2 = null;
    this.selectedCompareSide = 'left';
  }

  private getProfileContext(): { profileIds: number[]; filters: ContentLayerFilters } | null {
    const useRight =
      this.filterConfigService.isMapCompareMode() && this.selectedCompareSide === 'right';
    const profileIds = useRight
      ? this.filterConfigService.rightCurrentProfileIds()
      : this.filterConfigService.currentProfileIds();
    const filters = useRight
      ? this.filterConfigService.rightContentLayerFilters()
      : this.filterConfigService.contentLayerFilters();
    if (!profileIds?.length || !filters) {
      return null;
    }
    return { profileIds, filters };
  }
  
  /**
   * Reload data for currently selected features when filters change
   * This preserves the selected features but refreshes their data with new filter values
   * Waits for map to finish loading before executing the reload
   */
  private reloadDataForSelectedFeatures(): void {
    // Check if map is currently loading
    const isMapLoading = this.mapService.isMapLoading();
    
    if (isMapLoading) {
      // Map is still loading, set flag to reload when it finishes
      this.pendingReload = true;

      // Set loading state only because we are going to reload after the map is ready.
      // This prevents getting stuck in loading when `admin_level` changes but we don't reload.
      if (this.selectedFeature) {
        this.isLoadingFeatureInfo = true;
        this.isLoadingAnalyze = true;
      }
      if (this.selectedFeature2) {
        this.isLoadingFeatureInfo2 = true;
        this.isLoadingAnalyze2 = true;
      }

      return;
    }
    
    // Map is not loading, execute reload immediately
    this.executeReload();
  }

  /**
   * Execute the actual reload of data for selected features
   * This is called either immediately or after map finishes loading
   */
  private executeReload(): void {
    // Cancel any ongoing requests
    if (this.featureInfoSubscription) {
      this.featureInfoSubscription.unsubscribe();
      this.featureInfoSubscription = undefined;
    }
    if (this.featureInfoSubscription2) {
      this.featureInfoSubscription2.unsubscribe();
      this.featureInfoSubscription2 = undefined;
    }
    if (this.analyzeSubscription) {
      this.analyzeSubscription.unsubscribe();
      this.analyzeSubscription = undefined;
    }
    if (this.analyzeSubscription2) {
      this.analyzeSubscription2.unsubscribe();
      this.analyzeSubscription2 = undefined;
    }

    // Reset loading guards so cancelled in-flight requests do not block the reload
    this.isLoadingFeatureInfo = false;
    this.isLoadingAnalyze = false;
    this.isLoadingFeatureInfo2 = false;
    this.isLoadingAnalyze2 = false;
    this.currentLoadingFeatureId = null;
    this.currentLoadingFeatureId2 = null;
    
    // Clear error states but keep selected features
    this.featureInfoError = null;
    this.featureExcludedByFilter = false;
    this.analyzeError = null;
    this.placesError = null;
    this.featureInfoError2 = null;
    this.featureExcludedByFilter2 = false;
    this.analyzeError2 = null;
    
    // Clear data that will be reloaded
    this.featureInfo = null;
    this.analyzeData = null;
    this.activityRows = null;
    this.featureInfo2 = null;
    this.analyzeData2 = null;
    
    // Clear map data (will be reloaded if needed)
    this.places = [];
    this.categoryData = [];
    this.categoryLegendItems = [];
    this.composition = null;
    this.compositionActivityMeta = {};
    this.placesOverallMetricLabel = null;
    this.placesOverallMetricColor = null;
    this.placesMapAvailable = false;
    this.categoryColors.clear();
    this.isLoadingPlaces = false;
    
    // Reload data for feature 1 if selected
    if (this.selectedFeature && this.savedFeatureType) {
      this.loadFeatureInfo(this.selectedFeature);
    }
    
    // Reload data for feature 2 if selected
    if (this.selectedFeature2 && this.savedFeatureType2) {
      this.loadFeatureInfo2(this.selectedFeature2);
    }
  }
  
  /**
   * Clear comparison mode (remove feature 2)
   */
  /**
   * With a Regionalklassen/Bundesländer filter the backend ranks only matching
   * municipalities and answers 404 "... not found in rankings" for anything outside.
   */
  private isExcludedByFilterError(error: any): boolean {
    const message: string = error?.error?.error ?? '';
    return error?.status === 404 && /not found in rankings/i.test(message);
  }

  private getFeatureInfoErrorMessage(error: any): string {
    if (this.isExcludedByFilterError(error)) {
      return this.translate.instant('analyze.featureInfo.excludedByFilter');
    }
    if (error?.status === 404) {
      return this.translate.instant('analyze.featureInfo.notFound');
    }
    return this.translate.instant('analyze.featureInfo.errorLoading');
  }

  clearSelection(): void {
    this.featureSelectionService.setSelectedMapLibreFeature(null);
  }

  clearComparison(): void {
    this.featureSelectionService.clearComparison();
  }

  /**
   * Determines if we should show the map instead of the chart
   */
  shouldShowMap(): boolean {
    // Never show map in comparison mode, nor when the share disables places
    if (this.isComparisonMode || !this.shareAccess.canUsePlaces()) {
      return false;
    }
    const hasCategories = this.filterConfigService.hasCategories();
    const hasSingleCategory = this.analyzeData?.categories?.length === 1;
    return !hasCategories || hasSingleCategory;
  }

  getGrade(index: number): string {
    const indexValue = index / 100;
    if (indexValue <= 0) return this.translate.instant('map.popup.error');
    if (indexValue < 0.28) return "A+";
    if (indexValue < 0.32) return "A";
    if (indexValue < 0.35) return "A-";
    if (indexValue < 0.4) return "B+";
    if (indexValue < 0.45) return "B";
    if (indexValue < 0.5) return "B-";
    if (indexValue < 0.56) return "C+";
    if (indexValue < 0.63) return "C";
    if (indexValue < 0.71) return "C-";
    if (indexValue < 0.8) return "D+";
    if (indexValue < 0.9) return "D";
    if (indexValue < 1.0) return "D-";
    if (indexValue < 1.12) return "E+";
    if (indexValue < 1.26) return "E";
    if (indexValue < 1.41) return "E-";
    if (indexValue < 1.59) return "F+";
    if (indexValue < 1.78) return "F";
    return "F-";
  }

  getGradeColor(index: number, alpha = 0.7): string {
    return getGradeColor(index / 100, alpha);
  }

  /** Text colour that stays readable on top of the given rating colour. */
  getRatingTextColor(featureInfo: FeatureInfoResponse | null): string {
    return getContrastTextColor(this.getRatingColor(featureInfo, 1));
  }

  getContrastTextColor(color: string): string {
    return getContrastTextColor(color);
  }

  getScoreColor(score: number): string {
    return this.scoreColorsService.getColorForScore(score);
  }

  getRatingDisplay(featureInfo: FeatureInfoResponse | null): string {
    if (!featureInfo) {
      return '';
    }
    const bewertung = this.filterConfigService.selectedBewertung();
    if (bewertung === 'zeit') {
      // Convert score from seconds to minutes
      const minutes = formatNumber(featureInfo.score / 60, currentNumberLocale(this.translate), '1.1-1');
      const minLabel = this.translate.instant('map.popup.minutes');
      return `${minutes} ${minLabel}`;
    } else {
      return this.getGrade(featureInfo.index);
    }
  }

  getRatingLabelKey(): string {
    return this.filterConfigService.selectedBewertung() === 'zeit'
      ? 'analyze.time'
      : 'analyze.grade';
  }

  getRatingColor(featureInfo: FeatureInfoResponse | null, alpha = 0.7): string {
    if (!featureInfo) {
      return `rgba(128, 128, 128, ${alpha})`;
    }
    const bewertung = this.filterConfigService.selectedBewertung();
    if (bewertung === 'zeit') {
      return this.getScoreColor(featureInfo.score);
    } else {
      return this.getGradeColor(featureInfo.index, alpha);
    }
  }

  getRankPercentage(rank: number | null | undefined, totalRanks: number | null | undefined): string {
    if (!rank || !totalRanks || totalRanks === 0) {
      return 'N/A';
    }
    const percentage = Math.ceil((rank / totalRanks) * 100);
    return `Top ${percentage}%`;
  }

  getPopulationTooltip(population: number | null | undefined): string {
    if (population === null || population === undefined) {
      return '';
    }
    const populationLabel = this.translate.instant('analyze.population');
    return `${populationLabel}: ${formatNumber(population, currentNumberLocale(this.translate), '1.0-0')}`;
  }

  private loadFeatureInfo(feature: any): void {
    const map = this.mapService.getMap();
    if (!map) {
      console.warn('Map not available for feature info');
      return;
    }

    const featureIdRaw = feature.properties.id || feature.id;
    if (!featureIdRaw) {
      console.warn('Feature ID not available');
      return;
    }

    // Convert to number if needed
    const featureId = typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
    if (isNaN(featureId)) {
      console.warn('Invalid feature ID:', featureIdRaw);
      return;
    }

    // Keep the raw id for subtle UI hints (e.g. "Hexagon {id}")
    this.selectedFeatureId = featureId;

    // Prevent duplicate requests for the same feature
    if ((this.isLoadingFeatureInfo || this.isLoadingAnalyze) && this.currentLoadingFeatureId === featureId) {
      console.log('Feature data request already in progress for feature:', featureId);
      return;
    }

    // Cancel any existing requests
    if (this.featureInfoSubscription) {
      this.featureInfoSubscription.unsubscribe();
      this.featureInfoSubscription = undefined;
    }
    if (this.analyzeSubscription) {
      this.analyzeSubscription.unsubscribe();
      this.analyzeSubscription = undefined;
    }
    
    // Clean up existing map if switching features
    this.places = [];
    this.categoryData = [];
    this.categoryLegendItems = [];
    this.composition = null;
    this.compositionActivityMeta = {};
    this.placesOverallMetricLabel = null;
    this.placesOverallMetricColor = null;
    this.placesMapAvailable = false;
    this.categoryColors.clear();
    this.isLoadingPlaces = false;
    this.placesError = null;

    // Use saved feature type (already extracted when feature was selected)
    if (!this.savedFeatureType) {
      console.error('Feature type not available - should have been set when feature was selected');
      this.featureInfoError = this.translate.instant('analyze.featureInfo.errorLoading');
      return;
    }
    const featureType = this.savedFeatureType;

    const profileContext = this.getProfileContext();
    if (!profileContext) {
      console.warn('Profile combination or filters not available');
      return;
    }
    const { profileIds, filters } = profileContext;

    // Mark that we're loading this feature
    this.currentLoadingFeatureId = featureId;
    this.isLoadingFeatureInfo = true;
    this.isLoadingAnalyze = true;
    this.featureInfoError = null;
    this.featureExcludedByFilter = false;
    this.analyzeError = null;

    // Prepare both API calls
    const featureInfoRequest = this.mapService.getFeatureInfo({
      feature_type: featureType,
      feature_id: featureId,
      profile_ids: profileIds,
      category_ids: filters.category_ids,
      persona_id: filters.persona_id,
      regiostar_ids: filters.regiostar_ids,
      state_ids: filters.state_ids
    }).pipe(
      catchError((error) => {
        console.error('Error loading feature info:', error);
        this.featureExcludedByFilter = this.isExcludedByFilterError(error);
        this.featureInfoError = this.getFeatureInfoErrorMessage(error);
        return of(null);
      })
    );

    const analyzeRequest = this.analyzeService.getAnalyze({
      feature_type: featureType,
      feature_id: featureId,
      profile_ids: profileIds,
      category_ids: filters.category_ids,
      persona_id: filters.persona_id,
      top5: true
    }).pipe(
      catchError((error) => {
        console.error('Error loading analyze data:', error);
        if (error.status === 404) {
          this.analyzeError = this.translate.instant('analyze.analyzeData.notFound');
        } else if (error.status === 503) {
          this.analyzeError = this.translate.instant('analyze.analyzeData.errorLoading');
        } else {
          this.analyzeError = this.translate.instant('analyze.analyzeData.errorLoading');
        }
        return of(null);
      })
    );

    this.featureInfoSubscription = forkJoin({
      featureInfo: featureInfoRequest,
      analyzeData: analyzeRequest
    }).subscribe((result: any) => {
      this.isLoadingFeatureInfo = false;
      this.isLoadingAnalyze = false;
      this.currentLoadingFeatureId = null;

      this.featureInfo = result.featureInfo;
      this.analyzeData = result.analyzeData;

      if (this.shouldShowMap()) {
        this.loadPlacesForMap();
      } else if (this.isComparisonMode && this.analyzeData2 && this.analyzeData2.categories) {
        this.initializeComparisonActivitiesChart();
      } else if (result.analyzeData && result.analyzeData.categories) {
        this.initializeActivitiesChart(result.analyzeData.categories);
      } else {
        this.activityRows = null;
      }

      this.featureInfoSubscription = undefined;
    });
  }

  private loadFeatureInfo2(feature: any): void {
    const map = this.mapService.getMap();
    if (!map) {
      console.warn('Map not available for feature info 2');
      return;
    }

    const featureIdRaw = feature.properties.id || feature.id;
    if (!featureIdRaw) {
      console.warn('Feature ID not available for feature 2');
      return;
    }

    // Convert to number if needed
    const featureId = typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
    if (isNaN(featureId)) {
      console.warn('Invalid feature ID for feature 2:', featureIdRaw);
      return;
    }

    // Keep the raw id for subtle UI hints (e.g. "Hexagon {id}")
    this.selectedFeatureId2 = featureId;

    // Prevent duplicate requests for the same feature
    if ((this.isLoadingFeatureInfo2 || this.isLoadingAnalyze2) && this.currentLoadingFeatureId2 === featureId) {
      console.log('Feature 2 data request already in progress for feature:', featureId);
      return;
    }

    // Cancel any existing requests
    if (this.featureInfoSubscription2) {
      this.featureInfoSubscription2.unsubscribe();
      this.featureInfoSubscription2 = undefined;
    }
    if (this.analyzeSubscription2) {
      this.analyzeSubscription2.unsubscribe();
      this.analyzeSubscription2 = undefined;
    }

    // Use saved feature type (already extracted when feature was selected)
    if (!this.savedFeatureType2) {
      console.error('Feature type not available for feature 2 - should have been set when feature was selected');
      this.featureInfoError2 = this.translate.instant('analyze.featureInfo.errorLoading');
      return;
    }
    const featureType = this.savedFeatureType2;

    // Get profile combination ID
    const profileIds = this.filterConfigService.currentProfileIds();
    if (!profileIds?.length) {
      console.warn('Profile combination ID not available for feature 2');
      return;
    }

    // Get current filters
    const filters = this.filterConfigService.contentLayerFilters();
    if (!filters) {
      console.warn('Content layer filters not available for feature 2');
      return;
    }

    // Mark that we're loading this feature
    this.currentLoadingFeatureId2 = featureId;
    this.isLoadingFeatureInfo2 = true;
    this.isLoadingAnalyze2 = true;
    this.featureInfoError2 = null;
    this.featureExcludedByFilter2 = false;
    this.analyzeError2 = null;

    // Prepare both API calls
    const featureInfoRequest = this.mapService.getFeatureInfo({
      feature_type: featureType,
      feature_id: featureId,
      profile_ids: profileIds,
      category_ids: filters.category_ids,
      persona_id: filters.persona_id,
      regiostar_ids: filters.regiostar_ids,
      state_ids: filters.state_ids
    }).pipe(
      catchError((error) => {
        console.error('Error loading feature info 2:', error);
        this.featureExcludedByFilter2 = this.isExcludedByFilterError(error);
        this.featureInfoError2 = this.getFeatureInfoErrorMessage(error);
        return of(null);
      })
    );

    const analyzeRequest = this.analyzeService.getAnalyze({
      feature_type: featureType,
      feature_id: featureId,
      profile_ids: profileIds,
      category_ids: filters.category_ids,
      persona_id: filters.persona_id,
      top5: true
    }).pipe(
      catchError((error) => {
        console.error('Error loading analyze data 2:', error);
        if (error.status === 404) {
          this.analyzeError2 = this.translate.instant('analyze.analyzeData.notFound');
        } else if (error.status === 503) {
          this.analyzeError2 = this.translate.instant('analyze.analyzeData.errorLoading');
        } else {
          this.analyzeError2 = this.translate.instant('analyze.analyzeData.errorLoading');
        }
        return of(null);
      })
    );

    this.featureInfoSubscription2 = forkJoin({
      featureInfo: featureInfoRequest,
      analyzeData: analyzeRequest
    }).subscribe((result: any) => {
      this.isLoadingFeatureInfo2 = false;
      this.isLoadingAnalyze2 = false;
      this.currentLoadingFeatureId2 = null;

      this.featureInfo2 = result.featureInfo;
      this.analyzeData2 = result.analyzeData;

      if (this.isComparisonMode) {
        if (this.analyzeData && this.analyzeData.categories && this.analyzeData2 && this.analyzeData2.categories) {
          this.initializeComparisonActivitiesChart();
        }
      }

      this.featureInfoSubscription2 = undefined;
    });
  }

  private async loadPlacesForMap(): Promise<void> {
    if (!this.selectedFeature || !this.analyzeData) {
      return;
    }

    const map = this.mapService.getMap();
    if (!map) {
      console.warn('Map not available for places');
      return;
    }

    const featureIdRaw = this.selectedFeature.properties.id || this.selectedFeature.id;
    if (!featureIdRaw) {
      console.warn('Feature ID not available');
      return;
    }

    const featureId = typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
    if (isNaN(featureId)) {
      console.warn('Invalid feature ID:', featureIdRaw);
      return;
    }

    // Use saved feature type (must be set when feature is selected)
    if (!this.savedFeatureType) {
      console.error('Feature type not available - cannot load places');
      this.placesError = this.translate.instant('analyze.placesDialog.errorLoadingPlaces');
      return;
    }
    const featureType = this.savedFeatureType;
    const profileContext = this.getProfileContext();
    if (!profileContext) {
      console.warn('Profile IDs not available');
      return;
    }
    const { profileIds } = profileContext;
    
    this.isLoadingPlaces = true;
    this.placesError = null;
    this.placesMapAvailable =
      featureType === 'municipality' || featureType === 'hexagon';

    try {
      const categoryIds = this.analyzeData.categories.map(cat => cat.category_id);

      const placesResponse = await firstValueFrom(
        this.placesService.getPlaces({
          feature_type: featureType,
          feature_id: featureId,
          profile_ids: profileIds,
          category_ids: categoryIds.length > 0 ? categoryIds : undefined,
          simplified: true,
        })
      );

      this.places = (placesResponse.places || []).filter(
        p => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon)
      );
      this.composition = placesResponse.composition ?? null;

      if (placesResponse.categories) {
        this.categoryData = placesResponse.categories
          .map(cat => ({
            name: cat.category_name,
            weight: cat.weight,
            score: cat.activityScore?.score ?? 0,
            index: cat.activityScore?.index ?? 0,
            activity_id: cat.activity_id,
            places: cat.places.filter(p => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon))
          }))
          .sort((a, b) => b.weight - a.weight);
      }

      this.assignCategoryColors();
      this.syncCompositionActivityMeta(placesResponse.categories);
      this.setPlacesOverallMetricFromAnalyze();

      this.isLoadingPlaces = false;
    } catch (err: any) {
      this.isLoadingPlaces = false;
      if (this.shareAccess.handleForbidden(err)) {
        // The share disables places: fall back to the activity list without an error.
        this.placesMapAvailable = false;
        if (this.analyzeData?.categories?.length) {
          this.initializeActivitiesChart(this.analyzeData.categories);
        }
        return;
      }
      console.error('Error loading places:', err);
      this.placesError = err?.message || this.translate.instant('analyze.placesDialog.errorLoadingPlaces');
    }
  }

  /** Rebuilds the activity rows (e.g. after a language change, for translated units). */
  private refreshActivityRows(): void {
    if (!this.activityRows) {
      return;
    }
    if (this.isComparisonMode) {
      this.initializeComparisonActivitiesChart();
    } else if (this.analyzeData?.categories) {
      this.initializeActivitiesChart(this.analyzeData.categories);
    }
  }

  private initializeComparisonActivitiesChart(): void {
    if (!this.analyzeData?.categories || !this.analyzeData2?.categories) {
      this.activityRows = null;
      return;
    }

    const rowMap = new Map<number, ActivityRow>();
    for (const cat of this.analyzeData.categories) {
      rowMap.set(cat.category_id, {
        category: cat,
        values: [this.toActivityValue(cat), null],
      });
    }
    for (const cat of this.analyzeData2.categories) {
      const existing = rowMap.get(cat.category_id);
      if (existing) {
        existing.values[1] = this.toActivityValue(cat);
      } else {
        rowMap.set(cat.category_id, {
          category: cat,
          values: [null, this.toActivityValue(cat)],
        });
      }
    }

    const maxWeight = (row: ActivityRow) =>
      Math.max(...row.values.map(v => v?.relevance ?? 0));
    this.activityRows = Array.from(rowMap.values())
      .sort((a, b) => maxWeight(b) - maxWeight(a))
      .slice(0, 5);
  }

  private initializeActivitiesChart(categories: CategoryScore[]): void {
    if (!categories || categories.length === 0) {
      this.activityRows = null;
      return;
    }

    this.activityRows = [...categories]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map(cat => ({ category: cat, values: [this.toActivityValue(cat)] }));
  }

  private toActivityValue(cat: CategoryScore): ActivityValue {
    const isScoreMode = this.filterConfigService.selectedBewertung() === 'zeit';
    return {
      relevance: cat.weight * 100,
      color: isScoreMode
        ? this.scoreColorsService.getColorForScore(cat.score)
        : this.getGradeColor(cat.index, 1),
      rating: isScoreMode
        ? `${formatNumber(cat.score / 60, currentNumberLocale(this.translate), '1.1-1')} ${this.translate.instant('map.popup.minutes')}`
        : this.getGrade(cat.index),
    };
  }

  /** Bar width on an absolute 0–100 % scale (relevances of all activities sum to 100 %). */
  getActivityBarWidth(value: ActivityValue | null): number {
    return value ? Math.min(100, Math.max(0, value.relevance)) : 0;
  }

  onActivityRowClick(row: ActivityRow, featureNumber?: 1 | 2): void {
    const category = row.category;
    if (!category?.category_id) {
      return;
    }
    this.openPlacesDialog(category.category_id, category.category_name, featureNumber);
  }

  onCategoryNameClick(category: CategoryScore): void {
    if (!category) {
      return;
    }

    // Use category_id directly from the API response
    if (!category.category_id) {
      console.warn('Category ID not available for category:', category.category_name);
      return;
    }

    // When clicking category name, always use the first feature
    const featureNumber: 1 | undefined = this.isComparisonMode ? 1 : undefined;

    // Open places dialog with the specific category_id and feature number
    this.openPlacesDialog(category.category_id, category.category_name, featureNumber);
  }

  getSortedCategories(): CategoryScore[] {
    if (this.isComparisonMode) {
      // In comparison mode, return categories from both features combined
      const categoryMap = new Map<number, CategoryScore>();
      
      if (this.analyzeData?.categories) {
        this.analyzeData.categories.forEach(cat => {
          categoryMap.set(cat.category_id, cat);
        });
      }
      
      if (this.analyzeData2?.categories) {
        this.analyzeData2.categories.forEach(cat => {
          const existing = categoryMap.get(cat.category_id);
          if (!existing || cat.weight > existing.weight) {
            categoryMap.set(cat.category_id, cat);
          }
        });
      }
      
      return Array.from(categoryMap.values())
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5);
    }
    
    if (!this.analyzeData || !this.analyzeData.categories) {
      return [];
    }
    return [...this.analyzeData.categories]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
  }

  /**
   * Returns true if any content is currently loading
   */
  isLoading(): boolean {
    return this.isLoadingFeatureInfo || this.isLoadingAnalyze || this.isLoadingPlaces ||
           this.isLoadingFeatureInfo2 || this.isLoadingAnalyze2;
  }

  private assignCategoryColors(): void {
    this.categoryColors.clear();
    this.categoryLegendItems = [];

    const totalWeight = this.categoryData.reduce((sum, cat) => sum + cat.weight, 0);

    this.categoryData.forEach((category, index) => {
      if (category.name && !this.categoryColors.has(category.name)) {
        const color = this.getPlacesMetricTextColor(category.score, category.index);
        this.categoryColors.set(category.name, color);

        const relevance = totalWeight > 0 ? (category.weight / totalWeight) * 100 : 0;

        this.categoryLegendItems.push({
          name: category.name,
          color,
          weight: category.weight,
          relevance,
          enabled: true,
          score: category.score,
          index: category.index,
          activity_id: category.activity_id,
        });
      }
    });
  }

  private syncCompositionActivityMeta(
    categories?: Array<{ activity_id?: number; role_hint?: 'primary' | 'substitute' }>
  ): void {
    const totalWeight = this.categoryData.reduce((sum, cat) => sum + cat.weight, 0);
    const next: Record<number, CompositionActivityMeta> = {};
    for (const cat of this.categoryData) {
      if (cat.activity_id == null) {
        continue;
      }
      const apiCat = categories?.find((c) => c.activity_id === cat.activity_id);
      const prev = this.compositionActivityMeta[cat.activity_id];
      next[cat.activity_id] = {
        name: cat.name,
        color: this.categoryColors.get(cat.name),
        weight: cat.weight,
        relevance: totalWeight > 0 ? (cat.weight / totalWeight) * 100 : 0,
        enabled: true,
        score: cat.score,
        index: cat.index,
        role_hint: apiCat?.role_hint ?? prev?.role_hint,
        metricLabel: this.formatPlacesMetric(cat.score, cat.index),
        metricColor: this.getPlacesMetricTextColor(cat.score, cat.index),
      };
    }
    this.compositionActivityMeta = next;
  }

  /** Reformat composition / legend metrics after quality ↔ time toggle. */
  private refreshPlacesMetricDisplay(): void {
    if (this.categoryData.length > 0) {
      this.assignCategoryColors();
      this.syncCompositionActivityMeta();
    }
    this.setPlacesOverallMetricFromAnalyze();
  }

  /** Overall from backend: composition.activityScore, else analyze category. */
  private setPlacesOverallMetricFromAnalyze(): void {
    const fromComposition = this.composition?.activityScore;
    if (fromComposition) {
      this.placesOverallMetricLabel = this.formatPlacesMetric(
        fromComposition.score,
        fromComposition.index
      );
      this.placesOverallMetricColor = this.getPlacesMetricTextColor(
        fromComposition.score,
        fromComposition.index
      );
      return;
    }

    const category = this.analyzeData?.categories?.[0];
    if (!category) {
      this.placesOverallMetricLabel = null;
      this.placesOverallMetricColor = null;
      return;
    }
    this.placesOverallMetricLabel = this.formatPlacesMetric(category.score, category.index);
    this.placesOverallMetricColor = this.getPlacesMetricTextColor(category.score, category.index);
  }

  private formatPlacesMetric(score: number, index: number): string {
    if (this.getPlacesIsScoreMode()) {
      const minutes = (score / 60).toFixed(1);
      return `${minutes} ${this.translate.instant('map.popup.minutes')}`;
    }
    return this.getGrade(index);
  }

  /** Bound for composition panel AND/OR/SUBST headers. */
  readonly formatCompositionMetric = (
    score: number,
    index: number
  ): { label: string; color: string } => ({
    label: this.formatPlacesMetric(score, index),
    color: this.getPlacesMetricTextColor(score, index),
  });

  getPlacesIsScoreMode(): boolean {
    return this.filterConfigService.selectedBewertung() === 'zeit';
  }

  private getPlacesScoreColor(score: number): string {
    return this.scoreColorsService.getColorForScore(score);
  }

  private getPlacesIndexTextColor(index: number): string {
    const indexValue = index / 100;
    if (indexValue <= 0) return 'rgb(128, 128, 128)';
    if (indexValue < 0.35) return 'rgb(50, 97, 45)';
    if (indexValue < 0.5) return 'rgb(60, 176, 67)';
    if (indexValue < 0.71) return 'rgb(238, 210, 2)';
    if (indexValue < 1.0) return 'rgb(237, 112, 20)';
    if (indexValue < 1.41) return 'rgb(194, 24, 7)';
    return 'rgb(197, 136, 187)';
  }

  getPlacesMetricTextColor(score: number, index: number): string {
    return this.getPlacesIsScoreMode()
      ? this.getPlacesScoreColor(score)
      : this.getPlacesIndexTextColor(index);
  }

  openMiniMapPlacesDetails(): void {
    if (!this.placesMapAvailable) {
      return;
    }
    const category = this.analyzeData?.categories?.[0];
    if (category) {
      this.openPlacesDialog(category.category_id, category.category_name, 1);
      return;
    }
    this.openPlacesDialog(undefined, undefined, 1);
  }

  private getOverlayDialogSize(): { width: string; maxWidth: string; maxHeight: string } {
    if (this.mobileUi.isMobile()) {
      return { width: '100vw', maxWidth: '100vw', maxHeight: '95vh' };
    }
    return { width: '95vw', maxWidth: '1400px', maxHeight: '90vh' };
  }

  openAllCategoriesOverlay(): void {
    if (!this.selectedFeature) {
      return;
    }

    const map = this.mapService.getMap();
    if (!map) {
      console.warn('Map not available for all categories');
      return;
    }

    const featureIdRaw = this.selectedFeature.properties.id || this.selectedFeature.id;
    if (!featureIdRaw) {
      console.warn('Feature ID not available');
      return;
    }

    const featureId = typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
    if (isNaN(featureId)) {
      console.warn('Invalid feature ID:', featureIdRaw);
      return;
    }

    // Use saved feature type (must be set when feature is selected)
    if (!this.savedFeatureType) {
      console.error('Feature type not available - cannot open all categories dialog');
      return;
    }
    const featureType = this.savedFeatureType;
    const profileContext = this.getProfileContext();
    if (!profileContext) {
      console.warn('Profile IDs not available');
      return;
    }
    const { profileIds, filters } = profileContext;

    const isScoreMode = filters.feature_type === 'score';
    
    // Check if we're in comparison mode
    const isComparisonMode = this.isComparisonMode;
    let featureId2: number | undefined;
    let featureType2: 'municipality' | 'hexagon' | 'county' | 'state' | undefined;
    let featureName2: string | undefined;
    
    if (isComparisonMode && this.selectedFeature2) {
      const featureIdRaw2 = this.selectedFeature2.properties.id || this.selectedFeature2.id;
      if (featureIdRaw2) {
        const id2 = typeof featureIdRaw2 === 'string' ? parseInt(featureIdRaw2, 10) : featureIdRaw2;
        if (!isNaN(id2)) {
          featureId2 = id2;
          featureType2 = this.savedFeatureType2 || undefined;
          featureName2 = this.featureInfo2?.name;
        }
      }
    }
    
    const dialogData: AllCategoriesDialogData = {
      featureType: featureType,
      featureId: featureId,
      profileIds: profileIds,
      categoryIds: filters.category_ids,
      personaId: filters.persona_id,
      isScoreMode: isScoreMode,
      featureName: this.featureInfo?.name,
      getGrade: (index: number) => this.getGrade(index),
      isComparisonMode: isComparisonMode,
      featureId2: featureId2,
      featureType2: featureType2,
      featureName2: featureName2
    };

    if (this.mobileUi.isMobile()) {
      this.mobileUi.openAnalyzeSubSheet('analyze-activities', dialogData);
      return;
    }

    this.dialog.open(AllCategoriesDialogComponent, {
      ...this.getOverlayDialogSize(),
      panelClass: 'all-categories-dialog-panel',
      data: dialogData,
    });
  }

  openPlacesDialog(categoryId?: number, categoryName?: string, featureNumber?: 1 | 2): void {
    if (!this.selectedFeature || !this.shareAccess.canUsePlaces()) {
      return;
    }

    const map = this.mapService.getMap();
    if (!map) {
      console.warn('Map not available for places dialog');
      return;
    }

    // Determine which feature to use for places dialog
    // Places are only supported for municipality/hexagon
    let featureType: 'municipality' | 'hexagon' | 'county' | 'state';
    let featureId: number;
    
    // If featureNumber is specified (from chart click), use that feature if supported
    if (featureNumber === 1) {
      if (!this.savedFeatureType) {
        console.error('Feature type 1 not available - cannot open places dialog');
        return;
      }
      featureType = this.savedFeatureType;
      const featureIdRaw = this.selectedFeature.properties.id || this.selectedFeature.id;
      if (!featureIdRaw) {
        console.warn('Feature ID not available');
        return;
      }
      featureId = typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
      if (isNaN(featureId)) {
        console.warn('Invalid feature ID:', featureIdRaw);
        return;
      }
    } else if (featureNumber === 2) {
      if (!this.savedFeatureType2 || !this.selectedFeature2) {
        console.error('Feature type 2 not available - cannot open places dialog');
        return;
      }
      featureType = this.savedFeatureType2;
      const featureIdRaw2 = this.selectedFeature2.properties.id || this.selectedFeature2.id;
      if (!featureIdRaw2) {
        console.warn('Feature ID 2 not available');
        return;
      }
      featureId = typeof featureIdRaw2 === 'string' ? parseInt(featureIdRaw2, 10) : featureIdRaw2;
      if (isNaN(featureId)) {
        console.warn('Invalid feature ID 2:', featureIdRaw2);
        return;
      }
    } else {
      // No specific feature requested - use smart fallback logic
      // Check if first feature type is supported
      if (!this.savedFeatureType) {
        console.error('Feature type not available - cannot open places dialog');
        return;
      }
      
      const isFirstFeatureSupported = this.savedFeatureType === 'municipality' || this.savedFeatureType === 'hexagon';
      
      if (isFirstFeatureSupported) {
        // Use first feature
        featureType = this.savedFeatureType;
        const featureIdRaw = this.selectedFeature.properties.id || this.selectedFeature.id;
        if (!featureIdRaw) {
          console.warn('Feature ID not available');
          return;
        }
        featureId = typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
        if (isNaN(featureId)) {
          console.warn('Invalid feature ID:', featureIdRaw);
          return;
        }
      } else if (this.isComparisonMode && this.selectedFeature2 && this.savedFeatureType2) {
        // First feature not supported, check if second feature is supported
        const isSecondFeatureSupported = this.savedFeatureType2 === 'municipality' || this.savedFeatureType2 === 'hexagon';
        if (isSecondFeatureSupported) {
          // Use second feature
          featureType = this.savedFeatureType2;
          const featureIdRaw2 = this.selectedFeature2.properties.id || this.selectedFeature2.id;
          if (!featureIdRaw2) {
            console.warn('Feature ID 2 not available');
            return;
          }
          featureId = typeof featureIdRaw2 === 'string' ? parseInt(featureIdRaw2, 10) : featureIdRaw2;
          if (isNaN(featureId)) {
            console.warn('Invalid feature ID 2:', featureIdRaw2);
            return;
          }
        } else {
          // Neither feature is supported, use first feature (dialog will show error)
          featureType = this.savedFeatureType;
          const featureIdRaw = this.selectedFeature.properties.id || this.selectedFeature.id;
          if (!featureIdRaw) {
            console.warn('Feature ID not available');
            return;
          }
          featureId = typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
          if (isNaN(featureId)) {
            console.warn('Invalid feature ID:', featureIdRaw);
            return;
          }
        }
      } else {
        // Not in comparison mode or second feature not available, use first feature (dialog will show error)
        featureType = this.savedFeatureType;
        const featureIdRaw = this.selectedFeature.properties.id || this.selectedFeature.id;
        if (!featureIdRaw) {
          console.warn('Feature ID not available');
          return;
        }
        featureId = typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
        if (isNaN(featureId)) {
          console.warn('Invalid feature ID:', featureIdRaw);
          return;
        }
      }
    }

    const profileContext = this.getProfileContext();
    if (!profileContext) {
      console.warn('Profile IDs not available');
      return;
    }
    const { profileIds, filters } = profileContext;

    const analyzeForFeature =
      featureNumber === 2 ? this.analyzeData2 : this.analyzeData;
    let categoryScore: number | undefined;
    let categoryIndex: number | undefined;
    if (categoryId != null) {
      const match = analyzeForFeature?.categories?.find(
        (c) => c.category_id === categoryId
      );
      categoryScore = match?.score;
      categoryIndex = match?.index;
    } else if (analyzeForFeature?.categories?.length === 1) {
      categoryScore = analyzeForFeature.categories[0].score;
      categoryIndex = analyzeForFeature.categories[0].index;
    }

    // Name of whichever place the branches above settled on (first or comparison place).
    const feature2IdRaw = this.selectedFeature2?.properties.id || this.selectedFeature2?.id;
    const usesFeature2 = feature2IdRaw != null && Number(feature2IdRaw) === featureId;

    const placesData: PlacesDialogData = {
      featureType: featureType,
      featureId: featureId,
      profileIds: profileIds,
      categoryIds: categoryId ? [categoryId] : filters.category_ids,
      personaId: filters.persona_id,
      categoryNames: categoryName || '',
      isScoreMode: filters.feature_type === 'score',
      categoryScore,
      categoryIndex,
      featureName: usesFeature2 ? this.featureInfo2?.name : this.featureInfo?.name,
    };

    if (this.mobileUi.isMobile()) {
      this.mobileUi.openAnalyzeSubSheet('analyze-places', placesData);
      return;
    }

    this.dialog.open(PlacesDialogComponent, {
      width: '85vw',
      maxWidth: '1200px',
      maxHeight: '85vh',
      panelClass: 'places-dialog-panel',
      data: placesData,
    });
  }

}
