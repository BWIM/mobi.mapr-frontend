import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject, effect, ChangeDetectorRef } from '@angular/core';
import { Subscription, firstValueFrom, debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { Map, MapDataEvent, NavigationControl, FullscreenControl, Popup, AttributionControl, LngLatLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Compare from '@maplibre/maplibre-gl-compare';
import { MapService } from '../../services/map.service';
import MinimapControl from "maplibregl-minimap";
import { SharedModule } from '../../shared/shared.module';
import { FilterConfigService } from '../../services/filter-config.service';
import { MatDialog } from '@angular/material/dialog';
import { InfoDialogComponent } from '../../shared/info-overlay/info-dialog.component';
import { LegendInfoComponent } from '../../shared/legend-info/legend-info.component';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FeatureSelectionService } from '../../shared/services/feature-selection.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SearchService } from '../../services/search.service';
import { QualityBracket, TimeBracket } from '../../services/filter-config.service';
import { SettingsService } from '../../services/settings.service';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: string[];
}

@Component({
  selector: 'app-center',
  imports: [SharedModule, TranslateModule],
  templateUrl: './center.component.html',
  styleUrl: './center.component.css',
})
export class CenterComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('compareContainer') compareContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('beforeMapContainer') beforeMapContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('afterMapContainer') afterMapContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  private map?: Map;
  private beforeMap?: Map;
  private afterMap?: Map;
  private mapCompare?: Compare;
  private savedViewport: { center: LngLatLike; zoom: number } | null = null;
  private mapModeTransitionPending = false;
  private pendingCompareMode: boolean | null = null;
  private compareMapsInitPromise: Promise<void> | null = null;
  private wasCompareMode = false;
  private mapStyleSubscription?: Subscription;
  private searchQuerySubscription?: Subscription;
  private featureSelectionSubscription?: Subscription;
  private readonly canvasPointerMoveTsByMap = new WeakMap<Map, number>();
  private readonly canvasPointerMoveListeners = new WeakMap<Map, (event: PointerEvent) => void>();
  private readonly dragOpacityHandlers = new WeakMap<Map, { start: () => void; end: () => void }>();
  private readonly tileLoadingHandlers = new WeakMap<Map, {
    dataloading: (event: MapDataEvent) => void;
    idle: () => void;
    error: () => void;
  }>();
  mapStyle: any;
  zoom: number = 7;
  center: [number, number] = [9.2156505, 49.320099];
  private filterConfigService = inject(FilterConfigService);
  private changeDetectorRef = inject(ChangeDetectorRef);
  private readonly hostElementRef = inject(ElementRef<HTMLElement>);
  readonly isMapCompareMode = this.filterConfigService.isMapCompareMode;
  private dialog = inject(MatDialog);
  private http = inject(HttpClient);
  private featureSelectionService = inject(FeatureSelectionService);
  private translate = inject(TranslateService);
  private searchService = inject(SearchService);
  private settingsService = inject(SettingsService);
  private popup?: Popup;
  private rightPopup?: Popup;
  private contextMenuPopup?: Popup;
  private contextMenuFeature: any = null;
  private hasSelectedFeature: boolean = false;
  private currentSelectedFeature: any = null;
  private readonly dragOpacityLayerProps: Array<{ layerId: string; paintProperty: string }> = [
    { layerId: 'content-layer-fill', paintProperty: 'fill-opacity' },
    { layerId: 'content-layer-outline', paintProperty: 'line-opacity' },
    { layerId: 'content-layer-highlight', paintProperty: 'line-opacity' },
    { layerId: 'content-layer-selection', paintProperty: 'line-opacity' }
  ];

  // Nominatim search properties
  searchQuery: string = '';
  searchResults: NominatimResult[] = [];
  private searchSubject = new Subject<string>();
  isGettingLocation: boolean = false;
  showLegendClickHint: boolean = true;

  constructor(private mapService: MapService) {
    effect(() => {
      const compareMode = this.filterConfigService.isMapCompareMode();
      queueMicrotask(() => {
        if (compareMode === this.wasCompareMode) {
          return;
        }
        if (!this.isActiveMapHost()) {
          return;
        }
        const previousCompareMode = this.wasCompareMode;
        this.wasCompareMode = compareMode;
        if (!previousCompareMode && !compareMode) {
          return;
        }
        void this.handleMapModeChange(compareMode);
      });
    });

    // Setup debounced search
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => this.searchNominatim(query))
    ).subscribe(results => {
      this.searchResults = results;
    });

    // Subscribe to search queries from other components (e.g., stats component)
    this.searchQuerySubscription = this.searchService.searchQuery$.subscribe(query => {
      if (query) {
        this.searchQuery = query;
        // Trigger search if query is long enough
        if (query.trim().length >= 3) {
          this.searchSubject.next(query.trim());
        }
        // Focus the search input after a short delay to ensure it's rendered
        setTimeout(() => {
          if (this.searchInput?.nativeElement) {
            this.searchInput.nativeElement.focus();
          }
        }, 100);
      }
    });
  }

  get isMapLoading() {
    return this.mapService.isMapLoading;
  }

  get selectedBewertung() {
    return this.filterConfigService.selectedBewertung;
  }

  get isQualityMode() {
    return this.selectedBewertung() === 'qualitaet';
  }


  // Quality (index) colors - A through F
  qualityColors: Array<{ letter: QualityBracket; color: string }> = [
    { letter: 'A', color: 'rgba(50, 97, 45, 0.7)' },
    { letter: 'B', color: 'rgba(60, 176, 67, 0.7)' },
    { letter: 'C', color: 'rgba(238, 210, 2, 0.7)' },
    { letter: 'D', color: 'rgba(237, 112, 20, 0.7)' },
    { letter: 'E', color: 'rgba(194, 24, 7, 0.7)' },
    { letter: 'F', color: 'rgba(197, 136, 187, 0.7)' }
  ];
  // 162, 210, 235
  // 121, 194, 230
  // 90, 135, 185
  // 74, 89, 160
  // 43, 40, 105
  // 23, 25, 63
  // Time (score) colors - updated ranges
  timeColors: Array<{ value: TimeBracket; color: string }> = [
    { value: '0-7', color: 'rgb(46, 125, 50)' },
    { value: '8-15', color: 'rgb(102, 187, 106)' },
    { value: '16-23', color: 'rgb(255, 241, 118)' },
    { value: '24-30', color: 'rgb(253,216,53)' },
    { value: '31-45', color: 'rgb(239, 83, 80)' },
    { value: '45+', color: 'rgb(183, 28, 28)' }
  ];
  private readonly timeBracketDisplayLabels: Record<TimeBracket, string> = {
    '0-7': '<=7',
    '8-15': '8-15',
    '16-23': '16-23',
    '24-30': '24-30',
    '31-45': '31-45',
    '45+': '45+'
  };

  isQualityBracketSelected(bracket: QualityBracket): boolean {
    return this.filterConfigService.isQualityBracketSelected(bracket);
  }

  isTimeBracketSelected(bracket: TimeBracket): boolean {
    return this.filterConfigService.isTimeBracketSelected(bracket);
  }

  toggleQualityBracket(event: MouseEvent, bracket: QualityBracket): void {
    event.stopPropagation();
    this.filterConfigService.toggleQualityBracket(bracket);
  }

  toggleTimeBracket(event: MouseEvent, bracket: TimeBracket): void {
    event.stopPropagation();
    this.filterConfigService.toggleTimeBracket(bracket);
  }

  getTimeBracketLabel(bracket: TimeBracket): string {
    return this.timeBracketDisplayLabels[bracket];
  }

  getIndexName(index: number): string {
    if (index <= 0) return this.translate.instant('map.popup.error');
    if (index < 0.28) return "A+";
    if (index < 0.32) return "A";
    if (index < 0.35) return "A-";
    if (index < 0.4) return "B+";
    if (index < 0.45) return "B";
    if (index < 0.5) return "B-";
    if (index < 0.56) return "C+";
    if (index < 0.63) return "C";
    if (index < 0.71) return "C-";
    if (index < 0.8) return "D+";
    if (index < 0.9) return "D";
    if (index < 1.0) return "D-";
    if (index < 1.12) return "E+";
    if (index < 1.26) return "E";
    if (index < 1.41) return "E-";
    if (index < 1.59) return "F+";
    if (index < 1.78) return "F";
    return "F-";
  }

  openLegendDialog(): void {
    this.markLegendClickHintAsSeen();
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
    const settings = this.settingsService.loadSettings();
    this.showLegendClickHint = settings?.legendClickHintShown !== true;

    // Get initial style value immediately
    this.mapStyle = await firstValueFrom(this.mapService.mapStyle$);

    // Subscribe to map style changes
    this.mapStyleSubscription = this.mapService.mapStyle$.subscribe(style => {
      this.mapStyle = style;
      if (this.map && !this.filterConfigService.isMapCompareMode()) {
        this.map.setStyle(style);
        this.map.once('style.load', () => {
          this.setupMapInteractions(this.map!);
        });
      }
    });

    // Track if a feature is currently selected and update selection border
    this.featureSelectionSubscription = this.featureSelectionService.selectedMapLibreFeature$.subscribe(feature => {
      this.hasSelectedFeature = feature !== null;
      this.currentSelectedFeature = feature;
      this.updateSelectionBorder();
    });
  }

  ngAfterViewInit() {
    if (!this.isActiveMapHost()) {
      return;
    }
    if (!this.filterConfigService.isMapCompareMode()) {
      this.initSingleMap();
    }
  }

  /** Desktop and mobile each mount app-center; only the visible instance owns the map. */
  private isActiveMapHost(): boolean {
    return this.hostElementRef.nativeElement.getClientRects().length > 0;
  }

  private async handleMapModeChange(compareMode: boolean): Promise<void> {
    if (!this.isActiveMapHost()) {
      return;
    }
    if (this.mapModeTransitionPending) {
      this.pendingCompareMode = compareMode;
      return;
    }
    this.mapModeTransitionPending = true;
    try {
      if (compareMode) {
        if (this.beforeMap) {
          return;
        }
        if (this.compareMapsInitPromise) {
          await this.compareMapsInitPromise;
          return;
        }
        this.compareMapsInitPromise = (async () => {
          this.captureViewportFromActiveMap();
          this.filterConfigService.resetMapLayerUpdateState();
          this.destroySingleMap();
          await this.waitForCompareContainers();
          await this.initCompareMaps();
        })();
        try {
          await this.compareMapsInitPromise;
        } finally {
          this.compareMapsInitPromise = null;
        }
      } else {
        if (this.map && !this.beforeMap) {
          return;
        }
        this.captureViewportFromActiveMap();
        this.destroyCompareMaps();
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        this.initSingleMap();
        this.filterConfigService.refreshMapLayers();
      }
    } finally {
      this.mapModeTransitionPending = false;
      this.filterConfigService.setMapModeTransitionInProgress(false);

      const pendingMode = this.pendingCompareMode;
      this.pendingCompareMode = null;
      if (pendingMode !== null) {
        void this.handleMapModeChange(pendingMode);
      }
    }
  }

  private captureViewportFromActiveMap(): void {
    const activeMap = this.beforeMap ?? this.map;
    if (!activeMap) {
      return;
    }
    this.savedViewport = {
      center: activeMap.getCenter(),
      zoom: activeMap.getZoom(),
    };
  }

  private getMapViewport(): { center: LngLatLike; zoom: number } {
    return this.savedViewport ?? { center: this.center, zoom: this.zoom };
  }

  private createPopup(): Popup {
    return new Popup({
      closeButton: false,
      closeOnClick: false,
      anchor: 'bottom',
      offset: [0, -5]
    });
  }

  private createBaseMapOptions(container: HTMLElement, useBaseStyleOnly = false): Record<string, unknown> {
    const viewport = this.getMapViewport();
    return {
      container,
      style: useBaseStyleOnly
        ? this.mapService.getBaseMapStyle()
        : (this.mapStyle ?? this.mapService.getBaseMapStyle()),
      center: viewport.center,
      zoom: viewport.zoom,
      maxZoom: 15,
      dragRotate: false,
      renderWorldCopies: false,
      attributionControl: false,
    };
  }

  private configureMapControls(targetMap: Map, includeMinimap: boolean): void {
    targetMap.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    targetMap.addControl(new FullscreenControl(), 'top-right');
    targetMap.dragRotate.disable();
    targetMap.touchZoomRotate.disableRotation();
    targetMap.addControl(
      new AttributionControl({ customAttribution: 'Hintergrundkarte: © OpenStreetMap, CARTO', compact: true }),
      'bottom-right'
    );

    if (includeMinimap) {
      targetMap.addControl(new MinimapControl(this.mapService.getMinimapConfig()), 'bottom-right');
    }
  }

  private expandAttributionButton(targetMap: Map): void {
    setTimeout(() => {
      const btn = targetMap
        .getContainer()
        .querySelector<HTMLButtonElement>('.maplibregl-ctrl-attrib-button');
      btn?.click();
    }, 0);
  }

  private getPopupForMap(targetMap: Map): Popup | undefined {
    if (this.afterMap && targetMap === this.afterMap) {
      return this.rightPopup;
    }
    return this.popup;
  }

  private getActiveMaps(): Map[] {
    if (this.filterConfigService.isMapCompareMode()) {
      return [this.beforeMap, this.afterMap].filter((map): map is Map => !!map);
    }
    return this.map ? [this.map] : [];
  }

  private removeCanvasPointerMoveListener(targetMap: Map): void {
    const listener = this.canvasPointerMoveListeners.get(targetMap);
    if (!listener) {
      return;
    }
    targetMap.getCanvas().removeEventListener('pointermove', listener);
    this.canvasPointerMoveListeners.delete(targetMap);
    this.canvasPointerMoveTsByMap.delete(targetMap);
  }

  private removeTileLoadingHandlers(targetMap: Map): void {
    const handlers = this.tileLoadingHandlers.get(targetMap);
    if (!handlers) {
      return;
    }
    targetMap.off('dataloading', handlers.dataloading);
    targetMap.off('idle', handlers.idle);
    targetMap.off('error', handlers.error);
    this.tileLoadingHandlers.delete(targetMap);
  }

  private initSingleMap(): void {
    if (this.map || !this.mapContainer?.nativeElement) {
      return;
    }

    this.map = new Map(this.createBaseMapOptions(this.mapContainer.nativeElement) as any);
    this.mapService.setMap(this.map);
    this.popup = this.createPopup();
    this.configureMapControls(this.map, true);

    this.map.once('load', () => {
      if (!this.map) {
        return;
      }
      this.setupMapInteractions(this.map);
      this.expandAttributionButton(this.map);
      this.mapService.setMapLoading(false);
    });
  }

  private async waitForCompareContainers(): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt++) {
      this.changeDetectorRef.detectChanges();
      if (
        this.compareContainer?.nativeElement &&
        this.beforeMapContainer?.nativeElement &&
        this.afterMapContainer?.nativeElement
      ) {
        return;
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
  }

  private async initCompareMaps(): Promise<void> {
    if (
      this.beforeMap ||
      !this.compareContainer?.nativeElement ||
      !this.beforeMapContainer?.nativeElement ||
      !this.afterMapContainer?.nativeElement
    ) {
      return;
    }

    // Register map instances synchronously so concurrent init cannot race past the guard.
    this.beforeMap = new Map(this.createBaseMapOptions(this.beforeMapContainer.nativeElement, true) as any);
    this.afterMap = new Map(this.createBaseMapOptions(this.afterMapContainer.nativeElement, true) as any);
    this.mapService.setMap(this.beforeMap);
    this.mapService.setCompareRightMap(this.afterMap);
    this.popup = this.createPopup();
    this.rightPopup = this.createPopup();
    this.configureMapControls(this.beforeMap, false);
    this.configureMapControls(this.afterMap, false);

    this.mapCompare = new Compare(
      this.beforeMap,
      this.afterMap,
      this.compareContainer.nativeElement,
      { mousemove: false }
    );

    this.beforeMap.on('style.load', () => {
      if (this.beforeMap) {
        this.setupMapInteractions(this.beforeMap);
        this.expandAttributionButton(this.beforeMap);
      }
    });

    this.afterMap.on('style.load', () => {
      if (this.afterMap) {
        this.setupMapInteractions(this.afterMap);
        this.expandAttributionButton(this.afterMap);
      }
    });

    await Promise.all([
      this.waitForMapLoad(this.beforeMap),
      this.waitForMapLoad(this.afterMap),
    ]);

    this.beforeMap.resize();
    this.afterMap.resize();
    this.filterConfigService.refreshMapLayers();
  }

  private waitForMapLoad(map: Map): Promise<void> {
    if (map.loaded()) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      map.once('load', () => resolve());
    });
  }

  private destroySingleMap(): void {
    if (!this.map) {
      return;
    }

    this.removeCanvasPointerMoveListener(this.map);
    this.removeTileLoadingHandlers(this.map);

    this.map.remove();
    this.map = undefined;
    this.mapService.setMap(null);
  }

  private destroyCompareMaps(): void {
    this.map = undefined;
    if (this.mapCompare) {
      this.mapCompare.remove();
      this.mapCompare = undefined;
    }

    if (this.beforeMap) {
      this.removeCanvasPointerMoveListener(this.beforeMap);
      this.removeTileLoadingHandlers(this.beforeMap);
      this.beforeMap.remove();
      this.beforeMap = undefined;
    }

    if (this.afterMap) {
      this.removeCanvasPointerMoveListener(this.afterMap);
      this.removeTileLoadingHandlers(this.afterMap);
      this.afterMap.remove();
      this.afterMap = undefined;
    }

    this.rightPopup = undefined;

    this.mapService.clearCompareMaps();
    this.mapService.setMap(null);
  }

  private setupMapInteractions(targetMap: Map): void {
    if (!this.filterConfigService.isMapCompareMode() || targetMap === this.beforeMap) {
      this.map = targetMap;
    }
    this.setupDragOpacityHandlers(targetMap);
    this.setupFeatureInteractions(targetMap);
    this.setupTileLoadingEvents(targetMap);
    this.updateSelectionBorder();
  }

  ngOnDestroy() {
    this.destroyCompareMaps();
    this.destroySingleMap();
    if (this.mapStyleSubscription) {
      this.mapStyleSubscription.unsubscribe();
    }
    if (this.searchQuerySubscription) {
      this.searchQuerySubscription.unsubscribe();
    }
    if (this.featureSelectionSubscription) {
      this.featureSelectionSubscription.unsubscribe();
    }
    if (this.contextMenuPopup) {
      this.contextMenuPopup.remove();
    }
    this.searchSubject.complete();
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const query = input.value.trim();
    
    if (query.length >= 3) {
      this.searchSubject.next(query);
    } else {
      this.searchResults = [];
    }
  }

  onSearchSubmit(): void {
    if (this.searchQuery.trim().length >= 3) {
      this.searchSubject.next(this.searchQuery.trim());
    }
  }

  dismissLegendClickHint(event?: Event): void {
    event?.stopPropagation();
    this.markLegendClickHintAsSeen();
  }

  private markLegendClickHintAsSeen(): void {
    if (!this.showLegendClickHint) {
      return;
    }

    this.showLegendClickHint = false;
    this.settingsService.saveSettings({ legendClickHintShown: true });
  }

  private searchNominatim(query: string): Promise<NominatimResult[]> {
    if (!query || query.length < 3) {
      return Promise.resolve([]);
    }

    const params = new HttpParams()
      .set('q', query)
      .set('format', 'json')
      .set('limit', '10')
      .set('addressdetails', '1')
      .set('countrycodes', 'de'); // Restrict results to Germany

    // Nominatim requires a User-Agent header per their usage policy
    const headers = {
      'User-Agent': 'MapR-Frontend/1.0'
    };

    return firstValueFrom(
      this.http.get<NominatimResult[]>(`https://nominatim.openstreetmap.org/search`, { params, headers })
    ).catch(error => {
      console.error('Nominatim search error:', error);
      return [];
    });
  }

  onLocationSelected(event: any): void {
    const result: NominatimResult = event.option.value;
    this.zoomToLocation(parseFloat(result.lat), parseFloat(result.lon));
    this.searchQuery = result.display_name;
    this.searchResults = [];
  }

  private zoomToLocation(lat: number, lon: number): void {
    if (!this.map) {
      return;
    }

    this.map.flyTo({
      center: [lon, lat],
      zoom: 12,
      duration: 1500
    });
  }

  /**
   * Updates the selection border on the map based on currently selected feature
   */
  private updateSelectionBorder(): void {
    const neverMatchIdFilter: any = ['==', ['get', 'id'], -1];
    const selectionFilter = !this.currentSelectedFeature
      ? neverMatchIdFilter
      : ['==', ['get', 'id'], this.currentSelectedFeature.properties.id];

    for (const targetMap of this.getActiveMaps()) {
      if (!targetMap.getLayer('content-layer-selection')) {
        continue;
      }
      targetMap.setFilter('content-layer-selection', selectionFilter);
    }
  }

  private setupFeatureInteractions(targetMap: Map): void {
    const popup = this.getPopupForMap(targetMap);
    if (!popup) {
      return;
    }

    // Note: MapLibre automatically removes all event handlers when setStyle() is called,
    // so we don't need to manually remove them here. We just add them fresh each time.

    // Track currently highlighted name to avoid unnecessary filter updates
    let currentHighlightName: string | null = null;
    let mouseleaveTimeout: any = null;
    let mousemoveHighlightTimeout: any = null;
    let pendingMousemoveHighlightName: string | null = null;

    // Prevent highlight from "following" the pointer when the user moves quickly.
    // We only update the highlight after the pointer has been stable for a moment.
    const HOVER_HIGHLIGHT_DEBOUNCE_MS = 120;

    // Track actual pointer movement on the canvas (not just MapLibre's feature hover events).
    // This is the main guard against "follow" when there are many nearby features.
    this.removeCanvasPointerMoveListener(targetMap);
    const canvas = targetMap.getCanvas();
    this.canvasPointerMoveTsByMap.set(targetMap, Date.now());
    const canvasPointerMoveListener = () => {
      this.canvasPointerMoveTsByMap.set(targetMap, Date.now());
    };
    this.canvasPointerMoveListeners.set(targetMap, canvasPointerMoveListener);
    canvas.addEventListener('pointermove', canvasPointerMoveListener, { passive: true });

    const getLastCanvasPointerMoveTs = () => this.canvasPointerMoveTsByMap.get(targetMap) ?? 0;

    // Helper function to update highlight
    const updateHighlight = (name: string | null, immediate: boolean = false) => {
      if (!targetMap.getLayer('content-layer-highlight')) {
        return;
      }
      
      // Clear any pending mouseleave timeout since we're updating the highlight
      if (mouseleaveTimeout) {
        clearTimeout(mouseleaveTimeout);
        mouseleaveTimeout = null;
      }
      
      if (name) {
        // Always update if name changed, or if immediate flag is set (for mouseenter)
        if (name !== currentHighlightName || immediate) {
          currentHighlightName = name;
          // Set filter to show all features with the same name
          // Handle both 'name' and 'NAME' properties
          targetMap.setFilter('content-layer-highlight', [
            'any',
            ['==', ['get', 'name'], name],
            ['==', ['get', 'NAME'], name]
          ]);
        }
      } else if (!name && currentHighlightName !== null) {
        if (immediate) {
          currentHighlightName = null;
          // Hide highlight layer by filtering to an impossible condition
          targetMap.setFilter('content-layer-highlight', ['==', ['get', 'name'], '__never_match__']);
        } else {
          // Delay clearing to allow mouseenter of next feature to fire first
          mouseleaveTimeout = setTimeout(() => {
            if (currentHighlightName !== null) {
              currentHighlightName = null;
              if (targetMap.getLayer('content-layer-highlight')) {
                targetMap.setFilter('content-layer-highlight', ['==', ['get', 'name'], '__never_match__']);
              }
            }
            mouseleaveTimeout = null;
          }, 50);
        }
      }
    };

    // Change cursor to pointer when hovering over features
    targetMap.on('mouseenter', 'content-layer-fill', (e) => {
      targetMap.getCanvas().style.cursor = 'pointer';

      // Cancel any pending debounced mousemove highlight update.
      if (mousemoveHighlightTimeout) {
        clearTimeout(mousemoveHighlightTimeout);
        mousemoveHighlightTimeout = null;
        pendingMousemoveHighlightName = null;
      }
      
      // Highlight all features with the same name, but only after the pointer
      // has been stable for a moment.
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const properties = feature.properties;
        const name = properties['name'] || properties['NAME'] || null;
        pendingMousemoveHighlightName = name;

        mousemoveHighlightTimeout = setTimeout(() => {
          const candidateName = pendingMousemoveHighlightName;
          mousemoveHighlightTimeout = null;
          pendingMousemoveHighlightName = null;
          if (!targetMap.getLayer('content-layer-highlight')) {
            return;
          }
          // Only commit highlight if the pointer has not moved on the canvas recently.
          if (Date.now() - getLastCanvasPointerMoveTs() < HOVER_HIGHLIGHT_DEBOUNCE_MS) {
            return;
          }
          updateHighlight(candidateName);
        }, HOVER_HIGHLIGHT_DEBOUNCE_MS);
      }
    });

    targetMap.on('mouseleave', 'content-layer-fill', () => {
      targetMap.getCanvas().style.cursor = '';

      // Cancel any pending debounced mousemove highlight update.
      if (mousemoveHighlightTimeout) {
        clearTimeout(mousemoveHighlightTimeout);
        mousemoveHighlightTimeout = null;
        pendingMousemoveHighlightName = null;
      }

      // Don't clear immediately - delay to allow smooth transitions between features
      updateHighlight(null, false);
      popup.remove();
    });

    // Show feature name and score/index on hover
    // Also update highlight on mousemove to handle transitions between features
    targetMap.on('mousemove', 'content-layer-fill', (e) => {
      if (!e.features || e.features.length === 0) {
        return;
      }

      const feature = e.features[0];
      const properties = feature.properties;
      const unnamedText = this.translate.instant('map.popup.unnamed');
      const name = properties['name'] || properties['NAME'] || unnamedText;
      
      // Update highlight when moving between features
      const actualName = properties['name'] || properties['NAME'] || null;
      pendingMousemoveHighlightName = actualName;

      // Debounce highlight updates; this prevents rapid pointer movement from constantly
      // switching the highlight filter and making it look like it "sticks to" the cursor.
      if (mousemoveHighlightTimeout) {
        clearTimeout(mousemoveHighlightTimeout);
      }
      mousemoveHighlightTimeout = setTimeout(() => {
        const candidateName = pendingMousemoveHighlightName;
        mousemoveHighlightTimeout = null;
        pendingMousemoveHighlightName = null;
        if (!targetMap.getLayer('content-layer-highlight')) {
          return;
        }
        if (Date.now() - getLastCanvasPointerMoveTs() < HOVER_HIGHLIGHT_DEBOUNCE_MS) {
          return;
        }
        updateHighlight(candidateName);
      }, HOVER_HIGHLIGHT_DEBOUNCE_MS);
      const isQualityMode = this.isQualityMode;
      
      let valueText = '';
      if (isQualityMode) {
        const index = properties['index'];
        if (index !== undefined && index !== null) {
          // Index is stored as integer (multiplied by 100), so divide by 100
          const indexValue = index / 100;
          const indexName = this.getIndexName(indexValue);
          const indexLabel = this.translate.instant('map.popup.index');
          const notAvailable = this.translate.instant('map.popup.notAvailable');
          valueText = `${indexLabel} ${indexName}`;
        } else {
          const indexLabel = this.translate.instant('map.popup.index');
          const notAvailable = this.translate.instant('map.popup.notAvailable');
          valueText = `${indexLabel} ${notAvailable}`;
        }
      } else {
        const score = properties['score'];
        if (score !== undefined && score !== null) {
          // Score is in seconds, convert to minutes
          const minutes = (score / 60).toFixed(1);
          const scoreLabel = this.translate.instant('map.popup.score');
          const minLabel = this.translate.instant('map.popup.minutes');
          valueText = `${scoreLabel} ${minutes} ${minLabel}`;
        } else {
          const scoreLabel = this.translate.instant('map.popup.score');
          const notAvailable = this.translate.instant('map.popup.notAvailable');
          valueText = `${scoreLabel} ${notAvailable}`;
        }
      }

      // Optional population display if available on the feature (but not for hexagons)
      const tileType = properties['t'];
      const isHexagon = tileType === 'h';
      const isMunicipality = tileType === 'm';
      const population = properties['population'];
      const regiostarName = properties['regiostar_name'];
      let regiostarHtml = '';
      if (isMunicipality && regiostarName !== undefined && regiostarName !== null && regiostarName !== '') {
        regiostarHtml = `<div>Regiostar: ${regiostarName}</div>`;
      }
      let populationHtml = '';
      if (!isHexagon && population !== undefined && population !== null) {
        const populationLabel = this.translate.instant('analyze.population');
        const formattedPopulation = Number(population).toLocaleString();
        populationHtml = `<div>${populationLabel}: ${formattedPopulation}</div>`;
      }

      const popupContent = `
        <div>
          <div style="font-weight: 600; margin-bottom: 4px;">${name}</div>
          <div>${valueText}</div>
          ${regiostarHtml}
          ${populationHtml}
        </div>
      `;

      popup
        .setLngLat(e.lngLat)
        .setHTML(popupContent)
        .addTo(targetMap);
    });

    // Handle feature click - log to analyze component
    targetMap.on('click', 'content-layer-fill', (e) => {
      if (!e.features || e.features.length === 0) {
        return;
      }

      // Close context menu if open
      if (this.contextMenuPopup) {
        this.contextMenuPopup.remove();
        this.contextMenuPopup = undefined;
        this.contextMenuFeature = null;
      }

      const feature = e.features[0];
      const properties = feature.properties;
      
      const unnamedText = this.translate.instant('map.popup.unnamed');
      const featureData = {
        properties: {
          name: properties['name'] || properties['NAME'] || unnamedText,
          score: properties['score'],
          index: properties['index'],
          ...properties
        },
        geometry: feature.geometry,
        id: feature.id
      };

      // Check if Ctrl key is pressed (for comparison mode)
      const isCtrlPressed = e.originalEvent && (e.originalEvent.ctrlKey || e.originalEvent.metaKey);
      
      if (isCtrlPressed) {
        // Only allow adding to comparison if a feature is already selected
        if (this.hasSelectedFeature) {
          // Set as second feature for comparison
          this.featureSelectionService.setSelectedMapLibreFeature2(featureData);
        } else {
          // If no feature is selected, treat as normal click
          this.featureSelectionService.setSelectedMapLibreFeature(featureData);
        }
      } else {
        // Set as primary feature
        this.featureSelectionService.setSelectedMapLibreFeature(featureData);
      }
    });

    // Handle right-click (context menu)
    targetMap.on('contextmenu', 'content-layer-fill', (e) => {
      if (!e.features || e.features.length === 0) {
        return;
      }

      e.preventDefault(); // Prevent default browser context menu

      // Only show context menu if a feature is already selected
      if (!this.hasSelectedFeature) {
        return;
      }

      const feature = e.features[0];
      const properties = feature.properties;
      
      const unnamedText = this.translate.instant('map.popup.unnamed');
      this.contextMenuFeature = {
        properties: {
          name: properties['name'] || properties['NAME'] || unnamedText,
          score: properties['score'],
          index: properties['index'],
          ...properties
        },
        geometry: feature.geometry,
        id: feature.id
      };

      // Create context menu popup
      const addToComparisonLabel = this.translate.instant('analyze.addToComparison');
      // Get primary color from CSS variable
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#333';
      const menuContent = `
        <div style="padding: 8px 0;">
          <button id="add-to-comparison-btn" style="
            width: 100%;
            padding: 8px 16px;
            text-align: left;
            background: none;
            border: none;
            cursor: pointer;
            color: ${primaryColor};
            font-size: 14px;
            transition: background-color 0.2s;
          " onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='transparent'">
            ${addToComparisonLabel}
          </button>
        </div>
      `;

      if (!this.contextMenuPopup) {
        this.contextMenuPopup = new Popup({
          closeButton: true,
          closeOnClick: true,
          anchor: 'top-left',
          offset: [0, -5]
        });
      }

      this.contextMenuPopup
        .setLngLat(e.lngLat)
        .setHTML(menuContent)
        .addTo(targetMap);

      // Add click handler after popup is added to DOM
      setTimeout(() => {
        const btn = document.getElementById('add-to-comparison-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            if (this.contextMenuFeature) {
              this.featureSelectionService.setSelectedMapLibreFeature2(this.contextMenuFeature);
            }
            if (this.contextMenuPopup) {
              this.contextMenuPopup.remove();
              this.contextMenuPopup = undefined;
            }
            this.contextMenuFeature = null;
          });
        }
      }, 0);
    });

    // Close context menu when clicking elsewhere
    targetMap.on('click', () => {
      if (this.contextMenuPopup) {
        this.contextMenuPopup.remove();
        this.contextMenuPopup = undefined;
        this.contextMenuFeature = null;
      }
    });
  }

  /**
   * Sets up event listeners to track tile loading state
   */
  private setupTileLoadingEvents(targetMap?: Map): void {
    const map = targetMap ?? this.map;
    if (!map) {
      return;
    }

    this.removeTileLoadingHandlers(map);

    const dataloading = (e: MapDataEvent) => {
      if (e?.dataType === 'tile') {
        const style = map.getStyle();
        if (style?.sources && 'content-layer' in style.sources) {
          this.mapService.setMapLoading(true);
        }
      }
    };
    const idle = () => {
      if (this.mapService.isMapLoading()) {
        this.mapService.setMapLoading(false);
      }
    };
    const error = () => {
      this.mapService.setMapLoading(false);
    };

    map.on('dataloading', dataloading);
    map.on('idle', idle);
    map.on('error', error);
    this.tileLoadingHandlers.set(map, { dataloading, idle, error });
  }

  private setupDragOpacityHandlers(targetMap: Map): void {
    const existing = this.dragOpacityHandlers.get(targetMap);
    if (existing) {
      targetMap.off('dragstart', existing.start);
      targetMap.off('dragend', existing.end);
    }

    let isDragOpacityDimmed = false;
    const startHandler = () => {
      if (isDragOpacityDimmed) {
        return;
      }
      this.scaleFeatureLayerOpacity(targetMap, 0.2);
      isDragOpacityDimmed = true;
    };
    const endHandler = () => {
      if (!isDragOpacityDimmed) {
        return;
      }
      this.scaleFeatureLayerOpacity(targetMap, 5);
      isDragOpacityDimmed = false;
    };

    targetMap.on('dragstart', startHandler);
    targetMap.on('dragend', endHandler);
    this.dragOpacityHandlers.set(targetMap, { start: startHandler, end: endHandler });
  }

  private scaleFeatureLayerOpacity(targetMap: Map, factor: number): void {
    for (const layer of this.dragOpacityLayerProps) {
      if (!targetMap.getLayer(layer.layerId)) {
        continue;
      }
      const currentOpacity = targetMap.getPaintProperty(layer.layerId, layer.paintProperty);
      if (currentOpacity === undefined || currentOpacity === null) {
        continue;
      }
      targetMap.setPaintProperty(layer.layerId, layer.paintProperty, ['*', currentOpacity as any, factor]);
    }
  }
}
