import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Subscription, firstValueFrom } from 'rxjs';
import { LoadingService } from '../services/loading.service';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';
import { StyleSpecification, SourceSpecification, LayerSpecification, Map, LngLatBounds } from 'maplibre-gl';
import { AnalyzeService } from '../analyze/analyze.service';
import { KeyboardShortcutsService, ShortcutAction } from './keyboard-shortcuts.service';
import * as maplibregl from 'maplibre-gl';
import { Project } from '../projects/project.interface';

interface Bounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

@Injectable({
  providedIn: 'root'
})
export class MapV2Service {
  projectName: string | null = null;
  currentProject: string | null = null;
  currentProjectData: Project | null = null;
  private currentZoom: number = 7;
  private mapStyleSubject = new BehaviorSubject<StyleSpecification>(this.getBaseMapStyle());
  mapStyle$ = this.mapStyleSubject.asObservable();
  private projectDataSubject = new BehaviorSubject<Project | null>(null);
  getCurrentProjectData$ = this.projectDataSubject.asObservable();
  averageType: 'avg' | 'pop' = 'pop';
  private boundsSubject = new BehaviorSubject<Bounds | null>(null);
  bounds$ = this.boundsSubject.asObservable();
  private map: Map | null = null;
  private shareKey: string | null = null;
  private shortcutSubscription: Subscription;
  private hexagonView: boolean = false;
  private gemeindeView: boolean = false;
  private landkreisView: boolean = false;
  private selectedFeatureId: string | null = null;
  private scoreShown: boolean = false;
  private temporaryFeatures: any[] = [];
  private lastZoomTime: number = 0;
  private readonly ZOOM_COOLDOWN = 3000; // 5 seconds in milliseconds
  private projectVersion: number = 0;
  private mapType: 'hexagon' | 'county' | 'municipality' | 'state' = 'hexagon';
  comparisonProject: Project | null = null;
  private comparisonSubject = new BehaviorSubject<boolean>(false);
  comparison$ = this.comparisonSubject.asObservable();
  private stopComparisonSubject = new BehaviorSubject<boolean>(false);
  stopComparison$ = this.stopComparisonSubject.asObservable();

  private styleUpdateThrottle: any = null;
  private lastStyleUpdate: number = 0;
  private readonly STYLE_UPDATE_COOLDOWN = 100; // ms

  constructor(
    private loadingService: LoadingService,
    private http: HttpClient,
    private authService: AuthService,
    private analyzeService: AnalyzeService,
    private keyboardShortcutsService: KeyboardShortcutsService
  ) {
    this.shortcutSubscription = this.keyboardShortcutsService.getShortcutStream().subscribe(action => {
      if (!this.map) return;

      switch (action) {
        case ShortcutAction.ZOOM_TO_FEATURES:
          // zoom to the bounds
          this.zoomToFeatures();
          break;
        case ShortcutAction.TOGGLE_HEXAGON_VIEW:
          this.hexagonView = !this.hexagonView;
          this.analyzeService.setHexagonView(this.hexagonView);
          this.mapStyleSubject.next(this.getProjectMapStyle(this.currentProject!));
          break;
        case ShortcutAction.TOGGLE_GEMEINDE_VIEW:
          this.gemeindeView = !this.gemeindeView;
          this.analyzeService.setMapType('municipality');
          this.mapType = 'municipality';
          this.mapStyleSubject.next(this.getProjectMapStyle(this.currentProject!));
          break;
        case ShortcutAction.TOGGLE_LANDKREIS_VIEW:
          this.landkreisView = !this.landkreisView;
          this.analyzeService.setMapType('county');
          this.mapType = 'county';
          this.mapStyleSubject.next(this.getProjectMapStyle(this.currentProject!));
          break;
        case ShortcutAction.TOGGLE_SCORE_DISPLAY:
          this.toggleScoreDisplay();
          break;
      }
    });
  }

  setMap(map: Map): void {
    this.map = map;
  }

  private throttledStyleUpdate(style: StyleSpecification): void {
    const now = Date.now();

    // Clear any existing throttle timeout
    if (this.styleUpdateThrottle) {
      clearTimeout(this.styleUpdateThrottle);
    }

    // If enough time has passed since last update, update immediately
    if (now - this.lastStyleUpdate >= this.STYLE_UPDATE_COOLDOWN) {
      this.mapStyleSubject.next(style);
      this.lastStyleUpdate = now;
    } else {
      // Otherwise, throttle the update
      this.styleUpdateThrottle = setTimeout(() => {
        this.mapStyleSubject.next(style);
        this.lastStyleUpdate = Date.now();
      }, this.STYLE_UPDATE_COOLDOWN - (now - this.lastStyleUpdate));
    }
  }

  zoomToFeatures(): void {
    const bounds = this.boundsSubject.getValue();
    if (bounds && this.map) {
      const mapBounds = new LngLatBounds(
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat]
      );
      this.map.fitBounds(mapBounds, {
        padding: 50,
        duration: 2000
      });
    }
  }

  getMap(): Map | null {
    return this.map;
  }

  getZoom(): number {
    return this.currentZoom;
  }

  getCenter(): [number, number] {
    return this.map?.getCenter() as unknown as [number, number];
  }

  getCurrentProject(): string | null {
    return this.currentProject;
  }

  setProjectData(project: Project): void {
    this.currentProjectData = project;
    this.projectDataSubject.next(project);
  }

  getCurrentProjectData(): Project | null {
    return this.currentProjectData;
  }

  getMapType(): 'hexagon' | 'county' | 'municipality' | 'state' {
    return this.mapType;
  }

  getShareKey(): string | null {
    return this.shareKey;
  }

  getProjectVersion(): number {
    return this.projectVersion;
  }

  setProjectVersion(version: number): void {
    this.projectVersion = version;
  }

  getMainLayer(): any {
    if (!this.map) return null;
    return this.map.getLayer('geodata-fill');
  }

  getBaseMapStyle(): StyleSpecification {
    const style: StyleSpecification = {
      version: 8,
      sources: {
        'carto-light': {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'],
          tileSize: 256,
        } as SourceSpecification,
        'carto-labels': {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'],
          tileSize: 256,
        } as SourceSpecification,
        'temporary-geojson': {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        } as SourceSpecification
      },
      layers: [
        {
          id: 'carto-light-layer',
          type: 'raster',
          source: 'carto-light',
          minzoom: 0,
          maxzoom: 19
        } as LayerSpecification,
        {
          id: 'temporary-features',
          type: 'fill',
          source: 'temporary-geojson',
          paint: {
            'fill-color': [
              'case',
              ['<=', ['get', 'index'], 0],
              'rgba(128, 128, 128, 0)',
              ['<=', ['get', 'index'], 0.35],
              'rgba(50, 97, 45, 0.7)',
              ['<=', ['get', 'index'], 0.5],
              'rgba(60, 176, 67, 0.7)',
              ['<=', ['get', 'index'], 0.71],
              'rgba(238, 210, 2, 0.7)',
              ['<=', ['get', 'index'], 1],
              'rgba(237, 112, 20, 0.7)',
              ['<=', ['get', 'index'], 1.41],
              'rgba(194, 24, 7, 0.7)',
              'rgba(150, 86, 162, 0.7)'
            ],
            'fill-opacity': [
              'interpolate',
              ['cubic-bezier', 0.26, 0.38, 0.82, 0.36],
              ['get', 'population_density'],
              0, 0.2,
              100, 0.5,
              1000, 0.8,
              5000, 0.9
            ],

            'fill-outline-color': [
              'case',
              ['<=', ['get', 'index'], 0],
              'rgba(128, 128, 128, 0)',
              ['<=', ['get', 'index'], 0.35],
              'rgba(50, 97, 45, 0.7)',
              ['<=', ['get', 'index'], 0.5],
              'rgba(60, 176, 67, 0.7)',
              ['<=', ['get', 'index'], 0.71],
              'rgba(238, 210, 2, 0.7)',
              ['<=', ['get', 'index'], 1],
              'rgba(237, 112, 20, 0.7)',
              ['<=', ['get', 'index'], 1.41],
              'rgba(194, 24, 7, 0.7)',
              'rgba(150, 86, 162, 0.7)'
            ],
          },
          layout: {
            visibility: 'visible'
          }
        } as LayerSpecification,
        {
          id: 'carto-labels-layer',
          type: 'raster',
          source: 'carto-labels',
          minzoom: 0,
          maxzoom: 19
        } as LayerSpecification
      ],
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
    };
    return style;
  }

  resetMap(): void {
    this.map = null;
    this.shareKey = null;
    this.currentProject = null;
    this.currentProjectData = null;
    this.projectDataSubject.next(null);
    this.mapStyleSubject.next(this.getBaseMapStyle());
    this.removeSingleFeatures();
  }

  setProject(projectId: string, shareKey?: string, projectName?: string): void {
    this.currentProject = projectId;
    this.projectName = projectName || null;
    this.shareKey = shareKey || null;
    this.loadingService.startLoading();

    // Clear any temporary features when loading a project
    this.removeSingleFeatures();

    const token = this.authService.getAuthorizationHeaders().get('Authorization')?.split(' ')[1];
    let authParam = '';
    if (this.shareKey) {
      authParam = `&key=${this.shareKey}`;
    } else if (token) {
      authParam = `&token=${token}`;
    }

    this.http.get<Bounds>(`${environment.apiUrl}/tiles/bounds/?project=${projectId}${authParam}`).subscribe(
      bounds => {
        this.boundsSubject.next(bounds);
        const updatedStyle = this.getProjectMapStyle(projectId);
        this.mapStyleSubject.next(updatedStyle);
      },
      error => {
        console.error('Error fetching bounds:', error);
        this.loadingService.stopLoading();
      }
    );
    this.loadingService.stopLoading();
  }

  getDataBounds(): Bounds | null {
    return this.boundsSubject.getValue();
  }

  zoomToBounds(): Promise<void> {
    const bounds = this.boundsSubject.getValue();
    if (bounds && this.map) {
      const mapBounds = new LngLatBounds(
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat]
      );
      this.map.fitBounds(mapBounds, {
        padding: 50
      });
    }
    return Promise.resolve();
  }

  setAverageType(averageType: 'avg' | 'pop'): void {
    this.averageType = averageType;
    if (this.currentProject) {
      const updatedStyle = this.getProjectMapStyle(this.currentProject);
      this.throttledStyleUpdate(updatedStyle);
    }
  }

  updateZoom(zoom: number): void {
    this.currentZoom = zoom;
    if (this.currentProject) {
      const updatedStyle = this.getProjectMapStyle(this.currentProject);
      this.throttledStyleUpdate(updatedStyle);
    }
  }

  private getTileUrl(projectID: string): string {
    if (!projectID) return '';

    const token = this.authService.getAuthorizationHeaders().get('Authorization')?.split(' ')[1];
    let authParam = '';
    if (this.shareKey) {
      authParam = `&key=${this.shareKey}`;
    } else if (token) {
      authParam = `&token=${token}`;
    }

    // If hexagon view is enabled, always use the smallest hexagon layer
    if (!this.shareKey) {  // only allow for logged in users
      if (this.hexagonView) {
        this.analyzeService.setMapType('hexagon');
        this.mapType = 'hexagon';
        return `${environment.apiUrl}/tiles/hexagons/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${projectID}&resolution=9${authParam}`;
      } else if (this.gemeindeView) {
        this.analyzeService.setMapType('municipality');
        this.mapType = 'municipality';
        return `${environment.apiUrl}/tiles/gemeinden/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${projectID}${authParam}`;
      } else if (this.landkreisView) {
        this.analyzeService.setMapType('county');
        this.mapType = 'county';
        return `${environment.apiUrl}/tiles/landkreise/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${projectID}${authParam}`;
      }
    }

    // Define zoom level thresholds for normal view
    if (this.currentZoom < 7) {
      // State level
      this.analyzeService.setMapType('state');
      this.mapType = 'state';
      return `${environment.apiUrl}/tiles/laender/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${projectID}${authParam}`;
    } else if (this.currentZoom < 9) {
      // County level
      this.analyzeService.setMapType('county');
      this.mapType = 'county';
      return `${environment.apiUrl}/tiles/landkreise/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${projectID}${authParam}`;
    } else if (this.currentZoom < 10) {
      // Municipality level
      this.analyzeService.setMapType('municipality');
      this.mapType = 'municipality';
      return `${environment.apiUrl}/tiles/gemeinden/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${projectID}${authParam}`;
    } else if (this.currentZoom >= 10) {
      this.analyzeService.setMapType('hexagon');
      this.mapType = 'hexagon';
      return `${environment.apiUrl}/tiles/hexagons/{z}/{x}/{y}.pbf?aggregation=${this.averageType}&project=${projectID}&resolution=9${authParam}`;
    }
    return '';
  }

  setSelectedFeature(featureId: string | null): void {
    this.selectedFeatureId = featureId;
    if (this.currentProject) {
      const updatedStyle = this.getProjectMapStyle(this.currentProject);
      this.mapStyleSubject.next(updatedStyle);
    }
  }

  toggleScoreDisplay(): void {
    this.scoreShown = !this.scoreShown;
    if (this.currentProject) {
      const updatedStyle = this.getProjectMapStyle(this.currentProject);
      this.mapStyleSubject.next(updatedStyle);
    }
  }

  private isDifferenceMap(): boolean {
    return this.currentProjectData?.difference === true;
  }

  private getFillColorExpression(): any {
    console.log(this.currentProjectData);
    if (this.isDifferenceMap()) {
      // Divergent blue-magenta color scheme for difference maps (range: -1 to 1)
      // Using interpolate-hcl for perceptually uniform color transitions
      return [
        'interpolate',
        ['linear'],
        ['get', 'index'],
        -1, 'rgba(60, 130, 160, 1)',      // Dark blue (negative extreme)
        0, 'rgba(240, 240, 240, 0.7)',   // Neutral gray (zero)
        1, 'rgba(195, 125, 95, 1)'       // Magenta (positive extreme)
      ];
    } else {
      // Default color scheme for regular maps
      return [
        'case',
        ['<=', ['get', 'index'], 0],
        'rgba(128, 128, 128, 0)',
        ['<=', ['get', 'index'], 0.35],
        'rgba(50, 97, 45, 0.7)',
        ['<=', ['get', 'index'], 0.5],
        'rgba(60, 176, 67, 0.7)',
        ['<=', ['get', 'index'], 0.71],
        'rgba(238, 210, 2, 0.7)',
        ['<=', ['get', 'index'], 1],
        'rgba(237, 112, 20, 0.7)',
        ['<=', ['get', 'index'], 1.41],
        'rgba(194, 24, 7, 0.7)',
        'rgba(150, 86, 162, 0.7)'
      ];
    }
  }

  private getProjectMapStyle(projectID: string): StyleSpecification {
    const baseStyle = this.getBaseMapStyle();

    if (projectID) {
      const tileUrl = this.getTileUrl(projectID);

      // Only add geodata source and layers if tileUrl is valid
      if (tileUrl) {
        baseStyle.sources['geodata'] = {
          type: 'vector',
          tiles: [tileUrl],
          minzoom: 0,
          maxzoom: 10,
          tileSize: 512 // Use smaller tiles on mobile for better performance
        } as SourceSpecification;

        // print the geodata

        baseStyle.layers.push({
          id: 'geodata-fill',
          type: 'fill',
          source: 'geodata',
          'source-layer': 'geodata',
          metadata: {
            'project-id': projectID
          },
          paint: {
            'fill-color': this.getFillColorExpression(),
            'fill-opacity': [
              'interpolate',
              ['cubic-bezier', 0.26, 0.38, 0.82, 0.36],
              ['get', 'population_density'],
              0, 0.2,
              100, 0.5,
              1000, 0.8,
              5000, 0.9
            ],
            'fill-outline-color': this.isDifferenceMap()
              ? [
                'case',
                ['==', ['get', 'id'], this.selectedFeatureId],
                '#000000',
                [
                  'interpolate-hcl',
                  ['linear'],
                  ['get', 'index'],
                  -1, 'rgba(8, 48, 107, 0.7)',      // Dark blue
                  -0.5, 'rgba(66, 146, 198, 0.7)',  // Medium blue
                  -0.1, 'rgba(107, 174, 214, 0.7)', // Light blue
                  0, 'rgba(240, 240, 240, 0.7)',   // Neutral gray
                  0.1, 'rgba(253, 174, 107, 0.7)', // Light orange
                  0.5, 'rgba(253, 141, 60, 0.7)',  // Medium orange
                  1, 'rgba(166, 54, 3, 0.7)'       // Dark orange
                ]
              ]
              : [
                'case',
                ['==', ['get', 'id'], this.selectedFeatureId],
                '#000000',
                [
                  'case',
                  ['<=', ['get', 'index'], 0],
                  'rgba(128, 128, 128, 0)',
                  ['<=', ['get', 'index'], 0.35],
                  'rgba(50, 97, 45, 0.7)',
                  ['<=', ['get', 'index'], 0.5],
                  'rgba(60, 176, 67, 0.7)',
                  ['<=', ['get', 'index'], 0.71],
                  'rgba(238, 210, 2, 0.7)',
                  ['<=', ['get', 'index'], 1],
                  'rgba(237, 112, 20, 0.7)',
                  ['<=', ['get', 'index'], 1.41],
                  'rgba(194, 24, 7, 0.7)',
                  'rgba(150, 86, 162, 0.7)'
                ]
              ]
          }
        } as LayerSpecification);

        // Add score labels layer if scoreShown is true and not in hexagon mode
        if (this.scoreShown && this.analyzeService.getMapType() !== "hexagon") {
          baseStyle.layers.push({
            id: 'geodata-scores',
            type: 'symbol',
            source: 'geodata',
            'source-layer': 'geodata',
            layout: {
              'text-field': [
                'case',
                ['<=', ['get', 'index'], 0], 'Error',
                ['<=', ['get', 'index'], 0.28], 'A+',
                ['<=', ['get', 'index'], 0.32], 'A',
                ['<=', ['get', 'index'], 0.35], 'A-',
                ['<=', ['get', 'index'], 0.4], 'B+',
                ['<=', ['get', 'index'], 0.45], 'B',
                ['<=', ['get', 'index'], 0.5], 'B-',
                ['<=', ['get', 'index'], 0.56], 'C+',
                ['<=', ['get', 'index'], 0.63], 'C',
                ['<=', ['get', 'index'], 0.71], 'C-',
                ['<=', ['get', 'index'], 0.8], 'D+',
                ['<=', ['get', 'index'], 0.9], 'D',
                ['<=', ['get', 'index'], 1.0], 'D-',
                ['<=', ['get', 'index'], 1.12], 'E+',
                ['<=', ['get', 'index'], 1.26], 'E',
                ['<=', ['get', 'index'], 1.41], 'E-',
                ['<=', ['get', 'index'], 1.59], 'F+',
                ['<=', ['get', 'index'], 1.78], 'F',
                'F-'
              ],
              'text-size': 12,
              'text-allow-overlap': true,
              'text-ignore-placement': true
            },
            paint: {
              'text-color': '#000000',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1
            }
          } as LayerSpecification);
        }
      }

      // Remove existing labels layer if it exists, then add it on top of everything
      const existingLabelsIndex = baseStyle.layers.findIndex(layer => layer.id === 'carto-labels-layer');
      if (existingLabelsIndex !== -1) {
        baseStyle.layers.splice(existingLabelsIndex, 1);
      }

      // Add labels layer on top of everything
      baseStyle.layers.push({
        id: 'carto-labels-layer',
        type: 'raster',
        source: 'carto-labels',
        minzoom: 0,
        maxzoom: 19
      } as LayerSpecification);
    }

    return baseStyle;
  }

  addSingleFeature(geojson: any): void {
    if (!this.map || this.currentProject) return;

    this.temporaryFeatures.push(geojson.features[0]);

    const source = this.map.getSource('temporary-geojson') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: this.temporaryFeatures
      });

      // Check if enough time has passed since last zoom
      const currentTime = Date.now();
      if (currentTime - this.lastZoomTime >= this.ZOOM_COOLDOWN) {
        // zoom to the latest feature
        if (geojson.features && geojson.features[0]?.geometry?.coordinates) {
          const coordinates = geojson.features[0].geometry.coordinates[0][0];
          const bounds = coordinates.reduce((bounds: LngLatBounds, coord: number[]) => {
            return bounds.extend([coord[0], coord[1]]);
          }, new LngLatBounds(coordinates[0], coordinates[0]));

          this.map.fitBounds(bounds, {
            padding: 50,
            duration: 2000,
            maxZoom: 10
          });
          this.lastZoomTime = currentTime;
        }
      }
    }
  }

  removeSingleFeatures(): void {
    this.temporaryFeatures = [];
    const source = this.map?.getSource('temporary-geojson') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }

  ngOnDestroy() {
    if (this.shortcutSubscription) {
      this.shortcutSubscription.unsubscribe();
    }
    if (this.styleUpdateThrottle) {
      clearTimeout(this.styleUpdateThrottle);
    }
  }

  manuallyClickMap(): void {
    if (!this.map) return;
    // click randomly on any existing feature
    const features = this.map.queryRenderedFeatures();
    if (features.length > 0) {
      const randomFeature = features[Math.floor(Math.random() * features.length)];
      this.analyzeService.setSelectedFeature(randomFeature, "hexagon", [49.320099, 9.2156505]);
      this.setSelectedFeature(randomFeature.properties['id']);
    }
  }

  setComparisonProject(project: Project): void {
    this.comparisonProject = project;
    this.comparisonSubject.next(true);
    this.loadingService.stopLoading();
  }

  exitComparisonMode(): void {
    this.comparisonProject = null;
    this.comparisonSubject.next(false);
    this.stopComparisonSubject.next(true);
    // Reset the stop comparison subject after triggering it
    setTimeout(() => this.stopComparisonSubject.next(false), 100);
    // Don't reset the map - just restore the current project style
    if (this.currentProject) {
      const updatedStyle = this.getProjectMapStyle(this.currentProject);
      this.mapStyleSubject.next(updatedStyle);
    }
  }

  async getGeojson(): Promise<any> {
    const token = this.authService.getAuthorizationHeaders().get('Authorization')?.split(' ')[1];
    let authParam = '';
    if (this.getShareKey()) {
      authParam = `&key=${this.getShareKey()}`;
    } else if (token) {
      authParam = `&token=${token}`;
    }

    const url = `${environment.apiUrl}/geojson/?project=${this.currentProject}&type=${this.averageType}&resolution=${this.getMapType()}${authParam}`;

    return firstValueFrom(this.http.get<any>(url));
  }
}
