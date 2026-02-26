import { Component, Inject, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SharedModule } from '../../../../shared/shared.module';
import { CommonModule } from '@angular/common';
import { Map as MapLibreMap, NavigationControl, FullscreenControl, Popup, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PlacesService, Place } from '../../../../services/places.service';
import { MapService } from '../../../../services/map.service';
import { firstValueFrom, catchError, of } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

export interface PlacesDialogData {
  featureType: 'municipality' | 'hexagon' | 'county' | 'state';
  featureId: number;
  profileCombinationId: number;
  categoryIds?: number[];
  categoryNames: string;
  personaId?: number;
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
  private popup?: Popup;
  private places: Place[] = [];
  private categoryData: Array<{ name: string; weight: number; places: Place[] }> = [];
  private categoryColors = new Map<string, string>();
  categoryLegendItems: Array<{ name: string; color: string; weight: number; relevance: number; enabled: boolean }> = [];
  private pendingFeatureShape: any = null;
  private colorPalette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80',
    '#EC7063', '#5DADE2', '#58D68D', '#F4D03F', '#AF7AC5'
  ];

  private placesService = inject(PlacesService);
  private mapService = inject(MapService);

  constructor(
    public dialogRef: MatDialogRef<PlacesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PlacesDialogData
  ) {}

  async ngOnInit() {
    this.isLoading = true;
    this.error = null;
    this.categoryName = this.translate.instant('analyze.placesDialog.title');

    try {
      // Load places data and feature shape in parallel
      const featureType = this.data.featureType === 'municipality' || this.data.featureType === 'hexagon' 
        ? this.data.featureType 
        : 'municipality'; // Fallback for county/state

      const [placesResponse, featureShape] = await Promise.all([
        firstValueFrom(
          this.placesService.getPlaces({
            feature_type: featureType,
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
      if (placesResponse.categories) {
        this.categoryData = placesResponse.categories
          .map(cat => ({
            name: cat.category_name,
            weight: cat.weight,
            places: cat.places.filter(p => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon))
          }))
          .sort((a, b) => b.weight - a.weight); // Sort by weight descending, but keep all
        
        
      }
      
      // Assign colors to categories
      this.assignCategoryColors();
      
      // Initialize map if not already done (container might be available now)
      if (!this.map && this.mapContainerPlaces) {
        this.initializeMap();
      } else if (this.map) {
        // Map is already initialized, add places now
        this.addPlacesWhenReady();
        // Add feature shape if available
        if (featureShape) {
          this.addFeatureShapeToMap(featureShape);
        }
      } else {
        // Store feature shape to add later
        this.pendingFeatureShape = featureShape;
      }
      
      this.isLoading = false;
    } catch (err: any) {
      console.error('Error loading places:', err);
      this.error = err?.message || this.translate.instant('analyze.placesDialog.errorLoadingPlaces');
      this.isLoading = false;
    }
  }

  ngAfterViewInit() {
    // Use setTimeout to ensure the view is fully rendered
    // This is especially important when the map container is conditionally rendered
    setTimeout(() => {
      if (this.mapContainerPlaces && !this.map) {
        this.initializeMap();
      }
    }, 0);
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
      minZoom: 5,
      maxZoom: 14,
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
      // Add places if we have them
      this.addPlacesWhenReady();
      // Add feature shape if available
      if (this.pendingFeatureShape) {
        this.addFeatureShapeToMap(this.pendingFeatureShape);
        this.pendingFeatureShape = null;
      }
    });
  }

  /**
   * Adds places to the map when both map and places are ready
   */
  private addPlacesWhenReady(): void {
    if (!this.map) {
      console.warn('Cannot add places: map not initialized');
      return;
    }

    if (this.places.length === 0) {
      console.warn('Cannot add places: no places available');
      return;
    }

    // If map is loaded, add places immediately
    if (this.map.loaded()) {
      console.log('Map is loaded, adding places now');
      this.addPlacesToMap();
      this.fitMapToPlaces();
    } else {
      // Map is still loading, wait for it
      console.log('Map is still loading, waiting for load event');
      this.map.once('load', () => {
        console.log('Map finished loading, adding places');
        this.addPlacesToMap();
        this.fitMapToPlaces();
      });
    }
  }

  private assignCategoryColors(): void {
    let colorIndex = 0;
    
    this.categoryLegendItems = [];
    
    // Calculate total weight for relevance calculation
    const totalWeight = this.categoryData.reduce((sum, cat) => sum + cat.weight, 0);
    
    // Use categoryData which is already sorted by weight
    // Show all categories, but only enable the first 3
    this.categoryData.forEach((category, index) => {
      if (category.name && !this.categoryColors.has(category.name)) {
        const color = this.colorPalette[colorIndex % this.colorPalette.length];
        this.categoryColors.set(category.name, color);
        
        // Calculate relevance as percentage
        const relevance = totalWeight > 0 ? (category.weight / totalWeight) * 100 : 0;
        
        this.categoryLegendItems.push({ 
          name: category.name, 
          color, 
          weight: category.weight,
          relevance: relevance,
          enabled: index < 3 // Only first 3 enabled by default
        });
        colorIndex++;
      }
    });
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
              'circle-stroke-color': '#ffffff',
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
                  'circle-stroke-color': '#ffffff',
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

    // Change cursor on hover
    this.map.on('mouseenter', layerId, () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = 'pointer';
      }
    });

    this.map.on('mouseleave', layerId, () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = '';
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

      // Change cursor on hover
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

      // Show popup on hover
      this.map!.on('mousemove', layerId, (e) => {
        if (!this.map || !this.popup || !e.features || e.features.length === 0) {
          return;
        }

        const feature = e.features[0];
        const properties = feature.properties;
        const name = properties['name'] || 'Unnamed';
        const categoryName = properties['category_name'] || 'Unknown';

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
      duration: 1000
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
