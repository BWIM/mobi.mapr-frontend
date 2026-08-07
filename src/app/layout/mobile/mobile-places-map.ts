import { Injector, NgZone, WritableSignal, afterNextRender } from '@angular/core';
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
import { findBasemapLabelsBeforeId } from '../../services/basemap-style';
import { PlacesDialogData } from '../right/analyze/places/places-dialog.component';
import { CompositionNode } from '../../interfaces/composition';
import { CompositionActivityMeta } from '../../shared/category-composition-panel/category-composition-panel.component';
import { ScoreColorsService } from '../../services/score-colors.service';
import { gradeColor, scoreColor } from './analyze-chart.utils';

export interface CategoryLegendItem {
  name: string;
  color: string;
  weight: number;
  relevance: number;
  enabled: boolean;
  score: number;
  index: number;
  activity_id?: number;
}

export interface MobilePlacesMapState {
  title: WritableSignal<string>;
  isLoading: WritableSignal<boolean>;
  error: WritableSignal<string | null>;
  isScoreMode: WritableSignal<boolean>;
  categoryLegendItems: WritableSignal<CategoryLegendItem[]>;
  composition: WritableSignal<CompositionNode | null>;
  compositionActivityMeta: WritableSignal<Record<number, CompositionActivityMeta>>;
  highlightedActivityName: WritableSignal<string | null>;
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
    activity_id?: number;
  }> = [];
  private categoryColors = new Map<string, string>();
  private pendingFeatureShape: unknown = null;
  private viewInitialized = false;
  private dataLoaded = false;
  private mapStyleLoaded = false;
  private mapContentApplied = false;
  private resizeObserver?: ResizeObserver;
  private mapContainer?: HTMLElement;
  private readonly ngZone: NgZone;
  private pinnedActivityName: string | null = null;
  private hoveredActivityName: string | null = null;

  constructor(
    private readonly state: MobilePlacesMapState,
    private readonly placesService: PlacesService,
    private readonly mapService: MapService,
    private readonly translate: TranslateService,
    private readonly injector: Injector,
  ) {
    this.ngZone = injector.get(NgZone);
  }

  private get scoreColorsService(): ScoreColorsService {
    return this.injector.get(ScoreColorsService);
  }

  private getMarkerFillColor(score: number, index: number): string {
    return this.state.isScoreMode()
      ? scoreColor(score, this.scoreColorsService.getConfig())
      : gradeColor(index);
  }

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

      this.state.composition.set(placesResponse.composition ?? null);

      if (placesResponse.categories?.length) {
        this.categoryData = placesResponse.categories
          .map((cat) => ({
            name: cat.category_name,
            weight: cat.weight,
            score: cat.activityScore?.score ?? 0,
            index: cat.activityScore?.index ?? 0,
            activity_id: cat.activity_id,
            places: cat.places.filter(
              (p) => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon),
            ),
          }))
          .sort((a, b) => b.weight - a.weight);
      } else {
        this.categoryData = [];
      }

      this.assignCategoryColors();
      this.syncCompositionActivityMeta(placesResponse.categories || []);
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

  /** Click pins (or unpins) highlight — does not hide map layers. */
  selectActivity(activityName: string): void {
    this.pinnedActivityName =
      this.pinnedActivityName === activityName ? null : activityName;
    this.applyEffectiveHighlight();
  }

  setHoveredActivity(activityName: string | null): void {
    this.hoveredActivityName = activityName;
    this.applyEffectiveHighlight();
  }

  private applyEffectiveHighlight(): void {
    this.setHighlightedActivity(this.hoveredActivityName ?? this.pinnedActivityName);
  }

  setHighlightedActivity(activityName: string | null): void {
    if (this.state.highlightedActivityName() === activityName) {
      return;
    }
    this.state.highlightedActivityName.set(activityName);
    this.applyMarkerHighlightStyles();
  }

  private assignCategoryColors(): void {
    this.categoryColors.clear();
    const totalWeight = this.categoryData.reduce((sum, cat) => sum + cat.weight, 0);

    const items: CategoryLegendItem[] = [];
    this.categoryData.forEach((category, index) => {
      if (!category.name || this.categoryColors.has(category.name)) {
        return;
      }

      const fillColor = this.getMarkerFillColor(category.score, category.index);
      this.categoryColors.set(category.name, fillColor);
      const relevance = totalWeight > 0 ? (category.weight / totalWeight) * 100 : 0;

      items.push({
        name: category.name,
        color: fillColor,
        weight: category.weight,
        relevance,
        enabled: this.state.composition() ? true : index < 3,
        score: category.score,
        index: category.index,
        activity_id: category.activity_id,
      });
    });

    this.state.categoryLegendItems.set(items);
  }

  private syncCompositionActivityMeta(
    categories: Array<{
      activity_id?: number;
      role_hint?: 'primary' | 'substitute';
      category_name?: string;
      activityScore?: { score?: number; index?: number };
      weight?: number;
    }>
  ): void {
    const legendByName = new Map(
      this.state.categoryLegendItems().map((item) => [item.name, item])
    );
    const isScore = this.state.isScoreMode();
    const meta: Record<number, CompositionActivityMeta> = {};

    for (const cat of this.categoryData) {
      if (cat.activity_id == null) {
        continue;
      }
      const legend = legendByName.get(cat.name);
      const apiCat = categories.find((c) => c.activity_id === cat.activity_id);
      const metricLabel = isScore
        ? `${(cat.score / 60).toFixed(1)} ${this.translate.instant('map.popup.minutes')}`
        : this.gradeFromIndex(cat.index);
      meta[cat.activity_id] = {
        name: cat.name,
        color: legend?.color,
        weight: cat.weight,
        relevance: legend?.relevance,
        enabled: legend?.enabled ?? true,
        score: cat.score,
        index: cat.index,
        role_hint: apiCat?.role_hint,
        metricLabel,
        metricColor: this.getMarkerFillColor(cat.score, cat.index),
      };
    }
    this.state.compositionActivityMeta.set(meta);
  }

  private refreshCompositionEnabledFlags(): void {
    const legendByName = new Map(
      this.state.categoryLegendItems().map((item) => [item.name, item])
    );
    const current = this.state.compositionActivityMeta();
    const next: Record<number, CompositionActivityMeta> = {};
    for (const [id, meta] of Object.entries(current)) {
      const legend = meta.name ? legendByName.get(meta.name) : undefined;
      next[Number(id)] = {
        ...meta,
        enabled: legend?.enabled ?? meta.enabled,
      };
    }
    this.state.compositionActivityMeta.set(next);
  }

  private gradeFromIndex(index: number): string {
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

    this.categoryData.forEach((category, index) => {
      const legendItem = this.state.categoryLegendItems().find((item) => item.name === category.name);
      const isEnabled = legendItem?.enabled ?? index < 3;
      if (!isEnabled) {
        return;
      }
      try {
        this.ensureCategoryLayers(category);
      } catch (err) {
        console.error(`Error adding layer for ${category.name}:`, err);
      }
    });
  }

  private circleRadiusExpression(highlighted: boolean): unknown[] {
    if (highlighted) {
      return ['interpolate', ['linear'], ['zoom'], 5, 10, 10, 15, 14, 20];
    }
    return ['interpolate', ['linear'], ['zoom'], 5, 6, 10, 9, 14, 12];
  }

  private ensureCategoryLayers(
    category: {
      name: string;
      places: Place[];
      activity_id?: number;
      score: number;
      index: number;
    },
  ): void {
    if (!this.map) {
      return;
    }
    const sourceId = `places-${category.name}`;
    const circleLayerId = `places-circles-${category.name}`;
    const labelLayerId = `places-labels-${category.name}`;
    const beforeLayer = findBasemapLabelsBeforeId(this.map);
    const fillColor = this.getMarkerFillColor(category.score, category.index);
    const highlightedName = this.state.highlightedActivityName();
    const isHighlighted = highlightedName === category.name;

    if (this.map.getLayer(labelLayerId)) {
      this.map.removeLayer(labelLayerId);
    }

    const geoJsonData = {
      type: 'FeatureCollection' as const,
      features: category.places.map((place) => ({
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
      })),
    };

    if (this.map.getSource(sourceId)) {
      (this.map.getSource(sourceId) as GeoJSONSource).setData(geoJsonData);
    } else {
      this.map.addSource(sourceId, { type: 'geojson', data: geoJsonData });
    }

    if (!this.map.getLayer(circleLayerId)) {
      this.map.addLayer(
        {
          id: circleLayerId,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-radius': this.circleRadiusExpression(isHighlighted) as any,
            'circle-color': fillColor,
            'circle-stroke-width': isHighlighted ? 2.5 : 1.5,
            'circle-stroke-color': isHighlighted ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.55)',
            'circle-opacity': 1.0,
            'circle-stroke-opacity': 1.0,
          },
        },
        beforeLayer,
      );
      this.setupMarkerInteractionsForLayer(circleLayerId, category.name);
      this.setupMarkerClickHandlerForLayer(circleLayerId);
    } else {
      this.map.setPaintProperty(circleLayerId, 'circle-color', fillColor);
      this.map.setLayoutProperty(circleLayerId, 'visibility', 'visible');
      this.applyHighlightStyleToLayer(
        category.name,
        isHighlighted,
        highlightedName != null && !isHighlighted,
      );
    }
  }

  private applyMarkerHighlightStyles(): void {
    if (!this.map) {
      return;
    }
    const highlighted = this.state.highlightedActivityName();
    for (const cat of this.categoryData) {
      const legend = this.state.categoryLegendItems().find((item) => item.name === cat.name);
      if (legend && !legend.enabled) {
        continue;
      }
      const isHighlighted = highlighted != null && highlighted === cat.name;
      const isDimmed = highlighted != null && highlighted !== cat.name;
      this.applyHighlightStyleToLayer(cat.name, isHighlighted, isDimmed);
    }
  }

  private applyHighlightStyleToLayer(
    categoryName: string,
    highlighted: boolean,
    dimmed = false,
  ): void {
    if (!this.map) {
      return;
    }
    const circleLayerId = `places-circles-${categoryName}`;
    if (!this.map.getLayer(circleLayerId)) {
      return;
    }
    this.map.setPaintProperty(
      circleLayerId,
      'circle-radius',
      this.circleRadiusExpression(highlighted) as any,
    );
    this.map.setPaintProperty(circleLayerId, 'circle-stroke-width', highlighted ? 2.5 : 1.5);
    this.map.setPaintProperty(
      circleLayerId,
      'circle-stroke-color',
      highlighted ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.55)',
    );
    this.map.setPaintProperty(circleLayerId, 'circle-opacity', dimmed ? 0.18 : 1.0);
    this.map.setPaintProperty(circleLayerId, 'circle-stroke-opacity', dimmed ? 0.18 : 1.0);
  }

  private setCategoryLayersVisibility(categoryName: string, visible: boolean): void {
    if (!this.map) {
      return;
    }
    const visibility = visible ? 'visible' : 'none';
    const circleLayerId = `places-circles-${categoryName}`;
    const labelLayerId = `places-labels-${categoryName}`;
    if (this.map.getLayer(circleLayerId)) {
      this.map.setLayoutProperty(circleLayerId, 'visibility', visibility);
    }
    if (this.map.getLayer(labelLayerId)) {
      this.map.setLayoutProperty(labelLayerId, 'visibility', visibility);
    }
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
    const beforeLayer = findBasemapLabelsBeforeId(this.map);

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

  private setupMarkerInteractionsForLayer(layerId: string, activityName: string): void {
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
      this.ngZone.run(() => this.setHoveredActivity(activityName));
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
      this.ngZone.run(() => this.setHoveredActivity(null));
    });

    this.map.on('click', layerId, () => {
      this.ngZone.run(() => this.selectActivity(activityName));
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
