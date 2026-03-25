import { Component, Inject, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { SharedModule } from '../../../../shared/shared.module';
import { CommonModule } from '@angular/common';
import { Map as MapLibreMap, NavigationControl, FullscreenControl, Popup, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PlacesService, Place } from '../../../../services/places.service';
import { MapService } from '../../../../services/map.service';
import { firstValueFrom, catchError, of } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { InfoDialogComponent } from '../../../../shared/info-overlay/info-dialog.component';
import { LegendInfoComponent } from '../../../../shared/legend-info/legend-info.component';

export interface PlacesDialogData {
  featureType: 'municipality' | 'hexagon' | 'county' | 'state';
  featureId: number;
  profileCombinationId: number;
  categoryIds?: number[];
  categoryNames: string;
  personaId?: number;
  isScoreMode: boolean;
}

@Component({
  selector: 'app-places-dialog',
  standalone: true,
  imports: [
    SharedModule,
    CommonModule,
    TranslateModule,
  ],
  templateUrl: './places-dialog.component.html',
  styleUrl: './places-dialog.component.css'
})
export class PlacesDialogComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mapContainerPlaces') mapContainerPlaces?: ElementRef;
  
  isLoading: boolean = false;
  error: string | null = null;
  categoryName: string = '';
  private map?: MapLibreMap;
  private translate = inject(TranslateService);
  private dialog = inject(MatDialog);
  private popup?: Popup;
  private places: Place[] = [];
  private categoryData: Array<{ name: string; weight: number; score: number; index: number; places: Place[] }> = [];
  private categoryColors = new Map<string, string>();
  categoryLegendItems: Array<{ name: string; color: string; weight: number; relevance: number; enabled: boolean; score: number; index: number }> = [];
  private pendingFeatureShape: any = null;
  private viewInitialized = false;
  private dataLoaded = false;
  // Pastel colors for category dots and circle fills (NOT tied to score/index)
  private pastelCategoryColors = [
    '#FAD7A0',
    '#AEC6CF',
    '#C5E1A5',
    '#FFCDD2',
    '#B3E5FC',
    '#E1BEE7',
    '#FFE0B2',
    '#C8E6C9',
    '#D1C4E9',
    '#FFECB3'
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

  private placesService = inject(PlacesService);
  private mapService = inject(MapService);

  constructor(
    public dialogRef: MatDialogRef<PlacesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PlacesDialogData
  ) {}

  openLegendInfo(): void {
    this.dialog.open(InfoDialogComponent, {
      width: '80vw',
      height: '80vh',
      maxWidth: '80vw',
      maxHeight: '80vh',
      panelClass: 'info-dialog-panel',
      data: { content: LegendInfoComponent }
    });
  }

  async ngOnInit() {
    this.isLoading = true;
    this.error = null;
    this.categoryName = this.translate.instant('analyze.placesDialog.title');

    try {
      console.log('Loading places for category:', this.data);
      
      // Check if places are available for this feature type
      // Places API only supports 'municipality' and 'hexagon'
      if (this.data.featureType !== 'municipality' && this.data.featureType !== 'hexagon') {
        // Show error message for unsupported feature types (state/county)
        this.error = this.translate.instant('analyze.placesDialog.disabledForCountiesStates');
        this.isLoading = false;
        
        return;
      }

      // At this point, TypeScript knows featureType is 'municipality' | 'hexagon'
      const featureTypeForPlaces = this.data.featureType as 'municipality' | 'hexagon';

      // Load places data and feature shape in parallel for supported feature types
      const [placesResponse, featureShape] = await Promise.all([
        firstValueFrom(
          this.placesService.getPlaces({
            feature_type: featureTypeForPlaces,
            feature_id: this.data.featureId,
            profile_combination_id: this.data.profileCombinationId,
            category_ids: this.data.categoryIds
          })
        ),
        firstValueFrom(
          this.placesService.getFeatureShape({
            feature_type: this.data.featureType,
            feature_id: this.data.featureId
          }).pipe(
            catchError((error) => {
              // Feature shape is optional, log but don't fail
              console.warn('Could not load feature shape:', error);
              return of(null);
            })
          )
        )
      ]);

      this.categoryName = this.data.categoryNames || this.translate.instant('analyze.placesDialog.title');

      this.places = placesResponse.places || [];
      
      console.log('Places loaded:', this.places.length, this.places);
      
      // Filter out places with invalid coordinates
      this.places = this.places.filter(p => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon));
      
      console.log('Places after filtering:', this.places.length);
      
      // Process category data from response - keep all categories
      if (placesResponse.categories && placesResponse.categories.length > 0) {
        this.categoryData = placesResponse.categories
          .map(cat => ({
            name: cat.category_name,
            weight: cat.weight,
            score: cat.activityScore?.score ?? 0,
            index: cat.activityScore?.index ?? 0,
            places: cat.places.filter(p => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon))
          }))
          .sort((a, b) => b.weight - a.weight); // Sort by weight descending, but keep all
      }
      
      // Assign colors to categories
      this.assignCategoryColors();

      // Defer map initialization until both (1) the view is ready and (2) the data is loaded.
      // This avoids race conditions around MapLibre's `load` event.
      this.pendingFeatureShape = featureShape;
      this.dataLoaded = true;
      this.tryInitializeMap();
    } catch (err: any) {
      console.error('Error loading places:', err);
      this.error = err?.message || this.translate.instant('analyze.placesDialog.errorLoadingPlaces');
      this.isLoading = false;
    }
  }

  ngAfterViewInit() {
    this.viewInitialized = true;
    // Keep a micro-delay for cases where the container is conditionally rendered.
    setTimeout(() => this.tryInitializeMap(), 0);
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  private initializeMap(): void {
    if (!this.mapContainerPlaces) {
      return;
    }

    // Get base map style from MapService
    const baseStyle = this.mapService.getBaseMapStyle();

    const mapOptions: any = {
      container: this.mapContainerPlaces.nativeElement,
      style: baseStyle,
      center: [9.2156505, 49.320099], // Default center (Germany)
      zoom: 7,
      dragRotate: false,
      renderWorldCopies: false,
      attributionControl: false
    };

    this.map = new MapLibreMap(mapOptions);

    // Initialize popup
    this.popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      anchor: 'bottom',
      offset: [0, -5]
    });

    // Add navigation controls
    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new FullscreenControl(), 'top-right');
    this.map.dragRotate.disable();
    this.map.touchZoomRotate.disableRotation();

    // Wait for map to load before adding places
    this.map.once('load', () => {
      console.log('Map loaded, places count:', this.places.length);
      // Trigger resize to ensure map renders correctly in dialog
      if (this.map) {
        this.map.resize();
      }
      // Add places if we have them (styles are loaded at this point)
      if (this.places.length > 0 && this.categoryData.length > 0) {
        this.addPlacesToMap();
        this.fitMapToPlaces();
      }
      // Add feature shape if available
      if (this.pendingFeatureShape) {
        this.addFeatureShapeToMap(this.pendingFeatureShape);
        this.pendingFeatureShape = null;
      }

      this.isLoading = false;
    });
  }

  private tryInitializeMap(): void {
    if (!this.viewInitialized || !this.dataLoaded) {
      return;
    }
    if (this.map) {
      return;
    }
    if (this.mapContainerPlaces) {
      this.initializeMap();
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
    return !!this.data.isScoreMode;
  }

  private getScoreColor(score: number): string {
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

  private getIndexColor(index: number): string {
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
    return this.getScoreColor(score);
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

  getGradeFromIndex(index: number): string {
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

  private addPlacesToMap(): void {
    if (!this.map) {
      console.warn('Cannot add places: map not initialized');
      return;
    }

    if (this.categoryData.length === 0) {
      console.warn('Cannot add places: no category data available');
      return;
    }

    console.log('Creating separate layers for each category');

    // Find the labels layer to insert before it, or add at the end
    const beforeLayer = this.map.getLayer('carto-labels-layer') ? 'carto-labels-layer' : undefined;

    // Create a separate layer for each enabled category
    this.categoryData.forEach((category, index) => {
      const legendItem = this.categoryLegendItems.find(item => item.name === category.name);
      const isEnabled = legendItem?.enabled ?? (index < 3);
      
      // Only create layers for enabled categories initially
      if (!isEnabled) {
        return;
      }

      const sourceId = `places-${category.name}`;
      const layerId = `places-circles-${category.name}`;

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

      const color = this.categoryColors.get(category.name) || '#4ECDC4';

      // Add or update source
      if (this.map!.getSource(sourceId)) {
        (this.map!.getSource(sourceId) as GeoJSONSource).setData(geoJsonData);
      } else {
        this.map!.addSource(sourceId, {
          type: 'geojson',
          data: geoJsonData
        });
      }

      // Add or update layer
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
                5, 4,   // At zoom 5, radius 4
                10, 8,  // At zoom 10, radius 8
                14, 12  // At zoom 14, radius 12
              ],
              'circle-color': color,
              'circle-stroke-width': 2,
              'circle-stroke-color': 'rgba(0, 0, 0, 0.45)',
              'circle-opacity': 1.0
            }
          }, beforeLayer);
          console.log(`Layer added for category: ${category.name}`);
        } catch (error) {
          console.error(`Error adding layer for ${category.name}:`, error);
        }
      } else {
        // Update existing layer
        this.map!.setPaintProperty(layerId, 'circle-color', color);
      }
    });

    // Add hover interactions and click handlers
    this.setupMarkerInteractions();
    this.setupMarkerClickHandlers();
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

    // Show popup only after the pointer has been stable for a moment.
    const HOVER_POPUP_DEBOUNCE_MS = 120;

    // Change cursor on hover
    this.map.on('mouseenter', layerId, () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = 'pointer';
      }

      // Cancel any pending debounced popup update.
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

    // Convert single feature to FeatureCollection if needed
    const geoJsonData = featureShape.type === 'FeatureCollection' 
      ? featureShape 
      : {
          type: 'FeatureCollection' as const,
          features: [featureShape]
        };

    const sourceId = 'feature-shape';
    const layerId = 'feature-shape-fill';

    // Add or update source
    if (this.map.getSource(sourceId)) {
      (this.map.getSource(sourceId) as GeoJSONSource).setData(geoJsonData);
    } else {
      this.map.addSource(sourceId, {
        type: 'geojson',
        data: geoJsonData
      });
    }

    // Add fill layer
    if (!this.map.getLayer(layerId)) {
      try {
        // Find the labels layer to insert before it, or add at the end
        const beforeLayer = this.map.getLayer('carto-labels-layer') ? 'carto-labels-layer' : undefined;
        
        this.map.addLayer({
          id: layerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': '#808080', // Slight gray
            'fill-opacity': 0.3
          }
        }, beforeLayer);

        // Add outline layer for better visibility
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

        console.log('Feature shape added to map');
      } catch (error) {
        console.error('Error adding feature shape layer:', error);
      }
    } else {
      // Update existing layer
      (this.map.getSource(sourceId) as GeoJSONSource).setData(geoJsonData);
    }
  }

  private setupMarkerInteractions(): void {
    if (!this.map || !this.popup) {
      return;
    }

    // Set up interactions for each category layer
    this.categoryData.forEach(category => {
      const layerId = `places-circles-${category.name}`;

      let mousemovePopupTimeout: any = null;
      let pendingPopupFeature: any = null;
      let pendingPopupLngLat: any = null;
      const HOVER_POPUP_DEBOUNCE_MS = 120;

      // Change cursor on hover
      this.map!.on('mouseenter', layerId, () => {
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

      this.map!.on('mouseleave', layerId, () => {
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
      this.map!.on('mousemove', layerId, (e) => {
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
          const name = properties['name'] || 'Unnamed';
          const categoryName = properties['category_name'] || 'Unknown';

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
    });
  }

  private setupMarkerClickHandlers(): void {
    if (!this.map) {
      return;
    }

    // Set up click handlers for each category layer
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

  private fitMapToPlaces(): void {
    if (!this.map || this.categoryData.length === 0) {
      console.warn('Cannot fit map: map or category data missing');
      return;
    }

    // Calculate bounds from all places in categoryData
    const allPlaces = this.categoryData.flatMap(cat => cat.places);
    const lngs = allPlaces.map(p => p.lon).filter(lng => !isNaN(lng) && lng !== 0);
    const lats = allPlaces.map(p => p.lat).filter(lat => !isNaN(lat) && lat !== 0);

    if (lngs.length === 0 || lats.length === 0) {
      console.warn('No valid coordinates found in places');
      return;
    }

    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    console.log('Map bounds:', { minLng, maxLng, minLat, maxLat });

    // Add padding
    const padding = 0.1;
    const lngPadding = (maxLng - minLng) * padding;
    const latPadding = (maxLat - minLat) * padding;

    const bounds: [[number, number], [number, number]] = [
      [minLng - lngPadding, minLat - latPadding],
      [maxLng + lngPadding, maxLat + latPadding]
    ];

    console.log('Fitting map to bounds:', bounds);

    this.map.fitBounds(bounds, {
      padding: 50,
      duration: 1000,
      maxZoom: 14 // Prevent zooming too close
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
