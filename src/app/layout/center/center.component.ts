import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, inject } from '@angular/core';
import { Subscription, firstValueFrom, debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { Map, NavigationControl, FullscreenControl, Popup, AttributionControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
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
import { BottomComponent } from '../bottom/bottom.component';
import { QualityBracket, TimeBracket } from '../../services/filter-config.service';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: string[];
}

@Component({
  selector: 'app-center',
  imports: [SharedModule, TranslateModule, BottomComponent],
  templateUrl: './center.component.html',
  styleUrl: './center.component.css',
})
export class CenterComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mapContainer') mapContainer?: ElementRef;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  private map?: Map;
  private mapStyleSubscription?: Subscription;
  private searchQuerySubscription?: Subscription;
  private featureSelectionSubscription?: Subscription;
  private lastCanvasPointerMoveTs: number = 0;
  private canvasPointerMoveListener?: (event: PointerEvent) => void;
  mapStyle: any;
  zoom: number = 7;
  center: [number, number] = [9.2156505, 49.320099];
  private filterConfigService = inject(FilterConfigService);
  private dialog = inject(MatDialog);
  private http = inject(HttpClient);
  private featureSelectionService = inject(FeatureSelectionService);
  private translate = inject(TranslateService);
  private searchService = inject(SearchService);
  private popup?: Popup;
  private contextMenuPopup?: Popup;
  private contextMenuFeature: any = null;
  private hasSelectedFeature: boolean = false;
  private currentSelectedFeature: any = null;

  // Nominatim search properties
  searchQuery: string = '';
  searchResults: NominatimResult[] = [];
  private searchSubject = new Subject<string>();
  isGettingLocation: boolean = false;

  constructor(private mapService: MapService) {
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
    { value: '0-7', color: 'rgb(23, 25, 63)' },
    { value: '8-15', color: 'rgb(43, 40, 105)' },
    { value: '16-23', color: 'rgb(74, 89, 160)' },
    { value: '24-30', color: 'rgb(90, 135, 185)' },
    { value: '31-45', color: 'rgb(121, 194, 230)' },
    { value: '45+', color: 'rgb(162, 210, 235)' }
  ];

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
    // Get initial style value immediately
    this.mapStyle = await firstValueFrom(this.mapService.mapStyle$);

    // Subscribe to map style changes
    this.mapStyleSubscription = this.mapService.mapStyle$.subscribe(style => {
      this.mapStyle = style;
      if (this.map) {
        this.map.setStyle(style);
        // Re-setup event handlers after style change (MapLibre removes them when style changes)
        this.map.once('style.load', () => {
          this.setupFeatureInteractions();
          this.setupTileLoadingEvents();
          // Re-apply selection border if a feature is selected
          this.updateSelectionBorder();
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
    if (this.mapContainer) {
      const mapOptions: any = {
        container: this.mapContainer.nativeElement,
        style: this.mapStyle,
        center: this.center,
        zoom: this.zoom,
        maxZoom: 15,
        dragRotate: false,
        renderWorldCopies: false,
        attributionControl: false
      };

      this.map = new Map(mapOptions);
      this.mapService.setMap(this.map);

      // Initialize popup for hover tooltips
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

      // Wait for map to load before adding minimap and setting up event handlers
      this.map.once('load', () => {
        if (this.map) {
          this.map.addControl(new MinimapControl(this.mapService.getMinimapConfig()), 'bottom-right');
          this.setupFeatureInteractions();
          this.setupTileLoadingEvents();
          this.map.addControl(new AttributionControl({customAttribution:'Hintergrundkarte: © OpenStreetMap, CARTO', compact: true}), 'bottom-right');
          // Re-apply selection border if a feature is selected
          this.updateSelectionBorder();

          setTimeout(() => {
            const btn = this.map!
              .getContainer()
              .querySelector<HTMLButtonElement>('.maplibregl-ctrl-attrib-button');
            btn?.click();
          }, 0);
      
          // Initial map load is complete
          this.mapService.setMapLoading(false);
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.map) {
      const canvas = this.map.getCanvas();
      if (canvas && this.canvasPointerMoveListener) {
        canvas.removeEventListener('pointermove', this.canvasPointerMoveListener);
        this.canvasPointerMoveListener = undefined;
      }
      this.map.remove();
    }
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
    if (!this.map || !this.map.getLayer('content-layer-selection')) {
      return;
    }

    // Hide filter used when nothing is selected (or fallback fails).
    // Using a non-matching `properties.id` value keeps the selection border invisible.
    const neverMatchIdFilter: any = ['==', ['get', 'id'], -1];

    if (!this.currentSelectedFeature) {
      this.map.setFilter('content-layer-selection', neverMatchIdFilter);
      return;
    }

    // Always select by unique feature id (fixes "same-name" hexagon highlighting).
    const selectedId = this.currentSelectedFeature.properties.id;
    this.map.setFilter('content-layer-selection', ['==', ['get', 'id'], selectedId]);
  }

  private setupFeatureInteractions(): void {
    if (!this.map || !this.popup) {
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
    const canvas = this.map.getCanvas();
    if (this.canvasPointerMoveListener) {
      canvas.removeEventListener('pointermove', this.canvasPointerMoveListener);
    }
    this.lastCanvasPointerMoveTs = Date.now();
    this.canvasPointerMoveListener = () => {
      this.lastCanvasPointerMoveTs = Date.now();
    };
    canvas.addEventListener('pointermove', this.canvasPointerMoveListener, { passive: true });

    // Helper function to update highlight
    const updateHighlight = (name: string | null, immediate: boolean = false) => {
      if (!this.map || !this.map.getLayer('content-layer-highlight')) {
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
          this.map.setFilter('content-layer-highlight', [
            'any',
            ['==', ['get', 'name'], name],
            ['==', ['get', 'NAME'], name]
          ]);
        }
      } else if (!name && currentHighlightName !== null) {
        if (immediate) {
          currentHighlightName = null;
          // Hide highlight layer by filtering to an impossible condition
          this.map.setFilter('content-layer-highlight', ['==', ['get', 'name'], '__never_match__']);
        } else {
          // Delay clearing to allow mouseenter of next feature to fire first
          mouseleaveTimeout = setTimeout(() => {
            if (currentHighlightName !== null) {
              currentHighlightName = null;
              if (this.map && this.map.getLayer('content-layer-highlight')) {
                this.map.setFilter('content-layer-highlight', ['==', ['get', 'name'], '__never_match__']);
              }
            }
            mouseleaveTimeout = null;
          }, 50);
        }
      }
    };

    // Change cursor to pointer when hovering over features
    this.map.on('mouseenter', 'content-layer-fill', (e) => {
      if (this.map) {
        this.map.getCanvas().style.cursor = 'pointer';

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
            if (!this.map || !this.map.getLayer('content-layer-highlight')) {
              return;
            }
            // Only commit highlight if the pointer has not moved on the canvas recently.
            if (Date.now() - this.lastCanvasPointerMoveTs < HOVER_HIGHLIGHT_DEBOUNCE_MS) {
              return;
            }
            updateHighlight(candidateName);
          }, HOVER_HIGHLIGHT_DEBOUNCE_MS);
        }
      }
    });

    this.map.on('mouseleave', 'content-layer-fill', () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = '';

        // Cancel any pending debounced mousemove highlight update.
        if (mousemoveHighlightTimeout) {
          clearTimeout(mousemoveHighlightTimeout);
          mousemoveHighlightTimeout = null;
          pendingMousemoveHighlightName = null;
        }

        // Don't clear immediately - delay to allow smooth transitions between features
        updateHighlight(null, false);
      }
      if (this.popup) {
        this.popup.remove();
      }
    });

    // Show feature name and score/index on hover
    // Also update highlight on mousemove to handle transitions between features
    this.map.on('mousemove', 'content-layer-fill', (e) => {
      if (!this.map || !this.popup || !e.features || e.features.length === 0) {
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
        if (!this.map || !this.map.getLayer('content-layer-highlight')) {
          return;
        }
        if (Date.now() - this.lastCanvasPointerMoveTs < HOVER_HIGHLIGHT_DEBOUNCE_MS) {
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

      this.popup
        .setLngLat(e.lngLat)
        .setHTML(popupContent)
        .addTo(this.map);
    });

    // Handle feature click - log to analyze component
    this.map.on('click', 'content-layer-fill', (e) => {
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
    this.map.on('contextmenu', 'content-layer-fill', (e) => {
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
        .addTo(this.map!);

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
    this.map.on('click', () => {
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
  private setupTileLoadingEvents(): void {
    if (!this.map) {
      return;
    }

    // Track when tiles start loading - show loading immediately when request starts
    // This handles both initial load and subsequent tile loads (pan/zoom)
    this.map.on('dataloading', (e) => {
      if (e?.dataType === 'tile') {
        // Check if content-layer source exists (meaning we care about these tiles)
        const style = this.map?.getStyle();
        if (style?.sources && 'content-layer' in style.sources) {
          // Start loading immediately when tile request begins
          this.mapService.setMapLoading(true);
        }
      }
    });

    // Track when tiles finish loading and are rendered
    // idle fires when all tiles are loaded AND rendered (map is idle)
    this.map.on('idle', () => {
      // Only hide loading indicator if we're actually loading
      // This prevents flickering when map is idle but not loading
      if (this.mapService.isMapLoading()) {
        // Stop loading when map is idle (all tiles loaded and rendered)
        this.mapService.setMapLoading(false);
      }
    });

    // Handle errors - stop loading indicator
    this.map.on('error', () => {
      this.mapService.setMapLoading(false);
    });
  }
}
