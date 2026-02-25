import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, catchError, of, forkJoin, firstValueFrom } from 'rxjs';
import { FeatureSelectionService } from '../../../shared/services/feature-selection.service';
import { MapService, FeatureInfoResponse } from '../../../services/map.service';
import { FilterConfigService } from '../../../services/filter-config.service';
import { AnalyzeService, AnalyzeResponse, CategoryScore } from '../../../services/analyze.service';
import { ProjectsService } from '../../../services/project.service';
import { PlacesService, Place } from '../../../services/places.service';
import { UIChart } from 'primeng/chart';
import { ChartModule } from 'primeng/chart';
import { MatDialog } from '@angular/material/dialog';
import { SharedModule } from '../../../shared/shared.module';
import { AllCategoriesDialogComponent, AllCategoriesDialogData } from './overlay/all-categories-dialog.component';
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
  
  // Analyze chart data
  analyzeData: AnalyzeResponse | null = null;
  isLoadingAnalyze: boolean = false;
  analyzeError: string | null = null;
  activitiesChartData: any = null;
  activitiesChartOptions: any = null;
  
  // Map data
  @ViewChild('mapContainerMini') mapContainerMini?: ElementRef;
  private map?: MapLibreMap;
  private popup?: Popup;
  private places: Place[] = [];
  private categoryData: Array<{ name: string; weight: number; places: Place[] }> = [];
  private categoryColors = new Map<string, string>();
  isLoadingPlaces: boolean = false;
  placesError: string | null = null;
  private pendingFeatureShape: any = null;
  private colorPalette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80',
    '#EC7063', '#5DADE2', '#58D68D', '#F4D03F', '#AF7AC5'
  ];
  
  @ViewChild('activitiesChart') activitiesChart?: UIChart;
  
  private featureSelectionService = inject(FeatureSelectionService);
  private mapService = inject(MapService);
  private filterConfigService = inject(FilterConfigService);
  private analyzeService = inject(AnalyzeService);
  private projectsService = inject(ProjectsService);
  private placesService = inject(PlacesService);
  private dialog = inject(MatDialog);
  private translate = inject(TranslateService);
  private featureSubscription?: Subscription;
  private featureInfoSubscription?: Subscription;
  private analyzeSubscription?: Subscription;
  private currentLoadingFeatureId: number | null = null;

  ngOnInit() {
    // Subscribe to feature selection changes
    this.featureSubscription = this.featureSelectionService.selectedMapLibreFeature$.subscribe(
      (feature) => {
        if (feature) {
          this.selectedFeature = feature;
          this.logFeatureInformation(feature);
          this.loadFeatureInfo(feature);
        } else {
          // Cancel any ongoing request
          if (this.featureInfoSubscription) {
            this.featureInfoSubscription.unsubscribe();
            this.featureInfoSubscription = undefined;
          }
          if (this.analyzeSubscription) {
            this.analyzeSubscription.unsubscribe();
            this.analyzeSubscription = undefined;
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
          this.isLoadingPlaces = false;
          this.placesError = null;
        }
      }
    );
  }

  ngAfterViewInit() {
    // Use setTimeout to ensure the view is fully rendered
    setTimeout(() => {
      if (this.mapContainerMini && !this.map && this.shouldShowMap() && this.categoryData.length > 0) {
        this.initializeMap();
        this.addPlacesWhenReady();
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
    if (this.featureInfoSubscription) {
      this.featureInfoSubscription.unsubscribe();
    }
    if (this.analyzeSubscription) {
      this.analyzeSubscription.unsubscribe();
    }
    if (this.map) {
      this.map.remove();
    }
  }

  /**
   * Determines if we should show the map instead of the chart
   */
  shouldShowMap(): boolean {
    const project = this.projectsService.project();
    const isNotMid = project ? !project.is_mid : false;
    const hasSingleCategory = this.analyzeData?.categories?.length === 1;
    return isNotMid || hasSingleCategory;
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

  private logFeatureInformation(feature: any): void {
    console.log('=== Feature Information ===');
    const unnamedText = this.translate.instant('map.popup.unnamed');
    console.log('Name:', feature.properties.name || feature.properties.NAME || unnamedText);
    
    if (feature.properties.score !== undefined && feature.properties.score !== null) {
      const minutes = (feature.properties.score / 60).toFixed(1);
      console.log('Score:', feature.properties.score, 'seconds', `(${minutes} minutes)`);
    }
    
    if (feature.properties.index !== undefined && feature.properties.index !== null) {
      const indexValue = feature.properties.index / 100;
      console.log('Index:', feature.properties.index, `(${indexValue.toFixed(2)})`);
    }
    
    console.log('ID:', feature.properties.id);
    console.log('All Properties:', feature.properties);
    console.log('Geometry:', feature.geometry);
    console.log('===========================');
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

    // Get current zoom level to determine feature type
    const zoom = map.getZoom();
    const featureType = this.mapService.getFeatureTypeFromZoom(zoom);

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
      persona_ids: filters.persona_ids,
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
      persona_ids: filters.persona_ids,
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

    // Run both requests in parallel
    this.featureInfoSubscription = forkJoin({
      featureInfo: featureInfoRequest,
      analyzeData: analyzeRequest
    }).subscribe(({ featureInfo, analyzeData }) => {
      this.isLoadingFeatureInfo = false;
      this.isLoadingAnalyze = false;
      this.currentLoadingFeatureId = null;
      
      // Update feature info
      this.featureInfo = featureInfo;
      
      // Update analyze data
      this.analyzeData = analyzeData;
      
      // Check if we should show map instead of chart
      if (this.shouldShowMap()) {
        // Load places for the map
        this.loadPlacesForMap();
      } else {
        // Show chart as usual
        if (analyzeData && analyzeData.categories) {
          this.initializeActivitiesChart(analyzeData.categories);
        } else {
          this.activitiesChartData = null;
        }
      }
      
      this.featureInfoSubscription = undefined;
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

    const zoom = map.getZoom();
    const featureType = this.mapService.getFeatureTypeFromZoom(zoom);
    const profileCombinationId = this.filterConfigService.currentProfileCombinationID();
    
    if (!profileCombinationId) {
      console.warn('Profile combination ID not available');
      return;
    }

    this.isLoadingPlaces = true;
    this.placesError = null;

    try {
      // Get category IDs from analyzeData
      const categoryIds = this.analyzeData.categories.map(cat => cat.category_id);

      // Load places and feature shape in parallel
      const featureTypeForPlaces = featureType === 'municipality' || featureType === 'hexagon' 
        ? featureType 
        : 'municipality';

      const [placesResponse, featureShape] = await Promise.all([
        firstValueFrom(
          this.placesService.getPlaces({
            feature_type: featureTypeForPlaces,
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
            places: cat.places.filter(p => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon))
          }))
          .sort((a, b) => b.weight - a.weight);
      }

      this.assignCategoryColors();

      // Initialize map if not already done
      if (!this.map && this.mapContainerMini) {
        this.initializeMap();
      } else if (this.map) {
        this.addPlacesWhenReady();
        if (featureShape) {
          this.addFeatureShapeToMap(featureShape);
        }
      } else {
        this.pendingFeatureShape = featureShape;
      }

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

    // Get current map visualization type (index or score)
    const filters = this.filterConfigService.contentLayerFilters();
    const isScoreMode = filters?.feature_type === 'score';
    
    // Get colors based on current map visualization type
    const colors = sortedCategories.map((cat) => {
      if (isScoreMode) {
        // Use score-based colors (from getScoreFillColorExpression)
        const scoreValue = cat.score;
        if (scoreValue <= 600) {
          return 'rgb(0,73,40)'; // Dark green - 0-10 min
        } else if (scoreValue <= 1200) {
          return 'rgb(60,140,100)'; // Darker medium green - 10-20 min
        } else if (scoreValue <= 1800) {
          return 'rgb(120,180,160)'; // Medium-light green - 20-30 min
        } else if (scoreValue <= 2400) {
          return 'rgb(160,140,180)'; // Purple-green transition - 30-40 min
        } else if (scoreValue <= 3000) {
          return 'rgb(180,100,160)'; // Medium purple - 40-50 min
        } else {
          return 'rgb(72,38,131)'; // Dark purple - 50-60 min
        }
      } else {
        // Use index-based colors (from getIndexFillColorExpression)
        const indexValue = cat.index / 100;
        if (indexValue <= 0) {
          return 'rgba(128, 128, 128, 0.7)'; // Transparent gray
        } else if (indexValue <= 0.35) {
          return 'rgba(50, 97, 45, 0.7)'; // Dark green
        } else if (indexValue <= 0.5) {
          return 'rgba(60, 176, 67, 0.7)'; // Green
        } else if (indexValue <= 0.71) {
          return 'rgba(238, 210, 2, 0.7)'; // Yellow
        } else if (indexValue <= 1) {
          return 'rgba(237, 112, 20, 0.7)'; // Orange
        } else if (indexValue <= 1.41) {
          return 'rgba(194, 24, 7, 0.7)'; // Red
        } else {
          return 'rgba(150, 86, 162, 0.7)'; // Purple
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
          borderColor: colors,
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
            title: () => '',
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
  }

  private getGradeFromIndex(index: number): string {
    return this.getGrade(index);
  }

  getSortedCategories(): CategoryScore[] {
    if (!this.analyzeData || !this.analyzeData.categories) {
      return [];
    }
    return [...this.analyzeData.categories]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
  }

  private initializeMap(): void {
    if (!this.mapContainerMini) {
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
        this.map.resize();
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
    let colorIndex = 0;
    this.categoryColors.clear();

    this.categoryData.forEach((category) => {
      if (category.name && !this.categoryColors.has(category.name)) {
        const color = this.colorPalette[colorIndex % this.colorPalette.length];
        this.categoryColors.set(category.name, color);
        colorIndex++;
      }
    });
  }

  private addPlacesToMap(): void {
    if (!this.map || this.categoryData.length === 0) {
      return;
    }

    const beforeLayer = this.map.getLayer('carto-labels-layer') ? 'carto-labels-layer' : undefined;

    this.categoryData.forEach((category) => {
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
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 1.0
            }
          }, beforeLayer);
        } catch (error) {
          console.error(`Error adding layer for ${category.name}:`, error);
        }
      } else {
        this.map!.setPaintProperty(layerId, 'circle-color', color);
      }
    });

    this.setupMarkerInteractions();
    this.setupMarkerClickHandlers();
  }

  private setupMarkerInteractions(): void {
    if (!this.map || !this.popup) {
      return;
    }

    this.categoryData.forEach(category => {
      const layerId = `places-circles-${category.name}`;

      this.map!.on('mouseenter', layerId, () => {
        if (this.map) {
          this.map.getCanvas().style.cursor = 'pointer';
        }
      });

      this.map!.on('mouseleave', layerId, () => {
        if (this.map) {
          this.map.getCanvas().style.cursor = '';
        }
        if (this.popup) {
          this.popup.remove();
        }
      });

      this.map!.on('mousemove', layerId, (e) => {
        if (!this.map || !this.popup || !e.features || e.features.length === 0) {
          return;
        }

        const feature = e.features[0];
        const properties = feature.properties;
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
          .setLngLat(e.lngLat)
          .setHTML(popupContent)
          .addTo(this.map);
      });
    });
  }

  private setupMarkerClickHandlers(): void {
    if (!this.map) {
      return;
    }

    this.categoryData.forEach(category => {
      const layerId = `places-circles-${category.name}`;

      this.map!.on('click', layerId, (e) => {
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

    const zoom = map.getZoom();
    const featureType = this.mapService.getFeatureTypeFromZoom(zoom);
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
    
    const dialogData: AllCategoriesDialogData = {
      featureType: featureType,
      featureId: featureId,
      profileCombinationId: profileCombinationId,
      categoryIds: filters.category_ids,
      personaIds: filters.persona_ids,
      isScoreMode: isScoreMode,
      getGrade: (index: number) => this.getGrade(index),
    };

    this.dialog.open(AllCategoriesDialogComponent, {
      width: '95vw',
      maxWidth: '1400px',
      maxHeight: '90vh',
      panelClass: 'all-categories-dialog-panel',
      data: dialogData
    });
  }
}
