import { Component, Inject, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject, NgZone } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { SharedModule } from '../../../../shared/shared.module';
import { CommonModule } from '@angular/common';
import { Map as MapLibreMap, NavigationControl, FullscreenControl, Popup, GeoJSONSource } from 'maplibre-gl';
import { PlacesService, Place } from '../../../../services/places.service';
import { MapService } from '../../../../services/map.service';
import { findBasemapLabelsBeforeId } from '../../../../services/basemap-style';
import { firstValueFrom, catchError, of } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { InfoDialogComponent } from '../../../../shared/info-overlay/info-dialog.component';
import { LegendInfoComponent } from '../../../../shared/legend-info/legend-info.component';
import { ScoreColorsService } from '../../../../services/score-colors.service';
import { CompositionNode } from '../../../../interfaces/composition';
import {
  CategoryCompositionPanelComponent,
  CompositionActivityMeta,
} from '../../../../shared/category-composition-panel/category-composition-panel.component';

export interface PlacesDialogData {
  featureType: 'municipality' | 'hexagon' | 'county' | 'state';
  featureId: number;
  profileIds: number[];
  categoryIds?: number[];
  categoryNames: string;
  personaId?: number;
  isScoreMode: boolean;
  /** Overall category score (seconds) from analyze — for composition panel. */
  categoryScore?: number;
  /** Overall category quality index from analyze — for composition panel. */
  categoryIndex?: number;
}

@Component({
  selector: 'app-places-dialog',
  standalone: true,
  imports: [
    SharedModule,
    CommonModule,
    TranslateModule,
    CategoryCompositionPanelComponent,
  ],
  templateUrl: './places-dialog.component.html',
  styleUrl: './places-dialog.component.css'
})
export class PlacesDialogComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mapContainerPlaces') mapContainerPlaces?: ElementRef;
  
  isLoading: boolean = false;
  error: string | null = null;
  categoryName: string = '';
  composition: CompositionNode | null = null;
  compositionActivityMeta: Record<number, CompositionActivityMeta> = {};
  overallMetricLabel: string | null = null;
  overallMetricColor: string | null = null;
  /** Activity display name highlighted via map↔panel hover or sticky click. */
  highlightedActivityName: string | null = null;
  /** Sticky selection from click; hover temporarily overrides display. */
  private pinnedActivityName: string | null = null;
  private hoveredActivityName: string | null = null;
  private map?: MapLibreMap;
  private translate = inject(TranslateService);
  private dialog = inject(MatDialog);
  private ngZone = inject(NgZone);
  private popup?: Popup;
  private places: Place[] = [];
  private categoryData: Array<{ name: string; weight: number; score: number; index: number; places: Place[]; activity_id?: number }> = [];
  private categoryColors = new Map<string, string>();
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
  categoryLegendExpanded = true;
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

  private placesService = inject(PlacesService);
  private mapService = inject(MapService);
  private scoreColorsService = inject(ScoreColorsService);

  readonly timeLegendItems = this.scoreColorsService.legendItems;
  readonly hasScoreColors = this.scoreColorsService.hasConfig;

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
    this.categoryLegendExpanded = true;
    this.error = null;
    this.categoryName = this.translate.instant('analyze.placesDialog.title');
    this.setOverallMetricFromDialogData();

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
            profile_ids: this.data.profileIds,
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
      this.composition = placesResponse.composition ?? null;
      
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
            activity_id: cat.activity_id,
            places: cat.places.filter(p => p.lat !== 0 && p.lon !== 0 && !isNaN(p.lat) && !isNaN(p.lon))
          }))
          .sort((a, b) => b.weight - a.weight); // Sort by weight descending, but keep all
      }

      this.compositionActivityMeta = {};
      for (const cat of this.categoryData) {
        if (cat.activity_id != null) {
          this.compositionActivityMeta[cat.activity_id] = {
            score: cat.score,
            index: cat.index,
            role_hint: placesResponse.categories.find(
              (c) => c.activity_id === cat.activity_id
            )?.role_hint,
          };
        }
      }
      
      // Assign colors to categories
      this.assignCategoryColors();
      this.syncCompositionActivityMeta();
      this.setOverallMetricFromBackend();

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

    const totalWeight = this.categoryData.reduce((sum, cat) => sum + cat.weight, 0);

    this.categoryData.forEach((category, index) => {
      if (category.name && !this.categoryColors.has(category.name)) {
        const fillColor = this.getMarkerFillColor(category.score, category.index);
        this.categoryColors.set(category.name, fillColor);
        const relevance = totalWeight > 0 ? (category.weight / totalWeight) * 100 : 0;

        this.categoryLegendItems.push({
          name: category.name,
          color: fillColor,
          weight: category.weight,
          relevance,
          enabled: this.composition ? true : index < 3,
          score: category.score,
          index: category.index,
          activity_id: category.activity_id,
        });
      }
    });
  }

  /** Enrich composition meta with legend colors / metrics for the side panel. */
  private syncCompositionActivityMeta(): void {
    const totalWeight = this.categoryData.reduce((sum, cat) => sum + cat.weight, 0);
    const next: Record<number, CompositionActivityMeta> = {};
    for (const cat of this.categoryData) {
      if (cat.activity_id == null) {
        continue;
      }
      const legend = this.categoryLegendItems.find((item) => item.name === cat.name);
      const prev = this.compositionActivityMeta[cat.activity_id] || {};
      next[cat.activity_id] = {
        ...prev,
        name: cat.name,
        color: legend?.color || this.categoryColors.get(cat.name),
        weight: cat.weight,
        relevance: totalWeight > 0 ? (cat.weight / totalWeight) * 100 : 0,
        enabled: legend?.enabled ?? true,
        score: cat.score,
        index: cat.index,
        metricLabel: this.formatPlacesMetric(cat.score, cat.index),
        metricColor: this.getPlacesMetricTextColor(cat.score, cat.index),
      };
    }
    this.compositionActivityMeta = next;
  }

  private getMarkerFillColor(score: number, index: number): string {
    return this.getPlacesIsScoreMode()
      ? this.getScoreColor(score)
      : this.getIndexColor(index);
  }

  private buildCategoryGeoJson(
    category: { name: string; places: Place[]; activity_id?: number; score: number; index: number }
  ) {
    return {
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
          category_name: place.category_name || this.translate.instant('map.popup.notAvailable'),
          url: place['url'] || null,
          score: category.score,
          index: category.index,
        },
      })),
    };
  }

  private circleRadiusExpression(highlighted: boolean): unknown[] {
    if (highlighted) {
      return [
        'interpolate',
        ['linear'],
        ['zoom'],
        5, 10,
        10, 15,
        14, 20,
      ];
    }
    return [
      'interpolate',
      ['linear'],
      ['zoom'],
      5, 6,
      10, 9,
      14, 12,
    ];
  }

  private ensureCategoryLayers(
    category: { name: string; places: Place[]; activity_id?: number; score: number; index: number }
  ): void {
    if (!this.map) {
      return;
    }
    const sourceId = `places-${category.name}`;
    const circleLayerId = `places-circles-${category.name}`;
    const beforeLayer = findBasemapLabelsBeforeId(this.map);
    const geoJsonData = this.buildCategoryGeoJson(category);
    const fillColor = this.getMarkerFillColor(category.score, category.index);
    const isHighlighted = this.highlightedActivityName === category.name;

    // Remove legacy number label layers if present
    const labelLayerId = `places-labels-${category.name}`;
    if (this.map.getLayer(labelLayerId)) {
      this.map.removeLayer(labelLayerId);
    }

    if (this.map.getSource(sourceId)) {
      (this.map.getSource(sourceId) as GeoJSONSource).setData(geoJsonData);
    } else {
      this.map.addSource(sourceId, {
        type: 'geojson',
        data: geoJsonData,
      });
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
        beforeLayer
      );
      this.setupMarkerInteractionsForLayer(circleLayerId, category.name);
      this.setupMarkerClickHandlerForLayer(circleLayerId);
    } else {
      this.map.setPaintProperty(circleLayerId, 'circle-color', fillColor);
      this.map.setLayoutProperty(circleLayerId, 'visibility', 'visible');
      this.applyHighlightStyleToLayer(category.name, isHighlighted);
    }
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

  onPanelActivityHover(activityName: string | null): void {
    this.hoveredActivityName = activityName;
    this.applyEffectiveHighlight();
  }

  /** Click pins (or unpins) an activity highlight — does not hide map layers. */
  onPanelActivitySelect(activityName: string): void {
    this.pinnedActivityName =
      this.pinnedActivityName === activityName ? null : activityName;
    this.applyEffectiveHighlight();
  }

  private applyEffectiveHighlight(): void {
    const next = this.hoveredActivityName ?? this.pinnedActivityName;
    this.setHighlightedActivity(next);
  }

  private setHighlightedActivity(activityName: string | null): void {
    if (this.highlightedActivityName === activityName) {
      return;
    }
    this.highlightedActivityName = activityName;
    this.applyMarkerHighlightStyles();
  }

  private applyMarkerHighlightStyles(): void {
    if (!this.map) {
      return;
    }
    for (const cat of this.categoryData) {
      const legend = this.categoryLegendItems.find((item) => item.name === cat.name);
      if (legend && !legend.enabled) {
        continue;
      }
      const isHighlighted =
        this.highlightedActivityName != null && this.highlightedActivityName === cat.name;
      const isDimmed =
        this.highlightedActivityName != null && this.highlightedActivityName !== cat.name;
      this.applyHighlightStyleToLayer(cat.name, isHighlighted, isDimmed);
    }
  }

  private applyHighlightStyleToLayer(
    categoryName: string,
    highlighted: boolean,
    dimmed = false
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
      this.circleRadiusExpression(highlighted) as any
    );
    this.map.setPaintProperty(
      circleLayerId,
      'circle-stroke-width',
      highlighted ? 2.5 : 1.5
    );
    this.map.setPaintProperty(
      circleLayerId,
      'circle-stroke-color',
      highlighted ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.55)'
    );
    this.map.setPaintProperty(
      circleLayerId,
      'circle-opacity',
      dimmed ? 0.18 : 1.0
    );
    this.map.setPaintProperty(
      circleLayerId,
      'circle-stroke-opacity',
      dimmed ? 0.18 : 1.0
    );
  }

  /** Overall from analyze category score passed into the dialog (backend). */
  private setOverallMetricFromDialogData(): void {
    const score = this.data.categoryScore;
    const index = this.data.categoryIndex;
    if (score == null && index == null) {
      this.overallMetricLabel = null;
      this.overallMetricColor = null;
      return;
    }
    const safeScore = Number(score ?? 0);
    const safeIndex = Number(index ?? 0);
    this.overallMetricLabel = this.formatPlacesMetric(safeScore, safeIndex);
    this.overallMetricColor = this.getPlacesMetricTextColor(safeScore, safeIndex);
  }

  /** Prefer composition.activityScore from places API when present. */
  private setOverallMetricFromBackend(): void {
    const metrics = this.composition?.activityScore;
    if (metrics) {
      this.overallMetricLabel = this.formatPlacesMetric(metrics.score, metrics.index);
      this.overallMetricColor = this.getPlacesMetricTextColor(metrics.score, metrics.index);
      return;
    }
    this.setOverallMetricFromDialogData();
  }

  private formatPlacesMetric(score: number, index: number): string {
    if (this.getPlacesIsScoreMode()) {
      const minutes = (score / 60).toFixed(1);
      return `${minutes} ${this.translate.instant('map.popup.minutes')}`;
    }
    return this.getGradeFromIndex(index);
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
    return !!this.data.isScoreMode;
  }

  private getScoreColor(score: number): string {
    return this.scoreColorsService.getColorForScore(score);
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

    this.categoryData.forEach((category, index) => {
      const legendItem = this.categoryLegendItems.find(item => item.name === category.name);
      const isEnabled = legendItem?.enabled ?? (index < 3);
      if (!isEnabled) {
        return;
      }
      try {
        this.ensureCategoryLayers(category);
      } catch (error) {
        console.error(`Error adding layer for ${category.name}:`, error);
      }
    });
  }

  toggleCategoryLegendExpanded(): void {
    this.categoryLegendExpanded = !this.categoryLegendExpanded;
  }

  private setupMarkerInteractionsForLayer(layerId: string, activityName: string): void {
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

      this.ngZone.run(() => {
        this.hoveredActivityName = activityName;
        this.applyEffectiveHighlight();
      });
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

      this.ngZone.run(() => {
        this.hoveredActivityName = null;
        this.applyEffectiveHighlight();
      });
    });

    // Click pins the activity (same sticky highlight as panel click).
    this.map.on('click', layerId, () => {
      this.ngZone.run(() => this.onPanelActivitySelect(activityName));
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
        const beforeLayer = findBasemapLabelsBeforeId(this.map);
        
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
