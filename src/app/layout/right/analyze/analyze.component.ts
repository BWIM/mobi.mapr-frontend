import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef, AfterViewInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, catchError, of, forkJoin, firstValueFrom } from 'rxjs';
import { FeatureSelectionService } from '../../../shared/services/feature-selection.service';
import { MapService, FeatureInfoResponse, ContentLayerFilters } from '../../../services/map.service';
import { FilterConfigService } from '../../../services/filter-config.service';
import { AnalyzeService, AnalyzeResponse, CategoryScore, PersonaBreakdown } from '../../../services/analyze.service';
import { ProjectsService } from '../../../services/project.service';
import { PlacesService, Place } from '../../../services/places.service';
import { UIChart } from 'primeng/chart';
import { ChartModule } from 'primeng/chart';
import { MatDialog } from '@angular/material/dialog';
import { SharedModule } from '../../../shared/shared.module';
import { AllCategoriesDialogComponent, AllCategoriesDialogData } from './overlay/all-categories-dialog.component';
import { PlacesDialogComponent, PlacesDialogData } from './places/places-dialog.component';
import { PersonasDialogComponent, PersonasDialogData } from './overlay/personas-dialog.component';
import { Map as MapLibreMap, NavigationControl, FullscreenControl, Popup, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-analyze',
  imports: [CommonModule, ChartModule, SharedModule, TranslateModule],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css',
})
export class AnalyzeComponent implements OnInit, OnDestroy, AfterViewInit {
  selectedFeature: any | null = null;
  featureInfo: FeatureInfoResponse | null = null;
  isLoadingFeatureInfo: boolean = false;
  featureInfoError: string | null = null;
  
  // Second feature for comparison
  selectedFeature2: any | null = null;
  featureInfo2: FeatureInfoResponse | null = null;
  isLoadingFeatureInfo2: boolean = false;
  featureInfoError2: string | null = null;
  
  // Analyze chart data
  analyzeData: AnalyzeResponse | null = null;
  isLoadingAnalyze: boolean = false;
  analyzeError: string | null = null;
  activitiesChartData: any = null;
  activitiesChartOptions: any = null;
  
  // Analyze chart data for feature 2
  analyzeData2: AnalyzeResponse | null = null;
  isLoadingAnalyze2: boolean = false;
  analyzeError2: string | null = null;
  
  // Personas chart data
  personasData: PersonaBreakdown[] | null = null;
  isLoadingPersonas: boolean = false;
  personasError: string | null = null;
  personasChartData: any = null;
  personasChartOptions: any = null;
  
  // Personas chart data for feature 2
  personasData2: PersonaBreakdown[] | null = null;
  isLoadingPersonas2: boolean = false;
  personasError2: string | null = null;
  
  // Map data
  @ViewChild('mapContainerMini') mapContainerMini?: ElementRef;
  private map?: MapLibreMap;
  private popup?: Popup;
  private places: Place[] = [];
  private categoryData: Array<{ name: string; weight: number; score: number; index: number; places: Place[] }> = [];
  private categoryColors = new Map<string, string>();
  categoryLegendItems: Array<{ name: string; color: string; weight: number; relevance: number; enabled: boolean; score: number; index: number }> = [];
  isLoadingPlaces: boolean = false;
  placesError: string | null = null;
  private pendingFeatureShape: any = null;
  private colorPalette = [
    '#FF0000', '#00FF00', '#0066FF', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80',
    '#EC7063', '#5DADE2', '#58D68D', '#F4D03F', '#AF7AC5'
  ];

  // Pastel colors for category dots and circle fills (NOT tied to score/index)
  private pastelCategoryColors = [
    '#FAD7A0', // warm pastel
    '#AEC6CF', // soft blue/gray
    '#C5E1A5', // soft green
    '#FFCDD2', // soft red/pink
    '#B3E5FC', // light blue
    '#E1BEE7', // light purple
    '#FFE0B2', // light amber
    '#C8E6C9', // pale green
    '#D1C4E9', // pale violet
    '#FFECB3'  // soft yellow
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

  // Time (score) colors - must match map.service.ts getScoreFillColorExpression()
  timeColors = [
    { value: '0-7', color: 'rgb(23, 25, 63)' },
    { value: '8-15', color: 'rgb(43, 40, 105)' },
    { value: '16-23', color: 'rgb(74, 89, 160)' },
    { value: '24-30', color: 'rgb(90, 135, 185)' },
    { value: '31-45', color: 'rgb(121, 194, 230)' },
    { value: '45+', color: 'rgb(162, 210, 235)' }
  ];
  
  @ViewChild('activitiesChart') activitiesChart?: UIChart;
  @ViewChild('personasChart') personasChart?: UIChart;
  
  private featureSelectionService = inject(FeatureSelectionService);
  private mapService = inject(MapService);
  private filterConfigService = inject(FilterConfigService);
  private analyzeService = inject(AnalyzeService);
  private projectsService = inject(ProjectsService);
  private placesService = inject(PlacesService);
  private dialog = inject(MatDialog);
  private translate = inject(TranslateService);
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
  
  // Comparison mode computed property
  get isComparisonMode(): boolean {
    return this.selectedFeature !== null && this.selectedFeature2 !== null;
  }

  constructor() {
    // Watch for filter changes and reload data instead of resetting
    effect(() => {
      const filters = this.filterConfigService.contentLayerFilters();
      
      // Skip reload on initial load
      if (this.isInitialFilterLoad) {
        this.previousFilters = filters ? { ...filters } : null;
        this.isInitialFilterLoad = false;
        return;
      }
      
      // Only reload if filters actually changed
      if (filters && this.previousFilters) {
        const filtersChanged = 
          this.previousFilters.profile_combination_id !== filters.profile_combination_id ||
          JSON.stringify(this.previousFilters.state_ids?.sort()) !== JSON.stringify(filters.state_ids?.sort()) ||
          JSON.stringify(this.previousFilters.category_ids?.sort()) !== JSON.stringify(filters.category_ids?.sort()) ||
          this.previousFilters.persona_id !== filters.persona_id ||
          this.previousFilters.regiotyp_id !== filters.regiotyp_id ||
          JSON.stringify(this.previousFilters.regiostar_ids?.sort()) !== JSON.stringify(filters.regiostar_ids?.sort());
        
        if (filtersChanged) {
          // Reload data for selected features instead of resetting
          // Wait for map to finish loading first
          this.reloadDataForSelectedFeatures();
        }
      } else if (filters !== this.previousFilters) {
        // Filters changed from null to non-null or vice versa - reset component
        this.resetComponent();
      }
      
      this.previousFilters = filters ? { ...filters } : null;
    });

    effect(() => {
      const isMapLoading = this.mapService.isMapLoading();
      if (!isMapLoading && this.pendingReload) {
        this.pendingReload = false;
        this.executeReload();
      }
    });
  }

  ngOnInit() {
    // Subscribe to feature selection changes
    this.featureSubscription = this.featureSelectionService.selectedMapLibreFeature$.subscribe(
      (feature) => {
        if (feature) {
          this.selectedFeature = feature;
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
            this.analyzeData = null;
            this.personasData = null;
            this.activitiesChartData = null;
            this.personasChartData = null;
            // Reinitialize charts with feature 2 data only
            if (this.analyzeData2 && this.analyzeData2.categories) {
              this.initializeActivitiesChart(this.analyzeData2.categories);
            }
            if (this.personasData2 && this.personasData2.length > 0) {
              this.initializePersonasChart(this.personasData2);
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
          this.analyzeData2 = null;
          this.personasData2 = null;
          this.savedFeatureType2 = null;
          // If feature 1 is also null, do full reset
          if (!this.selectedFeature) {
            this.resetComponent();
          } else {
            // Reinitialize charts with feature 1 data only
            if (this.analyzeData && this.analyzeData.categories) {
              this.initializeActivitiesChart(this.analyzeData.categories);
            }
            if (this.personasData && this.personasData.length > 0) {
              this.initializePersonasChart(this.personasData);
            }
          }
        }
      }
    );

    // Subscribe to language changes to update chart labels
    this.languageSubscription = this.translate.onLangChange.subscribe(() => {
      if (this.activitiesChartData && this.activitiesChartOptions) {
        this.updateActivitiesChartLabels();
      }
      if (this.personasChartData && this.personasChartOptions) {
        this.updatePersonasChartLabels();
      }
    });
  }

  ngAfterViewInit() {
    // Use setTimeout to ensure the view is fully rendered
    setTimeout(() => {
      // Initialize map if we should show it, regardless of categoryData being loaded yet
      // Places will be added when they're loaded in loadPlacesForMap()
      if (this.mapContainerMini && !this.map && this.shouldShowMap()) {
        this.initializeMap();
        // Only add places if categoryData is already available
        if (this.categoryData.length > 0) {
          this.addPlacesWhenReady();
        }
        if (this.pendingFeatureShape) {
          this.addFeatureShapeToMap(this.pendingFeatureShape);
          this.pendingFeatureShape = null;
        }
      }
    }, 0);
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
    if (this.map) {
      this.map.remove();
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
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
    this.popup = undefined;
    this.places = [];
    this.categoryData = [];
    this.categoryColors.clear();
    this.pendingFeatureShape = null;
    this.selectedFeature = null;
    this.featureInfo = null;
    this.featureInfoError = null;
    this.isLoadingFeatureInfo = false;
    this.currentLoadingFeatureId = null;
    this.analyzeData = null;
    this.activitiesChartData = null;
    this.isLoadingAnalyze = false;
    this.analyzeError = null;
    this.personasData = null;
    this.personasChartData = null;
    this.isLoadingPersonas = false;
    this.personasError = null;
    this.isLoadingPlaces = false;
    this.placesError = null;
    this.savedFeatureType = null;
    // Reset feature 2
    this.selectedFeature2 = null;
    this.featureInfo2 = null;
    this.featureInfoError2 = null;
    this.isLoadingFeatureInfo2 = false;
    this.currentLoadingFeatureId2 = null;
    this.analyzeData2 = null;
    this.isLoadingAnalyze2 = false;
    this.analyzeError2 = null;
    this.personasData2 = null;
    this.isLoadingPersonas2 = false;
    this.personasError2 = null;
    this.savedFeatureType2 = null;
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

      const filters = this.filterConfigService.contentLayerFilters();
      if (filters?.persona_id === 54) {
        if (this.selectedFeature) {
          this.isLoadingPersonas = true;
        }
        if (this.selectedFeature2) {
          this.isLoadingPersonas2 = true;
        }
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
    
    // Clear error states but keep selected features
    this.featureInfoError = null;
    this.analyzeError = null;
    this.personasError = null;
    this.placesError = null;
    this.featureInfoError2 = null;
    this.analyzeError2 = null;
    this.personasError2 = null;
    
    // Clear data that will be reloaded
    this.featureInfo = null;
    this.analyzeData = null;
    this.personasData = null;
    this.activitiesChartData = null;
    this.personasChartData = null;
    this.featureInfo2 = null;
    this.analyzeData2 = null;
    this.personasData2 = null;
    
    // Clear map data (will be reloaded if needed)
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
    this.popup = undefined;
    this.places = [];
    this.categoryData = [];
    this.categoryColors.clear();
    this.pendingFeatureShape = null;
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
  clearComparison(): void {
    this.featureSelectionService.clearComparison();
  }

  /**
   * Determines if we should show the map instead of the chart
   */
  shouldShowMap(): boolean {
    // Never show map in comparison mode
    if (this.isComparisonMode) {
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

  getGradeColor(index: number): string {
    const indexValue = index / 100;
    if (indexValue <= 0) {
      return 'rgba(128, 128, 128, 0.7)'; // NaN or invalid
    } else if (indexValue < 0.35) {
      return 'rgba(50, 97, 45, 0.7)'; // Grade A (A+, A, A-)
    } else if (indexValue < 0.5) {
      return 'rgba(60, 176, 67, 0.7)'; // Grade B (B+, B, B-)
    } else if (indexValue < 0.71) {
      return 'rgba(238, 210, 2, 0.7)'; // Grade C (C+, C, C-)
    } else if (indexValue < 1.0) {
      return 'rgba(237, 112, 20, 0.7)'; // Grade D (D+, D, D-)
    } else if (indexValue < 1.41) {
      return 'rgba(194, 24, 7, 0.7)'; // Grade E (E+, E, E-)
    } else {
      return 'rgba(150, 86, 162, 0.7)'; // Grade F (F+, F, F-)
    }
  }

  getScoreColor(score: number): string {
    if (score < 600) {
      return 'rgb(23, 25, 63)'; // 0-10 min (default for < 600) - darkest
    } else if (score < 900) {
      return 'rgb(43, 40, 105)'; // 11-15 min (600-900s) - very dark
    } else if (score < 1200) {
      return 'rgb(74, 89, 160)'; // 16-20 min (900-1200s) - darker
    } else if (score < 1800) {
      return 'rgb(90, 135, 185)'; // 21-30 min (1200-1800s) - medium
    } else if (score < 2700) {
      return 'rgb(121, 194, 230)'; // 31-45 min (1800-2700s) - medium-light
    } else {
      return 'rgb(162, 210, 235)'; // 45+ min (2700+s) - lightest
    }
  }

  getRatingDisplay(featureInfo: FeatureInfoResponse | null): string {
    if (!featureInfo) {
      return '';
    }
    const bewertung = this.filterConfigService.selectedBewertung();
    if (bewertung === 'zeit') {
      // Convert score from seconds to minutes
      const minutes = (featureInfo.score / 60).toFixed(1);
      const minLabel = this.translate.instant('map.popup.minutes');
      return `${minutes} ${minLabel}`;
    } else {
      return this.getGrade(featureInfo.index);
    }
  }

  getRatingColor(featureInfo: FeatureInfoResponse | null): string {
    if (!featureInfo) {
      return 'rgba(128, 128, 128, 0.7)';
    }
    const bewertung = this.filterConfigService.selectedBewertung();
    if (bewertung === 'zeit') {
      return this.getScoreColor(featureInfo.score);
    } else {
      return this.getGradeColor(featureInfo.index);
    }
  }

  getRankPercentage(rank: number | null, totalRanks: number | null): string {
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
    return `${populationLabel}: ${population.toLocaleString()}`;
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
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
    this.popup = undefined;
    this.places = [];
    this.categoryData = [];
    this.categoryColors.clear();
    this.pendingFeatureShape = null;
    this.isLoadingPlaces = false;
    this.placesError = null;

    // Use saved feature type (already extracted when feature was selected)
    if (!this.savedFeatureType) {
      console.error('Feature type not available - should have been set when feature was selected');
      this.featureInfoError = this.translate.instant('analyze.featureInfo.errorLoading');
      return;
    }
    const featureType = this.savedFeatureType;

    // Get profile combination ID
    const profileCombinationId = this.filterConfigService.currentProfileCombinationID();
    if (!profileCombinationId) {
      console.warn('Profile combination ID not available');
      return;
    }

    // Get current filters
    const filters = this.filterConfigService.contentLayerFilters();
    if (!filters) {
      console.warn('Content layer filters not available');
      return;
    }

    // Mark that we're loading this feature
    this.currentLoadingFeatureId = featureId;
    this.isLoadingFeatureInfo = true;
    this.isLoadingAnalyze = true;
    this.featureInfoError = null;
    this.analyzeError = null;

    // Prepare both API calls
    const featureInfoRequest = this.mapService.getFeatureInfo({
      feature_type: featureType,
      feature_id: featureId,
      profile_combination_id: profileCombinationId,
      category_ids: filters.category_ids,
      persona_id: filters.persona_id,
      regiostar_ids: filters.regiostar_ids,
      state_ids: filters.state_ids
    }).pipe(
      catchError((error) => {
        console.error('Error loading feature info:', error);
        if (error.status === 404) {
          this.featureInfoError = this.translate.instant('analyze.featureInfo.notFound');
        } else if (error.status === 503) {
          this.featureInfoError = this.translate.instant('analyze.featureInfo.dataNotPreloaded');
        } else {
          this.featureInfoError = this.translate.instant('analyze.featureInfo.errorLoading');
        }
        return of(null);
      })
    );

    const analyzeRequest = this.analyzeService.getAnalyze({
      feature_type: featureType,
      feature_id: featureId,
      profile_combination_id: profileCombinationId,
      category_ids: filters.category_ids,
      persona_id: filters.persona_id,
      top5: true
    }).pipe(
      catchError((error) => {
        console.error('Error loading analyze data:', error);
        if (error.status === 404) {
          this.analyzeError = this.translate.instant('analyze.analyzeData.notFound');
        } else if (error.status === 503) {
          this.analyzeError = this.translate.instant('analyze.analyzeData.dataNotPreloaded');
        } else {
          this.analyzeError = this.translate.instant('analyze.analyzeData.errorLoading');
        }
        return of(null);
      })
    );

    // Prepare personas request if persona_id is 54
    const shouldLoadPersonas = filters.persona_id === 54;
    const personasRequest = shouldLoadPersonas ? this.analyzeService.getPersonas({
      feature_type: featureType,
      feature_id: featureId,
      profile_combination_id: profileCombinationId,
      category_ids: filters.category_ids,
      persona_id: 54
    }).pipe(
      catchError((error) => {
        console.error('Error loading personas data:', error);
        if (error.status === 404) {
          this.personasError = this.translate.instant('analyze.analyzeData.notFound');
        } else if (error.status === 503) {
          this.personasError = this.translate.instant('analyze.analyzeData.dataNotPreloaded');
        } else {
          this.personasError = this.translate.instant('analyze.analyzeData.errorLoading');
        }
        return of(null);
      })
    ) : of(null);

    // Mark that we're loading personas if needed
    if (shouldLoadPersonas) {
      this.isLoadingPersonas = true;
      this.personasError = null;
    }

    // Run requests in parallel
    const requests: any = {
      featureInfo: featureInfoRequest,
      analyzeData: analyzeRequest
    };
    
    if (shouldLoadPersonas) {
      requests.personasData = personasRequest;
    }

    this.featureInfoSubscription = forkJoin(requests).subscribe((result: any) => {
      this.isLoadingFeatureInfo = false;
      this.isLoadingAnalyze = false;
      this.isLoadingPersonas = false;
      this.currentLoadingFeatureId = null;
      
      // Update feature info
      this.featureInfo = result.featureInfo;
      
      // Update analyze data
      this.analyzeData = result.analyzeData;
      
      // Update personas data if loaded
      if (shouldLoadPersonas) {
        this.personasData = result.personasData;
      }
      
      // Check if we should show map instead of chart
      if (this.shouldShowMap()) {
        // Load places for the map
        this.loadPlacesForMap();
      } else {
        // Show chart as usual or comparison chart if in comparison mode
        if (this.isComparisonMode && this.analyzeData2 && this.analyzeData2.categories) {
          // Both features loaded, show comparison chart
          this.initializeComparisonActivitiesChart();
        } else if (result.analyzeData && result.analyzeData.categories) {
          this.initializeActivitiesChart(result.analyzeData.categories);
        } else {
          this.activitiesChartData = null;
        }
        
        // Initialize personas chart if data is available
        if (this.isComparisonMode && shouldLoadPersonas && this.personasData2) {
          // Both features loaded, show comparison chart
          this.initializeComparisonPersonasChart();
        } else if (shouldLoadPersonas && result.personasData) {
          this.initializePersonasChart(result.personasData);
        } else {
          this.personasChartData = null;
        }
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
    const profileCombinationId = this.filterConfigService.currentProfileCombinationID();
    if (!profileCombinationId) {
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
    this.analyzeError2 = null;

    // Prepare both API calls
    const featureInfoRequest = this.mapService.getFeatureInfo({
      feature_type: featureType,
      feature_id: featureId,
      profile_combination_id: profileCombinationId,
      category_ids: filters.category_ids,
      persona_id: filters.persona_id,
      regiostar_ids: filters.regiostar_ids,
      state_ids: filters.state_ids
    }).pipe(
      catchError((error) => {
        console.error('Error loading feature info 2:', error);
        if (error.status === 404) {
          this.featureInfoError2 = this.translate.instant('analyze.featureInfo.notFound');
        } else if (error.status === 503) {
          this.featureInfoError2 = this.translate.instant('analyze.featureInfo.dataNotPreloaded');
        } else {
          this.featureInfoError2 = this.translate.instant('analyze.featureInfo.errorLoading');
        }
        return of(null);
      })
    );

    const analyzeRequest = this.analyzeService.getAnalyze({
      feature_type: featureType,
      feature_id: featureId,
      profile_combination_id: profileCombinationId,
      category_ids: filters.category_ids,
      persona_id: filters.persona_id,
      top5: true
    }).pipe(
      catchError((error) => {
        console.error('Error loading analyze data 2:', error);
        if (error.status === 404) {
          this.analyzeError2 = this.translate.instant('analyze.analyzeData.notFound');
        } else if (error.status === 503) {
          this.analyzeError2 = this.translate.instant('analyze.analyzeData.dataNotPreloaded');
        } else {
          this.analyzeError2 = this.translate.instant('analyze.analyzeData.errorLoading');
        }
        return of(null);
      })
    );

    // Prepare personas request if persona_id is 54
    const shouldLoadPersonas = filters.persona_id === 54;
    const personasRequest = shouldLoadPersonas ? this.analyzeService.getPersonas({
      feature_type: featureType,
      feature_id: featureId,
      profile_combination_id: profileCombinationId,
      category_ids: filters.category_ids,
      persona_id: 54
    }).pipe(
      catchError((error) => {
        console.error('Error loading personas data 2:', error);
        if (error.status === 404) {
          this.personasError2 = this.translate.instant('analyze.analyzeData.notFound');
        } else if (error.status === 503) {
          this.personasError2 = this.translate.instant('analyze.analyzeData.dataNotPreloaded');
        } else {
          this.personasError2 = this.translate.instant('analyze.analyzeData.errorLoading');
        }
        return of(null);
      })
    ) : of(null);

    // Mark that we're loading personas if needed
    if (shouldLoadPersonas) {
      this.isLoadingPersonas2 = true;
      this.personasError2 = null;
    }

    // Run requests in parallel
    const requests: any = {
      featureInfo: featureInfoRequest,
      analyzeData: analyzeRequest
    };
    
    if (shouldLoadPersonas) {
      requests.personasData = personasRequest;
    }

    this.featureInfoSubscription2 = forkJoin(requests).subscribe((result: any) => {
      this.isLoadingFeatureInfo2 = false;
      this.isLoadingAnalyze2 = false;
      this.isLoadingPersonas2 = false;
      this.currentLoadingFeatureId2 = null;
      
      // Update feature info
      this.featureInfo2 = result.featureInfo;
      
      // Update analyze data
      this.analyzeData2 = result.analyzeData;
      
      // Update personas data if loaded
      if (shouldLoadPersonas) {
        this.personasData2 = result.personasData;
      }
      
      // In comparison mode, update charts with both features
      if (this.isComparisonMode) {
        if (this.analyzeData && this.analyzeData.categories && this.analyzeData2 && this.analyzeData2.categories) {
          this.initializeComparisonActivitiesChart();
        }
        
        if (shouldLoadPersonas && this.personasData && this.personasData2) {
          this.initializeComparisonPersonasChart();
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
    const profileCombinationId = this.filterConfigService.currentProfileCombinationID();
    
    if (!profileCombinationId) {
      console.warn('Profile combination ID not available');
      return;
    }

    this.isLoadingPlaces = true;
    this.placesError = null;

    // Check if places are available for this feature type
    // Places API only supports 'municipality' and 'hexagon'
    const isPlacesSupported = featureType === 'municipality' || featureType === 'hexagon';

    if (!isPlacesSupported) {
      // Show error message for unsupported feature types (state/county)
      this.placesError = this.translate.instant('analyze.placesDialog.disabledForCountiesStates');
      this.isLoadingPlaces = false;
      
      // Still load feature shape and initialize map to show the feature boundary
      try {
        const featureShape = await firstValueFrom(
          this.placesService.getFeatureShape({
            feature_type: featureType,
            feature_id: featureId
          }).pipe(
            catchError((error) => {
              console.warn('Could not load feature shape:', error);
              return of(null);
            })
          )
        );
        
        // Initialize map to show feature shape even without places
        if (!this.map && this.mapContainerMini) {
          this.initializeMap();
        } else if (this.map) {
          if (featureShape) {
            this.addFeatureShapeToMap(featureShape);
          }
        } else {
          this.pendingFeatureShape = featureShape;
        }
      } catch (err: any) {
        console.error('Error loading feature shape:', err);
      }
      
      return;
    }

    try {
      // Get category IDs from analyzeData
      const categoryIds = this.analyzeData.categories.map(cat => cat.category_id);

      // Load places and feature shape in parallel
      const [placesResponse, featureShape] = await Promise.all([
        firstValueFrom(
          this.placesService.getPlaces({
            feature_type: featureType,
            feature_id: featureId,
            profile_combination_id: profileCombinationId,
            category_ids: categoryIds.length > 0 ? categoryIds : undefined
          })
        ),
        firstValueFrom(
          this.placesService.getFeatureShape({
            feature_type: featureType,
            feature_id: featureId
          }).pipe(
            catchError((error) => {
              console.warn('Could not load feature shape:', error);
              return of(null);
            })
          )
        )
      ]);

      this.places = placesResponse.places || [];
      this.places = this.places.filter(p => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon));

      if (placesResponse.categories) {
        this.categoryData = placesResponse.categories
          .map(cat => ({
            name: cat.category_name,
            weight: cat.weight,
            score: cat.activityScore?.score ?? 0,
            index: cat.activityScore?.index ?? 0,
            places: cat.places.filter(p => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon))
          }))
          .sort((a, b) => b.weight - a.weight);
      }

      this.assignCategoryColors();

      // Initialize map if not already done
      // Use setTimeout to ensure the DOM is fully updated
      setTimeout(() => {
        if (!this.map && this.mapContainerMini) {
          this.initializeMap();
          // Places will be added when map finishes loading (handled in initializeMap's 'load' event)
          if (featureShape) {
            this.pendingFeatureShape = featureShape;
          }
        } else if (this.map) {
          this.addPlacesWhenReady();
          if (featureShape) {
            this.addFeatureShapeToMap(featureShape);
          }
        } else {
          this.pendingFeatureShape = featureShape;
        }
      }, 100);

      this.isLoadingPlaces = false;
    } catch (err: any) {
      console.error('Error loading places:', err);
      this.placesError = err?.message || this.translate.instant('analyze.placesDialog.errorLoadingPlaces');
      this.isLoadingPlaces = false;
    }
  }

  private initializeActivitiesChart(categories: CategoryScore[]): void {
    if (!categories || categories.length === 0) {
      this.activitiesChartData = null;
      return;
    }

    // Sort by weight descending and take top 5
    const sortedCategories = [...categories]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);

    const labels = sortedCategories.map((_, index) => (index + 1).toString());
    // Convert weights from decimals (0-1) to percentages (0-100)
    const weights = sortedCategories.map(cat => cat.weight * 100);

    // Get current bewertung setting (qualitaet = index, zeit = score)
    const bewertung = this.filterConfigService.selectedBewertung();
    const isScoreMode = bewertung === 'zeit';
    
    // Get colors based on current map visualization type
    // Colors match exactly with map.service.ts getScoreFillColorExpression() and getIndexFillColorExpression()
    const colors = sortedCategories.map((cat) => {
      if (isScoreMode) {
        // Use score-based colors (blue colors for zeit bewertung from getScoreFillColorExpression)
        // Match exact color breaks from map.service.ts
        const scoreValue = cat.score;
        if (scoreValue < 600) {
          return 'rgb(23, 25, 63)'; // 0-10 min (default for < 600) - darkest
        } else if (scoreValue < 900) {
          return 'rgb(43, 40, 105)'; // 11-15 min (600-900s) - very dark
        } else if (scoreValue < 1200) {
          return 'rgb(74, 89, 160)'; // 16-20 min (900-1200s) - darker
        } else if (scoreValue < 1800) {
          return 'rgb(90, 135, 185)'; // 21-30 min (1200-1800s) - medium
        } else if (scoreValue < 2700) {
          return 'rgb(121, 194, 230)'; // 31-45 min (1800-2700s) - medium-light
        } else {
          return 'rgb(162, 210, 235)'; // 45+ min (2700+s) - lightest
        }
      } else {
        // Use index-based colors (from getIndexFillColorExpression)
        // Match exact color breaks from map.service.ts
        const indexValue = cat.index / 100;
        if (indexValue <= 0) {
          return 'rgba(128, 128, 128, 1)'; // NaN or invalid
        } else if (indexValue < 0.35) {
          return 'rgba(50, 97, 45, 1)'; // Grade A (A+, A, A-)
        } else if (indexValue < 0.5) {
          return 'rgba(60, 176, 67, 1)'; // Grade B (B+, B, B-)
        } else if (indexValue < 0.71) {
          return 'rgba(238, 210, 2, 1)'; // Grade C (C+, C, C-)
        } else if (indexValue < 1.0) {
          return 'rgba(237, 112, 20, 1)'; // Grade D (D+, D, D-)
        } else if (indexValue < 1.41) {
          return 'rgba(194, 24, 7, 1)'; // Grade E (E+, E, E-)
        } else {
          return 'rgba(150, 86, 162, 1)'; // Grade F (F+, F, F-)
        }
      }
    });

    const relevanceLabel = this.translate.instant('analyze.relevancePercent');
    this.activitiesChartData = {
      labels: labels,
      datasets: [
        {
          label: relevanceLabel,
          data: weights,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2
        }
      ]
    };

    this.activitiesChartOptions = {
      indexAxis: 'x',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: (context: any) => {
              const index = context[0].dataIndex;
              return sortedCategories[index].category_name || '';
            },
            label: (context: any) => {
              const index = context.dataIndex;
              const grade = this.getGradeFromIndex(sortedCategories[index].index);
              const ratingLabel = this.translate.instant('analyze.rating');
              const relevanceLabel = this.translate.instant('analyze.relevance');
              return [
                `${ratingLabel}: ${grade}`,
                `${relevanceLabel}: ${weights[index].toFixed(1)}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#ffffff',
            font: {
              size: 12
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          max: 25,
          ticks: {
            stepSize: 5,
            color: '#ffffff',
            font: {
              size: 12
            },
            padding: 5
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false
          },
          title: {
            display: true,
            text: this.translate.instant('analyze.relevancePercent'),
            color: '#ffffff',
            font: {
              size: 12
            },
            padding: {
              top: 0,
              bottom: 0
            }
          }
        }
      }
    };

    // Refresh chart to ensure translations are applied
    setTimeout(() => {
      if (this.activitiesChart) {
        this.activitiesChart.refresh();
      }
    }, 0);
  }

  private getGradeFromIndex(index: number): string {
    return this.getGrade(index);
  }

  private updateActivitiesChartLabels(): void {
    if (!this.activitiesChartOptions) {
      return;
    }
    // Update Y-axis title
    if (this.activitiesChartOptions.scales?.y?.title) {
      this.activitiesChartOptions.scales.y.title.text = this.translate.instant('analyze.relevancePercent');
    }
    // Update dataset label
    if (this.activitiesChartData?.datasets?.[0]) {
      this.activitiesChartData.datasets[0].label = this.translate.instant('analyze.relevancePercent');
    }
    // Refresh chart
    if (this.activitiesChart) {
      this.activitiesChart.refresh();
    }
  }

  private updatePersonasChartLabels(): void {
    if (!this.personasChartOptions) {
      return;
    }
    // Update Y-axis title
    if (this.personasChartOptions.scales?.y?.title) {
      this.personasChartOptions.scales.y.title.text = this.translate.instant('analyze.populationPercent');
    }
    // Update dataset label
    if (this.personasChartData?.datasets?.[0]) {
      this.personasChartData.datasets[0].label = this.translate.instant('analyze.populationPercent');
    }
    // Refresh chart
    if (this.personasChart) {
      this.personasChart.refresh();
    }
  }

  private initializePersonasChart(personas: PersonaBreakdown[]): void {
    if (!personas || personas.length === 0) {
      this.personasChartData = null;
      return;
    }

    // Sort by weight descending and take top 4
    const sortedPersonas = [...personas]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4);

    const labels = sortedPersonas.map((_, index) => (index + 1).toString());
    // Convert weights from decimals (0-1) to percentages (0-100)
    const weights = sortedPersonas.map(p => p.weight * 100);

    // Get current bewertung setting (qualitaet = index, zeit = score)
    const bewertung = this.filterConfigService.selectedBewertung();
    const isScoreMode = bewertung === 'zeit';
    
    // Get colors based on current map visualization type
    // Colors match exactly with map.service.ts getScoreFillColorExpression() and getIndexFillColorExpression()
    const colors = sortedPersonas.map((persona) => {
      if (isScoreMode) {
        // Use score-based colors (blue colors for zeit bewertung from getScoreFillColorExpression)
        // Match exact color breaks from map.service.ts
        const scoreValue = persona.score;
        if (scoreValue < 600) {
          return 'rgb(23, 25, 63)'; // 0-10 min (default for < 600) - darkest
        } else if (scoreValue < 900) {
          return 'rgb(43, 40, 105)'; // 11-15 min (600-900s) - very dark
        } else if (scoreValue < 1200) {
          return 'rgb(74, 89, 160)'; // 16-20 min (900-1200s) - darker
        } else if (scoreValue < 1800) {
          return 'rgb(90, 135, 185)'; // 21-30 min (1200-1800s) - medium
        } else if (scoreValue < 2700) {
          return 'rgb(121, 194, 230)'; // 31-45 min (1800-2700s) - medium-light
        } else {
          return 'rgb(162, 210, 235)'; // 45+ min (2700+s) - lightest
        }
      } else {
        // Use index-based colors (from getIndexFillColorExpression)
        // Match exact color breaks from map.service.ts
        const indexValue = persona.index / 100;
        if (indexValue <= 0) {
          return 'rgba(128, 128, 128, 0.7)'; // NaN or invalid
        } else if (indexValue < 0.35) {
          return 'rgba(50, 97, 45, 0.7)'; // Grade A (A+, A, A-)
        } else if (indexValue < 0.5) {
          return 'rgba(60, 176, 67, 0.7)'; // Grade B (B+, B, B-)
        } else if (indexValue < 0.71) {
          return 'rgba(238, 210, 2, 0.7)'; // Grade C (C+, C, C-)
        } else if (indexValue < 1.0) {
          return 'rgba(237, 112, 20, 0.7)'; // Grade D (D+, D, D-)
        } else if (indexValue < 1.41) {
          return 'rgba(194, 24, 7, 0.7)'; // Grade E (E+, E, E-)
        } else {
          return 'rgba(150, 86, 162, 0.7)'; // Grade F (F+, F, F-)
        }
      }
    });

    const populationLabel = this.translate.instant('analyze.populationPercent');
    this.personasChartData = {
      labels: labels,
      datasets: [
        {
          label: populationLabel,
          data: weights,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2
        }
      ]
    };

    this.personasChartOptions = {
      indexAxis: 'x',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: (context: any) => {
              const index = context[0].dataIndex;
              return sortedPersonas[index].name || '';
            },
            label: (context: any) => {
              const index = context.dataIndex;
              const grade = this.getGradeFromIndex(sortedPersonas[index].index);
              const ratingLabel = this.translate.instant('analyze.rating');
              const populationLabel = this.translate.instant('analyze.populationPercent');
              return [
                `${ratingLabel}: ${grade}`,
                `${populationLabel}: ${weights[index].toFixed(1)}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#ffffff',
            font: {
              size: 12
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 5,
            color: '#ffffff',
            font: {
              size: 12
            },
            padding: 5
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false
          },
          title: {
            display: true,
            text: this.translate.instant('analyze.populationPercent'),
            color: '#ffffff',
            font: {
              size: 12
            },
            padding: {
              top: 0,
              bottom: 0
            }
          }
        }
      }
    };

    // Refresh chart to ensure translations are applied
    setTimeout(() => {
      if (this.personasChart) {
        this.personasChart.refresh();
      }
    }, 0);
  }

  private initializeComparisonActivitiesChart(): void {
    if (!this.analyzeData || !this.analyzeData.categories || !this.analyzeData2 || !this.analyzeData2.categories) {
      this.activitiesChartData = null;
      return;
    }

    // Get all unique categories from both features, sorted by combined weight
    const categoryMap = new Map<number, { name: string; weight1: number; weight2: number; index1: number; index2: number; score1: number; score2: number }>();
    
    this.analyzeData.categories.forEach(cat => {
      categoryMap.set(cat.category_id, {
        name: cat.category_name,
        weight1: cat.weight,
        weight2: 0,
        index1: cat.index,
        index2: 0,
        score1: cat.score,
        score2: 0
      });
    });
    
    this.analyzeData2.categories.forEach(cat => {
      const existing = categoryMap.get(cat.category_id);
      if (existing) {
        existing.weight2 = cat.weight;
        existing.index2 = cat.index;
        existing.score2 = cat.score;
      } else {
        categoryMap.set(cat.category_id, {
          name: cat.category_name,
          weight1: 0,
          weight2: cat.weight,
          index1: 0,
          index2: cat.index,
          score1: 0,
          score2: cat.score
        });
      }
    });

    // Sort by combined weight and take top 5
    const sortedCategories = Array.from(categoryMap.values())
      .sort((a, b) => Math.max(b.weight1, b.weight2) - Math.max(a.weight1, a.weight2))
      .slice(0, 5);

    const feature1Name = this.featureInfo?.name || this.translate.instant('analyze.feature1');
    const feature2Name = this.featureInfo2?.name || this.translate.instant('analyze.feature2');
    
    // Labels are just numbers
    const labels = sortedCategories.map((_, index) => (index + 1).toString());
    const weights1 = sortedCategories.map(cat => cat.weight1 * 100);
    const weights2 = sortedCategories.map(cat => cat.weight2 * 100);

    // Get current bewertung setting
    const bewertung = this.filterConfigService.selectedBewertung();
    const isScoreMode = bewertung === 'zeit';

    // Get colors based on current map visualization type - same colors as before
    const colors1 = sortedCategories.map((cat) => {
      if (isScoreMode) {
        return this.getScoreColor(cat.score1);
      } else {
        return this.getGradeColor(cat.index1);
      }
    });

    const colors2 = sortedCategories.map((cat) => {
      if (isScoreMode) {
        return this.getScoreColor(cat.score2);
      } else {
        return this.getGradeColor(cat.index2);
      }
    });

    const relevanceLabel = this.translate.instant('analyze.relevancePercent');

    this.activitiesChartData = {
      labels: labels,
      datasets: [
        {
          label: relevanceLabel,
          data: weights1,
          backgroundColor: colors1,
          borderColor: '#ffffff',
          borderWidth: 1
        },
        {
          label: relevanceLabel,
          data: weights2,
          backgroundColor: colors2,
          borderColor: '#ffffff',
          borderWidth: 1
        }
      ]
    };

    this.activitiesChartOptions = {
      indexAxis: 'x',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: (context: any) => {
              const index = context[0].dataIndex;
              return sortedCategories[index].name || '';
            },
            label: (context: any) => {
              const index = context.dataIndex;
              const datasetIndex = context.datasetIndex;
              const category = sortedCategories[index];
              const weight = datasetIndex === 0 ? category.weight1 : category.weight2;
              const indexValue = datasetIndex === 0 ? category.index1 : category.index2;
              const grade = this.getGradeFromIndex(indexValue);
              const featureName = datasetIndex === 0 ? feature1Name : feature2Name;
              const ratingLabel = this.translate.instant('analyze.rating');
              const relevanceLabel = this.translate.instant('analyze.relevance');
              return [
                `${featureName}`,
                `${ratingLabel}: ${grade}`,
                `${relevanceLabel}: ${(weight * 100).toFixed(1)}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#ffffff',
            font: {
              size: 12
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          max: 25,
          ticks: {
            stepSize: 5,
            color: '#ffffff',
            font: {
              size: 12
            },
            padding: 5
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false
          },
          title: {
            display: true,
            text: this.translate.instant('analyze.relevancePercent'),
            color: '#ffffff',
            font: {
              size: 12
            },
            padding: {
              top: 0,
              bottom: 0
            }
          }
        }
      }
    };

    // Refresh chart
    setTimeout(() => {
      if (this.activitiesChart) {
        this.activitiesChart.refresh();
      }
    }, 0);
  }

  private initializeComparisonPersonasChart(): void {
    if (!this.personasData || this.personasData.length === 0 || !this.personasData2 || this.personasData2.length === 0) {
      this.personasChartData = null;
      return;
    }

    // Get all unique personas from both features
    const personaMap = new Map<string, { name: string; weight1: number; weight2: number; index1: number; index2: number }>();
    
    this.personasData.forEach(persona => {
      personaMap.set(persona.name, {
        name: persona.name,
        weight1: persona.weight,
        weight2: 0,
        index1: persona.index,
        index2: 0
      });
    });
    
    this.personasData2.forEach(persona => {
      const existing = personaMap.get(persona.name);
      if (existing) {
        existing.weight2 = persona.weight;
        existing.index2 = persona.index;
      } else {
        personaMap.set(persona.name, {
          name: persona.name,
          weight1: 0,
          weight2: persona.weight,
          index1: 0,
          index2: persona.index
        });
      }
    });

    // Sort by combined weight and take top 4
    const sortedPersonas = Array.from(personaMap.values())
      .sort((a, b) => Math.max(b.weight1, b.weight2) - Math.max(a.weight1, a.weight2))
      .slice(0, 4);

    const feature1Name = this.featureInfo?.name || this.translate.instant('analyze.feature1');
    const feature2Name = this.featureInfo2?.name || this.translate.instant('analyze.feature2');
    
    // Labels are just numbers
    const labels = sortedPersonas.map((_, index) => (index + 1).toString());
    const weights1 = sortedPersonas.map(p => p.weight1 * 100);
    const weights2 = sortedPersonas.map(p => p.weight2 * 100);

    // Get current bewertung setting
    const bewertung = this.filterConfigService.selectedBewertung();
    const isScoreMode = bewertung === 'zeit';

    // Get colors based on current map visualization type - same colors as before
    const colors1 = sortedPersonas.map((persona) => {
      if (isScoreMode) {
        // For personas, we need to get score from analyzeData if available
        // Since personas don't have score directly, we use index as fallback
        return this.getScoreColor(persona.index1);
      } else {
        return this.getGradeColor(persona.index1);
      }
    });

    const colors2 = sortedPersonas.map((persona) => {
      if (isScoreMode) {
        return this.getScoreColor(persona.index2);
      } else {
        return this.getGradeColor(persona.index2);
      }
    });

    const populationLabel = this.translate.instant('analyze.populationPercent');

    this.personasChartData = {
      labels: labels,
      datasets: [
        {
          label: populationLabel,
          data: weights1,
          backgroundColor: colors1,
          borderColor: '#ffffff',
          borderWidth: 1
        },
        {
          label: populationLabel,
          data: weights2,
          backgroundColor: colors2,
          borderColor: '#ffffff',
          borderWidth: 1
        }
      ]
    };

    this.personasChartOptions = {
      indexAxis: 'x',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: (context: any) => {
              const index = context[0].dataIndex;
              return sortedPersonas[index].name || '';
            },
            label: (context: any) => {
              const index = context.dataIndex;
              const datasetIndex = context.datasetIndex;
              const persona = sortedPersonas[index];
              const weight = datasetIndex === 0 ? persona.weight1 : persona.weight2;
              const indexValue = datasetIndex === 0 ? persona.index1 : persona.index2;
              const grade = this.getGradeFromIndex(indexValue);
              const featureName = datasetIndex === 0 ? feature1Name : feature2Name;
              const ratingLabel = this.translate.instant('analyze.rating');
              const populationLabel = this.translate.instant('analyze.populationPercent');
              return [
                `${featureName}`,
                `${ratingLabel}: ${grade}`,
                `${populationLabel}: ${(weight * 100).toFixed(1)}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#ffffff',
            font: {
              size: 12
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 5,
            color: '#ffffff',
            font: {
              size: 12
            },
            padding: 5
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false
          },
          title: {
            display: true,
            text: this.translate.instant('analyze.populationPercent'),
            color: '#ffffff',
            font: {
              size: 12
            },
            padding: {
              top: 0,
              bottom: 0
            }
          }
        }
      }
    };

    // Refresh chart
    setTimeout(() => {
      if (this.personasChart) {
        this.personasChart.refresh();
      }
    }, 0);
  }

  getSortedPersonas(): PersonaBreakdown[] {
    if (!this.personasData || this.personasData.length === 0) {
      return [];
    }
    return [...this.personasData]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4);
  }

  onChartDataSelect(event: any): void {
    if (!event || !event.element || event.element.index === undefined) {
      return;
    }

    const clickedIndex = event.element.index;
    const sortedCategories = this.getSortedCategories();
    
    if (clickedIndex < 0 || clickedIndex >= sortedCategories.length) {
      return;
    }

    const clickedCategory = sortedCategories[clickedIndex];
    if (!clickedCategory) {
      return;
    }

    // Use category_id directly from the API response
    if (!clickedCategory.category_id) {
      console.warn('Category ID not available for category:', clickedCategory.category_name);
      return;
    }

    // In comparison mode, determine which feature was clicked based on datasetIndex
    let featureNumber: 1 | 2 | undefined = undefined;
    if (this.isComparisonMode && event.element.datasetIndex !== undefined) {
      // datasetIndex 0 = feature 1, datasetIndex 1 = feature 2
      featureNumber = (event.element.datasetIndex === 0) ? 1 : 2;
    }

    // Open places dialog with the specific category_id and feature number
    this.openPlacesDialog(clickedCategory.category_id, clickedCategory.category_name, featureNumber);
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
    return this.isLoadingFeatureInfo || this.isLoadingAnalyze || this.isLoadingPersonas || this.isLoadingPlaces ||
           this.isLoadingFeatureInfo2 || this.isLoadingAnalyze2 || this.isLoadingPersonas2;
  }

  /**
   * Returns true if persona_id is 54 (all personas)
   */
  isAllPersonas(): boolean {
    const filters = this.filterConfigService.contentLayerFilters();
    return filters?.persona_id === 54;
  }

  private initializeMap(): void {
    if (!this.mapContainerMini) {
      console.warn('Cannot initialize map: mapContainerMini not available');
      return;
    }

    const baseStyle = this.mapService.getBaseMapStyle();

    const mapOptions: any = {
      container: this.mapContainerMini.nativeElement,
      style: baseStyle,
      center: [9.2156505, 49.320099],
      zoom: 7,
      minZoom: 5,
      maxZoom: 14,
      dragRotate: false,
      renderWorldCopies: false,
      attributionControl: false
    };

    this.map = new MapLibreMap(mapOptions);

    this.popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      anchor: 'bottom',
      offset: [0, -5]
    });

    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new FullscreenControl(), 'top-right');
    this.map.dragRotate.disable();
    this.map.touchZoomRotate.disableRotation();

    this.map.once('load', () => {
      if (this.map) {
        // Ensure map resizes after container is properly rendered
        setTimeout(() => {
          if (this.map) {
            this.map.resize();
          }
        }, 100);
      }
      this.addPlacesWhenReady();
      if (this.pendingFeatureShape) {
        this.addFeatureShapeToMap(this.pendingFeatureShape);
        this.pendingFeatureShape = null;
      }
    });
  }

  private addPlacesWhenReady(): void {
    if (!this.map) {
      console.warn('Cannot add places: map not initialized');
      return;
    }

    if (this.categoryData.length === 0) {
      console.warn('Cannot add places: no category data available');
      return;
    }
    
    console.log('Adding places to map, categoryData:', this.categoryData.length, 'categories');
    const totalPlaces = this.categoryData.reduce((sum, cat) => sum + cat.places.length, 0);
    console.log('Total places to add:', totalPlaces);

    if (this.map.loaded()) {
      this.addPlacesToMap();
      this.fitMapToPlaces();
    } else {
      this.map.once('load', () => {
        this.addPlacesToMap();
        this.fitMapToPlaces();
      });
    }
  }

  private assignCategoryColors(): void {
    this.categoryColors.clear();
    this.categoryLegendItems = [];
    
    // Calculate total weight for relevance calculation
    const totalWeight = this.categoryData.reduce((sum, cat) => sum + cat.weight, 0);
    
    // Use categoryData which is already sorted by weight
    // Show all categories, but only enable the first 3
    this.categoryData.forEach((category, index) => {
      if (category.name && !this.categoryColors.has(category.name)) {
        const pastelColor = this.pastelCategoryColors[index % this.pastelCategoryColors.length];
        this.categoryColors.set(category.name, pastelColor);
        
        // Calculate relevance as percentage
        const relevance = totalWeight > 0 ? (category.weight / totalWeight) * 100 : 0;
        
        this.categoryLegendItems.push({ 
          name: category.name, 
          color: pastelColor,
          weight: category.weight,
          relevance: relevance,
          enabled: index < 3, // Only first 3 enabled by default
          score: category.score,
          index: category.index
        });
      }
    });
  }

  getPlacesIsScoreMode(): boolean {
    const filters = this.filterConfigService.contentLayerFilters();
    return filters?.feature_type === 'score';
  }

  private getPlacesScoreColor(score: number): string {
    if (score < 480) {
      return 'rgb(23, 25, 63)';
    } else if (score < 960) {
      return 'rgb(43, 40, 105)';
    } else if (score < 1440) {
      return 'rgb(74, 89, 160)';
    } else if (score < 1800) {
      return 'rgb(90, 135, 185)';
    } else if (score < 2700) {
      return 'rgb(121, 194, 230)';
    } else {
      return 'rgb(162, 210, 235)';
    }
  }

  private getPlacesIndexColor(index: number): string {
    const indexValue = index / 100;
    if (indexValue <= 0) {
      return 'rgba(128, 128, 128, 0.7)';
    } else if (indexValue < 0.35) {
      return 'rgb(50, 97, 45)';
    } else if (indexValue < 0.5) {
      return 'rgb(60, 176, 67)';
    } else if (indexValue < 0.71) {
      return 'rgb(238, 210, 2)';
    } else if (indexValue < 1.0) {
      return 'rgb(237, 112, 20)';
    } else if (indexValue < 1.41) {
      return 'rgb(194, 24, 7)';
    } else {
      return 'rgb(197, 136, 187)';
    }
  }

  private getPlacesScoreTextColor(score: number): string {
    // Same rgb breaks as the map/legend, but used for colored text
    return this.getPlacesScoreColor(score);
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
      ? this.getPlacesScoreTextColor(score)
      : this.getPlacesIndexTextColor(index);
  }

  private addPlacesToMap(): void {
    if (!this.map || this.categoryData.length === 0) {
      console.warn('addPlacesToMap: map or categoryData missing', { map: !!this.map, categoryDataLength: this.categoryData.length });
      return;
    }

    console.log('addPlacesToMap: Adding places for', this.categoryData.length, 'categories');
    const beforeLayer = this.map.getLayer('carto-labels-layer') ? 'carto-labels-layer' : undefined;

    // Create a separate layer for each enabled category
    this.categoryData.forEach((category, index) => {
      const legendItem = this.categoryLegendItems.find(item => item.name === category.name);
      const isEnabled = legendItem?.enabled ?? (index < 3);
      
      // Only create layers for enabled categories initially
      if (!isEnabled) {
        return;
      }
      
      console.log(`Adding category "${category.name}" with ${category.places.length} places`);
      const sourceId = `places-${category.name}`;
      const layerId = `places-circles-${category.name}`;

      const features = category.places.map(place => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [place.lon, place.lat]
        },
        properties: {
          id: place.id,
          name: place.name,
          category_id: place.category_id || 0,
          category_name: place.category_name || this.translate.instant('map.popup.notAvailable'),
          url: place['url'] || null
        }
      }));

      const geoJsonData = {
        type: 'FeatureCollection' as const,
        features
      };

      const color = this.categoryColors.get(category.name) || '#4ECDC4';

      if (this.map!.getSource(sourceId)) {
        (this.map!.getSource(sourceId) as GeoJSONSource).setData(geoJsonData);
      } else {
        this.map!.addSource(sourceId, {
          type: 'geojson',
          data: geoJsonData
        });
      }

      if (!this.map!.getLayer(layerId)) {
        try {
          this.map!.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            paint: {
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                5, 4,
                10, 8,
                14, 12
              ],
              'circle-color': color,
              'circle-stroke-width': 2,
              'circle-stroke-color': 'rgba(0, 0, 0, 0.45)',
              'circle-opacity': 1.0
            }
          }, beforeLayer);
          
          // Set up interactions for this layer
          this.setupMarkerInteractionsForLayer(layerId);
          
          // Set up click handler for this layer
          this.setupMarkerClickHandlerForLayer(layerId);
          
          console.log(`Layer added for category: ${category.name}`);
        } catch (error) {
          console.error(`Error adding layer for ${category.name}:`, error);
        }
      } else {
        this.map!.setPaintProperty(layerId, 'circle-color', color);
      }
    });
    
    // Ensure map resizes after adding places
    if (this.map) {
      setTimeout(() => {
        if (this.map) {
          this.map.resize();
        }
      }, 100);
    }
  }

  toggleCategory(categoryName: string): void {
    const legendItem = this.categoryLegendItems.find(item => item.name === categoryName);
    if (!legendItem) {
      return;
    }

    legendItem.enabled = !legendItem.enabled;
    const layerId = `places-circles-${categoryName}`;
    const sourceId = `places-${categoryName}`;

    if (this.map) {
      if (legendItem.enabled) {
        // Enable category - create layer if it doesn't exist
        if (!this.map.getLayer(layerId)) {
          const category = this.categoryData.find(cat => cat.name === categoryName);
          if (category) {
            // Create GeoJSON features for this category
            const features = category.places.map(place => ({
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: [place.lon, place.lat]
              },
              properties: {
                id: place.id,
                name: place.name,
                category_id: place.category_id || 0,
                category_name: place.category_name || this.translate.instant('map.popup.notAvailable'),
                url: place['url'] || null
              }
            }));

            const geoJsonData = {
              type: 'FeatureCollection' as const,
              features
            };

            const color = this.categoryColors.get(categoryName) || '#4ECDC4';

            // Add source if it doesn't exist
            if (!this.map.getSource(sourceId)) {
              this.map.addSource(sourceId, {
                type: 'geojson',
                data: geoJsonData
              });
            } else {
              (this.map.getSource(sourceId) as GeoJSONSource).setData(geoJsonData);
            }

            // Add layer
            const beforeLayer = this.map.getLayer('carto-labels-layer') ? 'carto-labels-layer' : undefined;
            try {
              this.map.addLayer({
                id: layerId,
                type: 'circle',
                source: sourceId,
                paint: {
                  'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    5, 4,
                    10, 8,
                    14, 12
                  ],
                  'circle-color': color,
                  'circle-stroke-width': 2,
                  'circle-stroke-color': 'rgba(0, 0, 0, 0.45)',
                  'circle-opacity': 1.0
                }
              }, beforeLayer);
              
              // Set up interactions for this layer
              this.setupMarkerInteractionsForLayer(layerId);
              
              // Set up click handler for this layer
              this.setupMarkerClickHandlerForLayer(layerId);
              
              console.log(`Layer created and enabled for category: ${categoryName}`);
            } catch (error) {
              console.error(`Error creating layer for ${categoryName}:`, error);
            }
          }
        } else {
          // Layer exists, just make it visible
          this.map.setLayoutProperty(layerId, 'visibility', 'visible');
        }
      } else {
        // Disable category - hide layer
        if (this.map.getLayer(layerId)) {
          this.map.setLayoutProperty(layerId, 'visibility', 'none');
        }
      }
    }
  }

  private setupMarkerInteractionsForLayer(layerId: string): void {
    if (!this.map || !this.popup) {
      return;
    }

    let mousemovePopupTimeout: any = null;
    let pendingPopupFeature: any = null;
    let pendingPopupLngLat: any = null;

    // Prevent popup from constantly updating when the user moves the pointer quickly.
    const HOVER_POPUP_DEBOUNCE_MS = 120;

    // Change cursor on hover
    this.map.on('mouseenter', layerId, () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = 'pointer';
      }

      if (mousemovePopupTimeout) {
        clearTimeout(mousemovePopupTimeout);
        mousemovePopupTimeout = null;
        pendingPopupFeature = null;
        pendingPopupLngLat = null;
      }
    });

    this.map.on('mouseleave', layerId, () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = '';
      }

      if (mousemovePopupTimeout) {
        clearTimeout(mousemovePopupTimeout);
        mousemovePopupTimeout = null;
        pendingPopupFeature = null;
        pendingPopupLngLat = null;
      }

      if (this.popup) {
        this.popup.remove();
      }
    });

    // Show popup on hover
    this.map.on('mousemove', layerId, (e) => {
      if (!this.map || !this.popup || !e.features || e.features.length === 0) {
        return;
      }

      pendingPopupFeature = e.features[0];
      pendingPopupLngLat = e.lngLat;

      if (mousemovePopupTimeout) {
        clearTimeout(mousemovePopupTimeout);
      }

      mousemovePopupTimeout = setTimeout(() => {
        if (!this.map || !this.popup || !pendingPopupFeature || !pendingPopupLngLat) {
          return;
        }

        const properties = pendingPopupFeature.properties;
        const unnamedText = this.translate.instant('map.popup.unnamed');
        const notAvailableText = this.translate.instant('map.popup.notAvailable');
        const name = properties['name'] || unnamedText;
        const categoryName = properties['category_name'] || notAvailableText;

        const popupContent = `
          <div>
            <div style="font-weight: 600; margin-bottom: 4px;">${name}</div>
            <div style="font-size: 12px; color: #666;">${categoryName}</div>
          </div>
        `;

        this.popup
          .setLngLat(pendingPopupLngLat)
          .setHTML(popupContent)
          .addTo(this.map);
      }, HOVER_POPUP_DEBOUNCE_MS);
    });
  }

  private setupMarkerClickHandlerForLayer(layerId: string): void {
    if (!this.map) {
      return;
    }

    this.map.on('click', layerId, (e) => {
      if (!e.features || e.features.length === 0) {
        return;
      }

      const feature = e.features[0];
      const properties = feature.properties;
      const url = properties['url'];

      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  }

  private addFeatureShapeToMap(featureShape: any): void {
    if (!this.map || !featureShape) {
      return;
    }

    const geoJsonData = featureShape.type === 'FeatureCollection' 
      ? featureShape 
      : {
          type: 'FeatureCollection' as const,
          features: [featureShape]
        };

    const sourceId = 'feature-shape';
    const layerId = 'feature-shape-fill';

    if (this.map.getSource(sourceId)) {
      (this.map.getSource(sourceId) as GeoJSONSource).setData(geoJsonData);
    } else {
      this.map.addSource(sourceId, {
        type: 'geojson',
        data: geoJsonData
      });
    }

    if (!this.map.getLayer(layerId)) {
      try {
        const beforeLayer = this.map.getLayer('carto-labels-layer') ? 'carto-labels-layer' : undefined;
        
        this.map.addLayer({
          id: layerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': '#808080',
            'fill-opacity': 0.3
          }
        }, beforeLayer);

        this.map.addLayer({
          id: 'feature-shape-outline',
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#808080',
            'line-width': 1,
            'line-opacity': 0.5
          }
        }, beforeLayer);
      } catch (error) {
        console.error('Error adding feature shape layer:', error);
      }
    } else {
      (this.map.getSource(sourceId) as GeoJSONSource).setData(geoJsonData);
    }
  }

  private fitMapToPlaces(): void {
    if (!this.map || this.categoryData.length === 0) {
      return;
    }

    const allPlaces = this.categoryData.flatMap(cat => cat.places);
    const lngs = allPlaces.map(p => p.lon).filter(lng => !isNaN(lng) && lng !== 0);
    const lats = allPlaces.map(p => p.lat).filter(lat => !isNaN(lat) && lat !== 0);

    if (lngs.length === 0 || lats.length === 0) {
      return;
    }

    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const padding = 0.1;
    const lngPadding = (maxLng - minLng) * padding;
    const latPadding = (maxLat - minLat) * padding;

    const bounds: [[number, number], [number, number]] = [
      [minLng - lngPadding, minLat - latPadding],
      [maxLng + lngPadding, maxLat + latPadding]
    ];

    this.map.fitBounds(bounds, {
      padding: 50,
      duration: 1000
    });
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
    const profileCombinationId = this.filterConfigService.currentProfileCombinationID();
    
    if (!profileCombinationId) {
      console.warn('Profile combination ID not available');
      return;
    }

    const filters = this.filterConfigService.contentLayerFilters();
    if (!filters) {
      console.warn('Content layer filters not available');
      return;
    }

    const isScoreMode = filters?.feature_type === 'score';
    
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
      profileCombinationId: profileCombinationId,
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

    this.dialog.open(AllCategoriesDialogComponent, {
      width: '95vw',
      maxWidth: '1400px',
      maxHeight: '90vh',
      panelClass: 'all-categories-dialog-panel',
      data: dialogData
    });
  }

  openPlacesDialog(categoryId?: number, categoryName?: string, featureNumber?: 1 | 2): void {
    if (!this.selectedFeature) {
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

    const profileCombinationId = this.filterConfigService.currentProfileCombinationID();
    
    if (!profileCombinationId) {
      console.warn('Profile combination ID not available');
      return;
    }

    const filters = this.filterConfigService.contentLayerFilters();
    if (!filters) {
      console.warn('Content layer filters not available');
      return;
    }

    const placesData: PlacesDialogData = {
      featureType: featureType,
      featureId: featureId,
      profileCombinationId: profileCombinationId,
      categoryIds: categoryId ? [categoryId] : filters.category_ids,
      personaId: filters.persona_id,
      categoryNames: categoryName || '',
      isScoreMode: filters.feature_type === 'score'
    };

    this.dialog.open(PlacesDialogComponent, {
      width: '85vw',
      maxWidth: '1200px',
      maxHeight: '85vh',
      panelClass: 'places-dialog-panel',
      data: placesData
    });
  }

  openPersonasDialog(): void {
    if (!this.selectedFeature) {
      return;
    }

    const map = this.mapService.getMap();
    if (!map) {
      console.warn('Map not available for personas dialog');
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
      console.error('Feature type not available - cannot open personas dialog');
      return;
    }
    const featureType = this.savedFeatureType;
    const profileCombinationId = this.filterConfigService.currentProfileCombinationID();
    
    if (!profileCombinationId) {
      console.warn('Profile combination ID not available');
      return;
    }

    const filters = this.filterConfigService.contentLayerFilters();
    if (!filters) {
      console.warn('Content layer filters not available');
      return;
    }

    const bewertung = this.filterConfigService.selectedBewertung();
    const isScoreMode = bewertung === 'zeit';
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
    
    const personasData: PersonasDialogData = {
      featureType: featureType,
      featureId: featureId,
      profileCombinationId: profileCombinationId,
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

    this.dialog.open(PersonasDialogComponent, {
      width: '95vw',
      maxWidth: '1400px',
      maxHeight: '90vh',
      panelClass: 'personas-dialog-panel',
      data: personasData
    });
  }
}
