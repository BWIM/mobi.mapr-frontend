import { Injector, WritableSignal, afterNextRender } from '@angular/core';
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  GeoJSONSource,
} from 'maplibre-gl';
import { firstValueFrom, catchError, of } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { PlacesService, Place } from '../../services/places.service';
import { MapService } from '../../services/map.service';
import { PlacesDialogData } from '../right/analyze/places/places-dialog.component';

export interface CategoryLegendItem {
  name: string;
  color: string;
  weight: number;
  relevance: number;
  enabled: boolean;
  score: number;
  index: number;
}

export interface MobilePlacesMapState {
  title: WritableSignal<string>;
  isLoading: WritableSignal<boolean>;
  error: WritableSignal<string | null>;
  isScoreMode: WritableSignal<boolean>;
  categoryLegendItems: WritableSignal<CategoryLegendItem[]>;
}

export class MobilePlacesMap {
  private data?: PlacesDialogData;
  private map?: MapLibreMap;
  private popup?: Popup;
  private places: Place[] = [];
  private categoryData: Array<{
    name: string;
    weight: number;
    score: number;
    index: number;
    places: Place[];
  }> = [];
  private categoryColors = new Map<string, string>();
  private pendingFeatureShape: unknown = null;
  private viewInitialized = false;
  private dataLoaded = false;
  private mapStyleLoaded = false;
  private mapContentApplied = false;
  private resizeObserver?: ResizeObserver;
  private mapContainer?: HTMLElement;

  private readonly pastelCategoryColors = [
    '#FAD7A0',
    '#AEC6CF',
    '#C5E1A5',
    '#FFCDD2',
    '#B3E5FC',
    '#E1BEE7',
    '#FFE0B2',
    '#C8E6C9',
    '#D1C4E9',
    '#FFECB3',
  ];

  constructor(
    private readonly state: MobilePlacesMapState,
    private readonly placesService: PlacesService,
    private readonly mapService: MapService,
    private readonly translate: TranslateService,
    private readonly injector: Injector,
  ) {}

  async load(data: PlacesDialogData): Promise<void> {
    this.data = data;
    this.state.title.set(data.categoryNames || '');
    this.state.isScoreMode.set(!!data.isScoreMode);
    this.state.isLoading.set(true);
    this.state.error.set(null);

    try {
      if (data.featureType !== 'municipality' && data.featureType !== 'hexagon') {
        this.state.error.set(
          this.translate.instant('analyze.placesDialog.disabledForCountiesStates'),
        );
        this.state.isLoading.set(false);
        return;
      }

      const featureTypeForPlaces = data.featureType as 'municipality' | 'hexagon';

      const [placesResponse, featureShape] = await Promise.all([
        firstValueFrom(
          this.placesService.getPlaces({
            feature_type: featureTypeForPlaces,
            feature_id: data.featureId,
            profile_ids: data.profileIds,
            category_ids: data.categoryIds,
          }),
        ),
        firstValueFrom(
          this.placesService
            .getFeatureShape({
              feature_type: data.featureType,
              feature_id: data.featureId,
            })
            .pipe(
              catchError((err) => {
                console.warn('Could not load feature shape:', err);
                return of(null);
              }),
            ),
        ),
      ]);

      this.state.title.set(
        data.categoryNames || this.translate.instant('analyze.placesDialog.title'),
      );

      this.places = (placesResponse.places || []).filter(
        (p) => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon),
      );

      if (placesResponse.categories?.length) {
        this.categoryData = placesResponse.categories
          .map((cat) => ({
            name: cat.category_name,
            weight: cat.weight,
            score: cat.activityScore?.score ?? 0,
            index: cat.activityScore?.index ?? 0,
            places: cat.places.filter(
              (p) => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon),
            ),
          }))
          .sort((a, b) => b.weight - a.weight);
      }

      this.assignCategoryColors();
      this.pendingFeatureShape = featureShape;
      this.dataLoaded = true;
      this.state.isLoading.set(false);
      this.scheduleMapInit();
      this.refreshMapContent();
    } catch (err: unknown) {
      console.error('Error loading places:', err);
      const message =
        err instanceof Error
          ? err.message
          : this.translate.instant('analyze.placesDialog.errorLoadingPlaces');
      this.state.error.set(message);
      this.state.isLoading.set(false);
    }
  }

  attach(container: HTMLElement): void {
    this.mapContainer = container;
    this.viewInitialized = true;
    this.scheduleMapInit();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
    this.mapContainer = undefined;
    this.viewInitialized = false;
    this.dataLoaded = false;
    this.mapStyleLoaded = false;
    this.mapContentApplied = false;
    this.pendingFeatureShape = null;
  }

  toggleCategory(categoryName: string): void {
    const items = this.state.categoryLegendItems();
    const legendItem = items.find((item) => item.name === categoryName);
    if (!legendItem || !this.map) {
      return;
    }

    legendItem.enabled = !legendItem.enabled;
    this.state.categoryLegendItems.set([...items]);

    const layerId = `places-circles-${categoryName}`;
    const sourceId = `places-${categoryName}`;

    if (legendItem.enabled) {
      if (!this.map.getLayer(layerId)) {
        const category = this.categoryData.find((cat) => cat.name === categoryName);
        if (category) {
          const features = category.places.map((place) => ({
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [place.lon, place.lat],
            },
            properties: {
              id: place.id,
              name: place.name,
              category_id: place.category_id || 0,
              category_name:
                place.category_name ||
                this.translate.instant('map.popup.notAvailable'),
              url: place['url'] || null,
            },
          }));

          const geoJsonData = {
            type: 'FeatureCollection' as const,
            features,
          };

          const color = this.categoryColors.get(categoryName) || '#4ECDC4';

          if (!this.map.getSource(sourceId)) {
            this.map.addSource(sourceId, {
              type: 'geojson',
              data: geoJsonData,
            });
          } else {
            (this.map.getSource(sourceId) as GeoJSONSource).setData(geoJsonData);
          }

          const beforeLayer = this.map.getLayer('carto-labels-layer')
            ? 'carto-labels-layer'
            : undefined;
          try {
            this.map.addLayer(
              {
                id: layerId,
                type: 'circle',
                source: sourceId,
                paint: {
                  'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    5,
                    4,
                    10,
                    8,
                    14,
                    12,
                  ],
                  'circle-color': color,
                  'circle-stroke-width': 2,
                  'circle-stroke-color': 'rgba(0, 0, 0, 0.45)',
                  'circle-opacity': 1.0,
                },
              },
              beforeLayer,
            );
            this.setupMarkerInteractionsForLayer(layerId);
            this.setupMarkerClickHandlerForLayer(layerId);
          } catch (err) {
            console.error(`Error creating layer for ${categoryName}:`, err);
          }
        }
      } else {
        this.map.setLayoutProperty(layerId, 'visibility', 'visible');
      }
    } else if (this.map.getLayer(layerId)) {
      this.map.setLayoutProperty(layerId, 'visibility', 'none');
    }
  }

  private assignCategoryColors(): void {
    this.categoryColors.clear();
    const items: CategoryLegendItem[] = [];
    const totalWeight = this.categoryData.reduce((sum, cat) => sum + cat.weight, 0);

    this.categoryData.forEach((category, index) => {
      if (!category.name || this.categoryColors.has(category.name)) {
        return;
      }

      const pastelColor = this.pastelCategoryColors[index % this.pastelCategoryColors.length];
      this.categoryColors.set(category.name, pastelColor);

      const relevance = totalWeight > 0 ? (category.weight / totalWeight) * 100 : 0;

      items.push({
        name: category.name,
        color: pastelColor,
        weight: category.weight,
        relevance,
        enabled: index < 3,
        score: category.score,
        index: category.index,
      });
    });

    this.state.categoryLegendItems.set(items);
  }

  private scheduleMapInit(): void {
    afterNextRender(() => this.tryInitializeMap(), { injector: this.injector });
  }

  private tryInitializeMap(): void {
    if (!this.viewInitialized || this.state.error()) {
      return;
    }
    if (this.map || !this.mapContainer) {
      return;
    }
    this.initializeMap();
  }

  private refreshMapContent(): void {
    if (!this.map || !this.mapStyleLoaded || !this.dataLoaded) {
      return;
    }

    this.map.resize();
    requestAnimationFrame(() => this.map?.resize());

    if (!this.mapContentApplied && this.categoryData.length > 0) {
      this.addPlacesToMap();
      this.fitMapToPlaces();
      this.mapContentApplied = true;
    }

    if (this.pendingFeatureShape) {
      this.addFeatureShapeToMap(this.pendingFeatureShape);
      this.pendingFeatureShape = null;
    }
  }

  private initializeMap(): void {
    if (!this.mapContainer) {
      return;
    }

    const baseStyle = this.mapService.getBaseMapStyle();
    this.map = new MapLibreMap({
      container: this.mapContainer,
      style: baseStyle,
      center: [9.2156505, 49.320099],
      zoom: 7,
      dragRotate: false,
      renderWorldCopies: false,
      attributionControl: false,
    });

    this.popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      anchor: 'bottom',
      offset: [0, -5],
    });

    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.dragRotate.disable();
    this.map.touchZoomRotate.disableRotation();

    this.resizeObserver = new ResizeObserver(() => {
      this.map?.resize();
    });
    this.resizeObserver.observe(this.mapContainer);

    this.map.once('load', () => {
      this.mapStyleLoaded = true;
      this.refreshMapContent();
    });
  }

  private addPlacesToMap(): void {
    if (!this.map || this.categoryData.length === 0) {
      return;
    }

    const beforeLayer = this.map.getLayer('carto-labels-layer')
      ? 'carto-labels-layer'
      : undefined;

    this.categoryData.forEach((category, index) => {
      const legendItem = this.state.categoryLegendItems().find((item) => item.name === category.name);
      const isEnabled = legendItem?.enabled ?? index < 3;
      if (!isEnabled) {
        return;
      }

      const sourceId = `places-${category.name}`;
      const layerId = `places-circles-${category.name}`;
      const features = category.places.map((place) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [place.lon, place.lat],
        },
        properties: {
          id: place.id,
          name: place.name,
          category_id: place.category_id || 0,
          category_name:
            place.category_name || this.translate.instant('map.popup.notAvailable'),
          url: place['url'] || null,
        },
      }));

      const geoJsonData = { type: 'FeatureCollection' as const, features };
      const color = this.categoryColors.get(category.name) || '#4ECDC4';

      if (this.map!.getSource(sourceId)) {
        (this.map!.getSource(sourceId) as GeoJSONSource).setData(geoJsonData);
      } else {
        this.map!.addSource(sourceId, { type: 'geojson', data: geoJsonData });
      }

      if (!this.map!.getLayer(layerId)) {
        try {
          this.map!.addLayer(
            {
              id: layerId,
              type: 'circle',
              source: sourceId,
              paint: {
                'circle-radius': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  5,
                  4,
                  10,
                  8,
                  14,
                  12,
                ],
                'circle-color': color,
                'circle-stroke-width': 2,
                'circle-stroke-color': 'rgba(0, 0, 0, 0.45)',
                'circle-opacity': 1.0,
              },
            },
            beforeLayer,
          );
        } catch (err) {
          console.error(`Error adding layer for ${category.name}:`, err);
        }
      } else {
        this.map!.setPaintProperty(layerId, 'circle-color', color);
      }
    });

    this.setupMarkerInteractions();
    this.setupMarkerClickHandlers();
  }

  private addFeatureShapeToMap(featureShape: unknown): void {
    if (!this.map || !featureShape) {
      return;
    }

    const shape = featureShape as { type?: string };
    const geoJsonData =
      shape.type === 'FeatureCollection'
        ? featureShape
        : {
            type: 'FeatureCollection' as const,
            features: [featureShape],
          };

    const sourceId = 'feature-shape';
    const layerId = 'feature-shape-fill';
    const beforeLayer = this.map.getLayer('carto-labels-layer')
      ? 'carto-labels-layer'
      : undefined;

    if (this.map.getSource(sourceId)) {
      (this.map.getSource(sourceId) as GeoJSONSource).setData(geoJsonData as never);
    } else {
      this.map.addSource(sourceId, { type: 'geojson', data: geoJsonData as never });
    }

    if (!this.map.getLayer(layerId)) {
      try {
        this.map.addLayer(
          {
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: { 'fill-color': '#808080', 'fill-opacity': 0.3 },
          },
          beforeLayer,
        );
        this.map.addLayer(
          {
            id: 'feature-shape-outline',
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': '#808080',
              'line-width': 1,
              'line-opacity': 0.5,
            },
          },
          beforeLayer,
        );
      } catch (err) {
        console.error('Error adding feature shape layer:', err);
      }
    } else {
      (this.map.getSource(sourceId) as GeoJSONSource).setData(geoJsonData as never);
    }
  }

  private setupMarkerInteractionsForLayer(layerId: string): void {
    if (!this.map || !this.popup) {
      return;
    }

    let mousemovePopupTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingPopupFeature: GeoJSON.Feature | null = null;
    let pendingPopupLngLat: { lng: number; lat: number } | null = null;
    const HOVER_POPUP_DEBOUNCE_MS = 120;

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
      }
      this.popup?.remove();
    });

    this.map.on('mousemove', layerId, (e) => {
      if (!this.map || !this.popup || !e.features?.length) {
        return;
      }

      pendingPopupFeature = e.features[0] as GeoJSON.Feature;
      pendingPopupLngLat = e.lngLat;

      if (mousemovePopupTimeout) {
        clearTimeout(mousemovePopupTimeout);
      }

      mousemovePopupTimeout = setTimeout(() => {
        if (!this.map || !this.popup || !pendingPopupFeature || !pendingPopupLngLat) {
          return;
        }

        const properties = pendingPopupFeature.properties as Record<string, string>;
        const name =
          properties['name'] || this.translate.instant('map.popup.unnamed');
        const categoryName =
          properties['category_name'] ||
          this.translate.instant('map.popup.notAvailable');

        this.popup
          .setLngLat(pendingPopupLngLat)
          .setHTML(
            `<div><div style="font-weight:600;margin-bottom:4px;">${name}</div><div style="font-size:12px;color:#666;">${categoryName}</div></div>`,
          )
          .addTo(this.map);
      }, HOVER_POPUP_DEBOUNCE_MS);
    });
  }

  private setupMarkerClickHandlerForLayer(layerId: string): void {
    if (!this.map) {
      return;
    }

    this.map.on('click', layerId, (e) => {
      if (!e.features?.length) {
        return;
      }
      const properties = e.features[0].properties as Record<string, string>;
      const url = properties['url'];
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  }

  private setupMarkerInteractions(): void {
    if (!this.map || !this.popup) {
      return;
    }

    this.categoryData.forEach((category) => {
      const layerId = `places-circles-${category.name}`;
      if (!this.map?.getLayer(layerId)) {
        return;
      }

      let mousemovePopupTimeout: ReturnType<typeof setTimeout> | null = null;
      let pendingPopupFeature: GeoJSON.Feature | null = null;
      let pendingPopupLngLat: { lng: number; lat: number } | null = null;
      const HOVER_POPUP_DEBOUNCE_MS = 120;

      this.map!.on('mouseenter', layerId, () => {
        this.map!.getCanvas().style.cursor = 'pointer';
        if (mousemovePopupTimeout) {
          clearTimeout(mousemovePopupTimeout);
          mousemovePopupTimeout = null;
        }
      });

      this.map!.on('mouseleave', layerId, () => {
        this.map!.getCanvas().style.cursor = '';
        if (mousemovePopupTimeout) {
          clearTimeout(mousemovePopupTimeout);
        }
        this.popup?.remove();
      });

      this.map!.on('mousemove', layerId, (e) => {
        if (!e.features?.length) {
          return;
        }

        pendingPopupFeature = e.features[0] as GeoJSON.Feature;
        pendingPopupLngLat = e.lngLat;

        if (mousemovePopupTimeout) {
          clearTimeout(mousemovePopupTimeout);
        }

        mousemovePopupTimeout = setTimeout(() => {
          if (!this.map || !this.popup || !pendingPopupFeature || !pendingPopupLngLat) {
            return;
          }

          const properties = pendingPopupFeature.properties as Record<string, string>;
          const name = properties['name'] || 'Unnamed';
          const categoryName = properties['category_name'] || 'Unknown';

          this.popup
            .setLngLat(pendingPopupLngLat)
            .setHTML(
              `<div><div style="font-weight:600;margin-bottom:4px;">${name}</div><div style="font-size:12px;color:#666;">${categoryName}</div></div>`,
            )
            .addTo(this.map);
        }, HOVER_POPUP_DEBOUNCE_MS);
      });
    });
  }

  private setupMarkerClickHandlers(): void {
    if (!this.map) {
      return;
    }

    this.categoryData.forEach((category) => {
      const layerId = `places-circles-${category.name}`;
      if (!this.map?.getLayer(layerId)) {
        return;
      }

      this.map!.on('click', layerId, (e) => {
        if (!e.features?.length) {
          return;
        }
        const properties = e.features[0].properties as Record<string, string>;
        const url = properties['url'];
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    });
  }

  private fitMapToPlaces(): void {
    if (!this.map || this.categoryData.length === 0) {
      return;
    }

    const allPlaces = this.categoryData.flatMap((cat) => cat.places);
    const lngs = allPlaces.map((p) => p.lon).filter((lng) => !isNaN(lng) && lng !== 0);
    const lats = allPlaces.map((p) => p.lat).filter((lat) => !isNaN(lat) && lat !== 0);

    if (!lngs.length || !lats.length) {
      return;
    }

    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const padding = 0.1;
    const lngPadding = (maxLng - minLng) * padding;
    const latPadding = (maxLat - minLat) * padding;

    this.map.fitBounds(
      [
        [minLng - lngPadding, minLat - latPadding],
        [maxLng + lngPadding, maxLat + latPadding],
      ],
      { padding: 40, duration: 800 },
    );
  }
}
