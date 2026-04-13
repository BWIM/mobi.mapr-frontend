import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Map, StyleSpecification, SourceSpecification, LayerSpecification, LngLatBounds } from 'maplibre-gl';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { DashboardSessionService } from './dashboard-session.service';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { WebsocketService } from './websocket.service';
import { ProjectsService } from './project.service';

export interface ContentLayerFilters {
  profile_ids: number[];
  state_ids?: number[];
  category_ids?: number[];
  persona_id?: number;
  regiotyp_id?: number | null;
  regiostar_ids?: number[];
  admin_level?: 'state' | 'county' | 'municipality' | 'hexagon';
  feature_type: 'index' | 'score';
}

export interface FeatureInfoResponse {
  name: string;
  population: number;
  rank: number;
  total_ranks: number;
  regiostar_rank: number | null;
  regiostar_total_ranks: number | null;
  index: number;
  score: number;
}

export interface FeatureInfoParams {
  feature_type: 'municipality' | 'hexagon' | 'county' | 'state';
  feature_id: number;
  profile_ids: number[];
  category_ids?: number[];
  persona_id?: number;
  regiostar_ids?: number[];
  state_ids?: number[];
}

export interface GeoLocationResponse {
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
  lat?: number;
  lng?: number;
  ip?: string;
  error?: string;
}

export interface MapExportParams {
  export_format: 'geojson' | 'csv';
  resolution: 'hexagon' | 'municipality' | 'county' | 'state';
  state: string;
  profile_ids: number[];
  email: string;
  categories?: number[];
  persona_id?: number;
  include_population?: boolean;
}

export interface MapExportResult {
  status: 'success';
}

interface MapExportCreateResponse {
  status: string;
  job_id: number;
  format: 'geojson' | 'csv';
  email?: string | null;
  status_url?: string;
  download_url?: string;
  reused_from_job_id?: number;
}

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private map: Map | null = null;
  private mapStyleSubject = new BehaviorSubject<StyleSpecification>(this.getBaseMapStyle());
  mapStyle$: Observable<StyleSpecification> = this.mapStyleSubject.asObservable();
  private authService = inject(AuthService);
  private dashboardSessionService = inject(DashboardSessionService);
  private http = inject(HttpClient);
  private websocketService = inject(WebsocketService);
  private projectService = inject(ProjectsService);
  private currentFilters: ContentLayerFilters | null = null;
  private hasInitialZoom = false; // Track if initial zoom to geolocation has occurred
  
  /** Current API profile_ids selection (subset of project base_profiles). */
  private _currentProfileIds = signal<number[] | null>(null);
  readonly currentProfileIds = this._currentProfileIds.asReadonly();

  // Signal to track map loading state
  private _isMapLoading = signal<boolean>(true);
  readonly isMapLoading = this._isMapLoading.asReadonly();

  // Signal to track project preparation state (when preparing dialog is shown)
  private _isPreparingProject = signal<boolean>(false);
  readonly isPreparingProject = this._isPreparingProject.asReadonly();
  
  // Signal to track if ready check has completed (prevents rankings from loading too early)
  private _isReadyCheckComplete = signal<boolean>(false);
  readonly isReadyCheckComplete = this._isReadyCheckComplete.asReadonly();

  constructor() {}

  setMap(map: Map): void {
    this.map = map;
  }

  getMap(): Map | null {
    return this.map;
  }

  getBaseMapStyle(): StyleSpecification {
    const style: StyleSpecification = {
      version: 8,
      sources: {
        'carto-light': {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'],
          tileSize: 256,
          minzoom: 0,
        } as SourceSpecification,
        'carto-labels': {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'],
          tileSize: 256,
          minzoom: 0,
        } as SourceSpecification
      },
      layers: [
        {
          id: 'carto-light-layer',
          type: 'raster',
          source: 'carto-light',
          minzoom: 0,
        } as LayerSpecification,
        {
          id: 'carto-labels-layer',
          type: 'raster',
          source: 'carto-labels',
          minzoom: 0,
        } as LayerSpecification
      ],
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
    };
    return style;
  }

  updateStyle(style: StyleSpecification): void {
    this.mapStyleSubject.next(style);
    if (this.map) {
      this.map.setStyle(style);
    }
  }

  getMinimapConfig(): any {
    return {
      id: "miniMap",
      width: "200px",
      height: "200px",
      zoomLevelOffset: 5,
      initialMinimized: false,
      minimizableMinimap: true,
      collapsedWidth: "30px",
      collapsedHeight: "30px",
      borderRadius: "5px",
      style: {
        borderRadius: "5px",
        border: "1px solid var(--background-color)",
        backgroundColor: "var(--secondary-color)",
        padding: "0px",
        sources: {
          'carto-light': {
            type: "raster",
            tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
            tileSize: 256,
            minzoom: 0,
          } as SourceSpecification
        },
        layers: [
          {
            id: 'carto-light-layer',
            type: 'raster',
            source: 'carto-light',
            minzoom: 0,
          } as LayerSpecification,
        ],
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
      },
    };
  }

  /**
   * Calls the ready endpoint to check and ensure preloaded data
   */
  async checkReady(filters: ContentLayerFilters): Promise<{ cache_flag: boolean; was_preloaded: boolean; session_id?: string }> {
    const projectId = this.dashboardSessionService.getProjectId();
    const shareKey = this.dashboardSessionService.getShareKey();

    if (!projectId && !shareKey) {
      throw new Error('Project ID or share key is required');
    }

    if (!filters.profile_ids?.length) {
      throw new Error('profile_ids is required');
    }

    let params = new HttpParams()
      .set('profile_ids', filters.profile_ids.join(','));

    // Add project or key
    if (projectId) {
      params = params.set('project', projectId);
    } else if (shareKey) {
      params = params.set('key', shareKey);
    }

    // Add optional parameters
    if (filters.category_ids && filters.category_ids.length > 0) {
      params = params.set('category_ids', filters.category_ids.join(','));
    }

    if (filters.persona_id !== undefined && filters.persona_id !== null) {
      params = params.set('persona_id', filters.persona_id.toString());
    }

    if (filters.state_ids && filters.state_ids.length > 0) {
      params = params.set('state_ids', filters.state_ids.join(','));
    }

    if (filters.regiostar_ids && filters.regiostar_ids.length > 0) {
      params = params.set('regiostar_ids', filters.regiostar_ids.join(','));
    }

    // Note: regiostar_ids is not in ContentLayerFilters, but regiotyp_id is
    // The API expects regiostar_ids, so we'll skip it for now
    // If needed, we can add it to ContentLayerFilters later

    const url = `${environment.apiUrl}/ready/`;
    const response = await firstValueFrom(
      this.http.get<{ cache_flag: boolean; was_preloaded: boolean; session_id?: string }>(url, { params })
    );

    return response;
  }

  /**
   * Waits for preload to complete via websocket
   */
  waitForPreload(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let isResolved = false;
      
      // Construct the websocket URL with the session_id from the API response
      // The websocket service will add its own session parameter, but the API expects session=<session_id>
      const wsUrl = `${environment.wsURL}/preload/?session=${sessionId}`;

      const wsSubject = this.websocketService.connect<any>(wsUrl);

      const subscription = wsSubject.subscribe({
        next: (message: any) => {
          
          // Handle different message formats
          const status = message.status || message.type || message.message;
          const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
          
          // Check for completion in various formats
          const isCompleted = 
            status === 'completed' || 
            status === 'complete' || 
            message.completed === true ||
            messageStr?.toLowerCase().includes('completed') ||
            messageStr?.toLowerCase().includes('complete') ||
            message.finished === true ||
            message.done === true;
          
          if (isCompleted) {
            if (!isResolved) {
              isResolved = true;
              subscription.unsubscribe();
              this.websocketService.closeConnection(wsUrl);
              resolve();
            }
          } else if (status === 'error' || message.error) {
            console.error('Preload error:', message.error || message);
            if (!isResolved) {
              isResolved = true;
              subscription.unsubscribe();
              this.websocketService.closeConnection(wsUrl);
              reject(new Error(message.error || 'Preload failed'));
            }
          }
        },
        error: (error) => {
          console.error('Preload websocket error:', error);
          if (!isResolved) {
            isResolved = true;
            subscription.unsubscribe();
            this.websocketService.closeConnection(wsUrl);
            reject(error);
          }
        },
        complete: () => {
          // Don't resolve here - only resolve when we get explicit completion message
          // Connection might close for other reasons before preload is actually complete
          subscription.unsubscribe();
          this.websocketService.closeConnection(wsUrl);
          // Only reject if we haven't resolved yet and connection closed unexpectedly
          if (!isResolved) {
            console.warn('Websocket closed before receiving completion message');
            // Don't reject here - let timeout handle it, or wait for explicit message
          }
        }
      });

      // Set a timeout to avoid waiting indefinitely (5 minutes)
      setTimeout(() => {
        if (!isResolved && subscription && !subscription.closed) {
          console.warn('Preload websocket timeout, assuming complete');
          isResolved = true;
          subscription.unsubscribe();
          this.websocketService.closeConnection(wsUrl);
          resolve();
        }
      }, 1000000);
    });
  }

  /**
   * Builds the tile URL with query parameters for the content layer
   */
  private buildTileUrl(projectId: string, filters: ContentLayerFilters): string {
    if (!projectId || !filters.profile_ids?.length) {
      return '';
    }

    const baseUrl = `${environment.apiUrl}/projects/${projectId}/tiles/{z}/{x}/{y}.pbf`;
    const params: string[] = [];

    params.push(`profile_ids=${filters.profile_ids.join(',')}`);

    // Optional parameters - only add if they have values
    if (filters.state_ids && filters.state_ids.length > 0) {
      params.push(`state_ids=${filters.state_ids.join(',')}`);
    }

    if (filters.category_ids && filters.category_ids.length > 0) {
      params.push(`category_ids=${filters.category_ids.join(',')}`);
    }

    if (filters.persona_id !== undefined && filters.persona_id !== null) {
      params.push(`persona_id=${filters.persona_id}`);
    }

    if (filters.regiostar_ids && filters.regiostar_ids.length > 0) {
      params.push(`regiostar_ids=${filters.regiostar_ids.join(',')}`);
    }

    if (filters.admin_level) {
      params.push(`admin_level=${filters.admin_level}`);
    }

    // Feature type (required)
    params.push(`feature_type=${filters.feature_type}`);

    // Add authentication token if available
    const token = this.authService.getAuthorizationHeaders().get('Authorization')?.split(' ')[1];
    if (token) {
      params.push(`token=${token}`);
    }

    // Add share key if available (for unauthenticated access)
    const shareKey = this.dashboardSessionService.getShareKey();
    if (shareKey && !token) {
      params.push(`key=${shareKey}`);
    }

    return `${baseUrl}?${params.join('&')}`;
  }

  /**
   * Sets the map loading state
   */
  setMapLoading(loading: boolean): void {
    this._isMapLoading.set(loading);
  }

  /**
   * Sets the project preparation state
   */
  setPreparingProject(preparing: boolean): void {
    this._isPreparingProject.set(preparing);
  }
  
  /**
   * Sets the ready check completion state
   */
  setReadyCheckComplete(complete: boolean): void {
    this._isReadyCheckComplete.set(complete);
  }

  /**
   * Fetches the user's geo location from the API
   */
  private async fetchGeoLocation(): Promise<{ lat: number; lng: number } | null> {
    try {
      let params = new HttpParams();

      // Add share key only (for unauthenticated access)
      const shareKey = this.dashboardSessionService.getShareKey();
      if (shareKey) {

        params = params.set('key', shareKey);
        const url = `${environment.apiUrl}/geo`;
        const response = await firstValueFrom(
          this.http.get<GeoLocationResponse>(url, { params })
        );
        
        // Check if response has error or missing lat/lng
        if (response.error || !response.lat || !response.lng) {
          return null;
        }
        
        return {
          lat: response.lat,
          lng: response.lng
        }
      }
      return null;
    } catch (error) {
      console.warn('Could not fetch geo location from API:', error);
      return null;
    }
  }

  /**
   * Fetches bounds for the content layer from the API
   */
  private async fetchContentLayerBounds(filters: ContentLayerFilters): Promise<{ min_lon: number; min_lat: number; max_lon: number; max_lat: number } | null> {
    try {
      let params = new HttpParams();

      // Add authentication token if available
      const token = this.authService.getAuthorizationHeaders().get('Authorization')?.split(' ')[1];
      if (token) {
        params = params.set('token', token);
      }

      // Add share key if available (for unauthenticated access)
      const shareKey = this.dashboardSessionService.getShareKey();
      if (shareKey && !token) {
        params = params.set('key', shareKey);
      }

      // Only send state_ids if they are selected
      if (filters.state_ids && filters.state_ids.length > 0) {
        params = params.set('state_ids', filters.state_ids.join(','));
      }

      const url = `${environment.apiUrl}/tiles/bounds/`;
      const bounds = await firstValueFrom(
        this.http.get<{ min_lon: number; min_lat: number; max_lon: number; max_lat: number }>(url, { params })
      );
      return bounds;
    } catch (error) {
      console.warn('Could not fetch bounds from API:', error);
      return null;
    }
  }


  /**
   * Zooms the map to the bounds of the content layer
   * On initial load, tries to get user's geo location first, then falls back to content layer bounds
   * After initial load, always uses content layer bounds
   */
  private async zoomToContentLayerBounds(filters: ContentLayerFilters): Promise<void> {
    if (!this.map) {
      return;
    }

    // Only try geolocation on initial load
    if (!this.hasInitialZoom) {
      const geoLocation = await this.fetchGeoLocation();
      
      if (geoLocation) {
        // Move map to user's location
        this.map.flyTo({
          center: [geoLocation.lng, geoLocation.lat],
          zoom: 10,
          duration: 1000
        });
        this.hasInitialZoom = true;
        return;
      }
      // Mark as initial zoom attempted even if geolocation failed
      this.hasInitialZoom = true;
    }

    // After initial load, or if geolocation failed, use content layer bounds
    const apiBounds = await this.fetchContentLayerBounds(filters);
    
    if (apiBounds) {
      const bounds = new LngLatBounds(
        [apiBounds.min_lon, apiBounds.min_lat],
        [apiBounds.max_lon, apiBounds.max_lat]
      );
      
      this.map.fitBounds(bounds, {
        padding: 50,
        duration: 1000
      });
    }
  }

  /**
   * Updates the content layer in the map style based on filter parameters
   * @param filters - The filter parameters
   * @param zoomToBounds - Whether to zoom to bounds (default: true)
   */
  async loadContentLayer(filters: ContentLayerFilters, zoomToBounds: boolean = true): Promise<void> {
    let projectId = this.dashboardSessionService.getProjectId();
    const shareKey = this.dashboardSessionService.getShareKey();
    
    // If no projectId but we have a shareKey, get the project ID from the loaded project
    if (!projectId && shareKey) {
      const project = this.projectService.getProject();
      if (project) {
        projectId = project.id.toString();
      } else {
        console.warn('Cannot load content layer: No project ID available and project not loaded');
        return;
      }
    }
    
    if (!projectId) {
      console.warn('Cannot load content layer: No project ID available');
      return;
    }

    if (!filters.profile_ids?.length) {
      console.warn('Cannot load content layer: profile_ids is required');
      this._currentProfileIds.set(null);
      return;
    }

    this._currentProfileIds.set([...filters.profile_ids]);
    this.currentFilters = filters;

    // Zoom to bounds only if requested (for full reloads)
    if (zoomToBounds) {
      await this.zoomToContentLayerBounds(filters);
    }

    const tileUrl = this.buildTileUrl(projectId, filters);

    if (!tileUrl) {
      console.warn('Cannot load content layer: Invalid tile URL');
      return;
    }

    const currentStyle = this.mapStyleSubject.getValue();
    const updatedStyle = { ...currentStyle };

    // Remove existing content layer source and layers if they exist
    if (updatedStyle.sources['content-layer']) {
      delete updatedStyle.sources['content-layer'];
    }

    // Remove existing border layer source and layers if they exist
    // if (updatedStyle.sources['border-layer']) {
    //   delete updatedStyle.sources['border-layer'];
    // }

    // Remove existing content and border layers from layers array
    updatedStyle.layers = updatedStyle.layers.filter(
      layer => layer.id !== 'content-layer-fill' && 
               layer.id !== 'content-layer-outline' &&
               layer.id !== 'content-layer-highlight' &&
               layer.id !== 'content-layer-selection'
    );

    // Add the new content layer source
    updatedStyle.sources['content-layer'] = {
      type: 'vector',
      tiles: [tileUrl],
      minzoom: 0,
      tileSize: 512
    } as SourceSpecification;

    // Add the border layer source
    // const borderTileUrl = `${environment.apiUrl}/borders/{z}/{x}/{y}.pbf`;
    // updatedStyle.sources['border-layer'] = {
    //   type: 'vector',
    //   tiles: [borderTileUrl],
    //   minzoom: 0,
    //   maxzoom: 14,
    //   tileSize: 512
    // } as SourceSpecification;

    // Determine the fill color expression based on feature_type
    const fillColorExpression = filters.feature_type === 'score'
      ? this.getScoreFillColorExpression()
      : this.getIndexFillColorExpression();

    // Opacity expression for hexagons (t='h'):
    // - Use population in the range [0, 1000]
    // - Map to opacity [0.2, 0.9] using exponential interpolation
    // - Clamp values outside [0, 1000] to the nearest bound
    const hexOpacityExpression: any = [
      'interpolate',
      ['cubic-bezier', 0.26, 0.38, 0.82, 0.36],
      ['get', 'population'],
      0, 0.2,
      100, 0.5,
      1000, 0.8,
      5000, 0.9
    ];

    // For non-hex features, keep a constant opacity
    const fillOpacityExpression: any = [
      'case',
      ['==', ['get', 't'], 'h'],  // If hexagon
      hexOpacityExpression,
      0.7
    ];

    const lineOpacityExpression: any = [
      'case',
      ['==', ['get', 't'], 'h'],  // If hexagon
      hexOpacityExpression,
      0.8
    ];

    // Add fill layer
    updatedStyle.layers.push({
      id: 'content-layer-fill',
      type: 'fill',
      source: 'content-layer',
      'source-layer': 'geodata',
      paint: {
        'fill-color': fillColorExpression,
        'fill-opacity': fillOpacityExpression
      }
    } as LayerSpecification);

    // Add outline layer
    updatedStyle.layers.push({
      id: 'content-layer-outline',
      type: 'line',
      source: 'content-layer',
      'source-layer': 'geodata',
      paint: {
        'line-color': fillColorExpression,
        'line-width': 1,
        'line-opacity': lineOpacityExpression
      }
    } as LayerSpecification);

    // Add highlight layer for hover effects (initially hidden, will be filtered on hover)
    // Uses a darkened version (10% black added) of the fill/outline color with full opacity
    const darkenedColorExpression = this.getDarkenedColorExpression(fillColorExpression);
    updatedStyle.layers.push({
      id: 'content-layer-highlight',
      type: 'line',
      source: 'content-layer',
      'source-layer': 'geodata',
      paint: {
        'line-color': darkenedColorExpression,
        'line-width': 2,
        'line-opacity': 1
      },
      filter: ['==', ['get', 'name'], '__never_match__'] // Initially filter out everything
    } as LayerSpecification);

    // Add selection border layer for selected features (initially hidden, will be filtered on selection)
    // Positioned after highlight layer so it appears on top
    updatedStyle.layers.push({
      id: 'content-layer-selection',
      type: 'line',
      source: 'content-layer',
      'source-layer': 'geodata',
      paint: {
        'line-color': '#FFFFFF',
        'line-width': 2,
        'line-opacity': 1
      },
      filter: ['==', ['get', 'name'], '__never_match__'] // Initially filter out everything (using name like highlight)
    } as LayerSpecification);

    // Add border layer (between feature layers and labels)
    // updatedStyle.layers.push({
    //   id: 'border-layer',
    //   type: 'line',
    //   source: 'border-layer',
    //   'source-layer': 'borders',
    //   paint: {
    //     'line-color': fillColorExpression,
    //     'line-width': 0.1,
    //     'line-opacity': 0.5
    //   }
    // } as LayerSpecification);

    // Ensure labels layer is on top
    const labelsLayerIndex = updatedStyle.layers.findIndex(layer => layer.id === 'carto-labels-layer');
    if (labelsLayerIndex !== -1) {
      const labelsLayer = updatedStyle.layers.splice(labelsLayerIndex, 1)[0];
      updatedStyle.layers.push(labelsLayer);
    }

    this.updateStyle(updatedStyle);
  }

  /**
   * Updates only the tile source without zooming (for Verkehrsmittel/Bewertung changes)
   * This preserves the current map view while updating the data
   */
  async updateContentLayerTiles(filters: ContentLayerFilters): Promise<void> {
    await this.loadContentLayer(filters, false);
  }

  /**
   * Removes the content layer from the map
   */
  removeContentLayer(): void {
    const currentStyle = this.mapStyleSubject.getValue();
    const updatedStyle = { ...currentStyle };

    // Remove content layer source
    if (updatedStyle.sources['content-layer']) {
      delete updatedStyle.sources['content-layer'];
    }

    // Remove border layer source
    // if (updatedStyle.sources['border-layer']) {
    //   delete updatedStyle.sources['border-layer'];
    // }

    // Remove content and border layers from layers array
    updatedStyle.layers = updatedStyle.layers.filter(
      layer => layer.id !== 'content-layer-fill' && 
               layer.id !== 'content-layer-outline' &&
               layer.id !== 'content-layer-highlight' &&
               layer.id !== 'content-layer-selection'
    );

    this._currentProfileIds.set(null);
    this.currentFilters = null;
    // Reset ready check state when content layer is removed
    this._isReadyCheckComplete.set(false);
    // Reset initial zoom flag so geolocation is attempted again on next load
    this.hasInitialZoom = false;
    this.updateStyle(updatedStyle);
  }

  /**
   * Gets the current filter parameters
   */
  getCurrentFilters(): ContentLayerFilters | null {
    return this.currentFilters;
  }

  /**
   * Returns the fill color expression for Score feature type
   * 162, 210, 235
   * 62, 210, 235
121, 194, 230
90, 135, 185
74, 89, 160
43, 40, 105
23, 25, 63
   */

  private getScoreFillColorExpression(): any {
    return [
      'step',
      ['get', 'score'],
      'rgb(23,25,63)',     // 0-7 min (default for < 480) - darkest
      480, 'rgb(43,40,105)',   // 8-15 min (480-960s) - very dark
      960, 'rgb(74,89,160)',    // 16-23 min (960-1440s) - darker
      1440, 'rgb(90,135,185)',  // 24-30 min (1440-1800s) - medium
      1800, 'rgb(121,194,230)', // 31-45 min (1800-2700s) - medium-light
      2700, 'rgb(162,210,235)'  // 45+ min (2700+s) - lightest
    ];
  }

  /**
   * Returns a darkened version of the fill color expression (10% black added)
   * Used for highlight borders to make them stand out better
   */
  private getDarkenedColorExpression(baseExpression: any): any {
    if (baseExpression[0] === 'step') {
      // Darken score color expression by 10% (multiply RGB by 0.9)
      // Structure: ['step', input, default, threshold1, color1, threshold2, color2, ...]
      return [
        'step',
        baseExpression[1], // ['get', 'score']
        'rgb(21,23,57)',      // rgb(23,25,63) * 0.9 (rounded)
        baseExpression[3], // 480
        'rgb(39,36,95)',      // rgb(43,40,105) * 0.9 (rounded)
        baseExpression[5], // 960
        'rgb(67,80,144)',     // rgb(74,89,160) * 0.9 (rounded)
        baseExpression[7], // 1440
        'rgb(81,122,167)',    // rgb(90,135,185) * 0.9 (rounded)
        baseExpression[9], // 1800
        'rgb(109,175,207)',   // rgb(121,194,230) * 0.9 (rounded)
        baseExpression[11], // 2700
        'rgb(146,189,212)'    // rgb(162,210,235) * 0.9 (rounded)
      ];
    } else if (baseExpression[0] === 'case') {
      // Darken index color expression by 10% (multiply RGB by 0.9)
      // Structure: ['case', condition1, color1, condition2, color2, ..., defaultColor]
      return [
        'case',
        baseExpression[1], // ['<=', ['/', ['get', 'index'], 100], 0]
        'rgba(115, 115, 115, 0)', // rgba(128, 128, 128, 0) * 0.9 (rounded)
        baseExpression[3], // ['<', ['/', ['get', 'index'], 100], 0.35]
        'rgba(45, 87, 41, 1)',    // rgba(50, 97, 45, 0.7) * 0.9, full opacity
        baseExpression[5], // ['<', ['/', ['get', 'index'], 100], 0.5]
        'rgba(54, 158, 60, 1)',   // rgba(60, 176, 67, 0.7) * 0.9, full opacity
        baseExpression[7], // ['<', ['/', ['get', 'index'], 100], 0.71]
        'rgba(214, 189, 2, 1)',   // rgba(238, 210, 2, 0.7) * 0.9, full opacity
        baseExpression[9], // ['<', ['/', ['get', 'index'], 100], 1.0]
        'rgba(213, 101, 18, 1)',  // rgba(237, 112, 20, 0.7) * 0.9, full opacity
        baseExpression[11], // ['<', ['/', ['get', 'index'], 100], 1.41]
        'rgba(175, 22, 6, 1)',    // rgba(194, 24, 7, 0.7) * 0.9, full opacity
        'rgba(135, 77, 146, 1)'   // rgba(150, 86, 162, 0.7) * 0.9, full opacity
      ];
    }
    return baseExpression;
  }

  /**
   * Returns the fill color expression for Index feature type
   * Color breaks match the grade boundaries from getIndexName():
   * - A (A+, A, A-): < 0.35
   * - B (B+, B, B-): < 0.5
   * - C (C+, C, C-): < 0.71
   * - D (D+, D, D-): < 1.0
   * - E (E+, E, E-): < 1.41
   * - F (F+, F, F-): >= 1.41
   */
  private getIndexFillColorExpression(): any {
    // Divide "index" by 100 before applying color breaks
    return [
      'case',
      ['<=', ['/', ['get', 'index'], 100], 0],
      'rgba(128, 128, 128, 0)', // NaN or invalid
      ['<', ['/', ['get', 'index'], 100], 0.35],
      'rgba(50, 97, 45, 0.7)',  // Grade A (A+, A, A-)
      ['<', ['/', ['get', 'index'], 100], 0.5],
      'rgba(60, 176, 67, 0.7)',  // Grade B (B+, B, B-)
      ['<', ['/', ['get', 'index'], 100], 0.71],
      'rgba(238, 210, 2, 0.7)',  // Grade C (C+, C, C-)
      ['<', ['/', ['get', 'index'], 100], 1.0],
      'rgba(237, 112, 20, 0.7)',  // Grade D (D+, D, D-)
      ['<', ['/', ['get', 'index'], 100], 1.41],
      'rgba(194, 24, 7, 0.7)',  // Grade E (E+, E, E-)
      'rgba(150, 86, 162, 0.7)',  // Grade F (F+, F, F-)
    ];
  }


  /**
   * Determines the feature type based on the 't' property from the tile
   * t='h' -> hexagon, t='m' -> municipality, t='c' -> county, t='s' -> state
   * Returns null if 't' property is not available (no fallback)
   */
  getFeatureTypeFromTileProperty(feature: any): 'municipality' | 'hexagon' | 'county' | 'state' | null {
    const tileType = feature?.properties?.['t'];
    
    if (tileType === 'h') {
      return 'hexagon';
    } else if (tileType === 'm') {
      return 'municipality';
    } else if (tileType === 'c') {
      return 'county';
    } else if (tileType === 's') {
      return 'state';
    }
    
    // No fallback - return null if 't' property is missing
    console.error('Tile type property "t" not found in feature properties:', feature?.properties);
    return null;
  }

  /**
   * Gets feature information from the API
   */
  getFeatureInfo(params: FeatureInfoParams): Observable<FeatureInfoResponse> {
    const projectId = this.dashboardSessionService.getProjectId();
    const shareKey = this.dashboardSessionService.getShareKey();
    
    if (!projectId && !shareKey) {
      throw new Error('Project ID or share key is required');
    }

    const url = `${environment.apiUrl}/feature-info/`;
    let httpParams = new HttpParams()
      .set('feature_type', params.feature_type)
      .set('feature_id', params.feature_id.toString())
      .set('profile_ids', params.profile_ids.join(','));

    // Add project or key
    if (projectId) {
      httpParams = httpParams.set('project', projectId.toString());
    } else if (shareKey) {
      httpParams = httpParams.set('key', shareKey);
    }

    // Add optional filter parameters
    if (params.category_ids && params.category_ids.length > 0) {
      httpParams = httpParams.set('category_ids', params.category_ids.join(','));
    }

    if (params.persona_id !== undefined && params.persona_id !== null) {
      httpParams = httpParams.set('persona_id', params.persona_id.toString());
    }

    if (params.regiostar_ids && params.regiostar_ids.length > 0) {
      httpParams = httpParams.set('regiostar_ids', params.regiostar_ids.join(','));
    }

    if (params.state_ids && params.state_ids.length > 0) {
      httpParams = httpParams.set('state_ids', params.state_ids.join(','));
    }

    return this.http.get<FeatureInfoResponse>(url, { params: httpParams });
  }

  /**
   * Starts a map export job (GeoJSON or CSV). Requires email so the backend can send the download link.
   * Does not poll or download in the browser — the user receives the file via email.
   */
  async exportMapData(params: MapExportParams): Promise<MapExportResult> {
    const projectId = this.dashboardSessionService.getProjectId();
    const shareKey = this.dashboardSessionService.getShareKey();

    if (!projectId && !shareKey) {
      throw new Error('Project ID or share key is required');
    }

    const trimmedEmail = params.email.trim();
    if (!trimmedEmail) {
      throw new Error('Email is required');
    }

    let httpParams = new HttpParams()
      .set('export_format', params.export_format)
      .set('resolution', params.resolution)
      .set('state', params.state)
      .set('profile_ids', params.profile_ids.join(','))
      .set('email', trimmedEmail);

    if (projectId) {
      httpParams = httpParams.set('project', projectId.toString());
    } else {
      httpParams = httpParams.set('key', shareKey!);
    }

    if (params.include_population === true) {
      httpParams = httpParams.set('include_population', 'true');
    }

    if (params.categories && params.categories.length > 0) {
      httpParams = httpParams.set('categories', params.categories.join(','));
    }
    if (params.persona_id !== undefined && params.persona_id !== null) {
      httpParams = httpParams.set('persona_id', params.persona_id.toString());
    }

    const url = `${environment.apiUrl}/maps/export/`;

    try {
      const response = await firstValueFrom(
        this.http.get<MapExportCreateResponse>(url, {
          params: httpParams,
          observe: 'response',
        })
      );

      if (response.status !== 200 && response.status !== 202) {
        throw new Error(`Unexpected status code: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Empty export response');
      }

      return { status: 'success' };
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 400) {
          throw new Error('Invalid parameters provided');
        }
        if (error.status === 401) {
          throw new Error('Authentication required');
        }
        if (error.status === 404) {
          throw new Error('Project not found or invalid share key');
        }
      }
      throw error instanceof Error ? error : new Error('Failed to export map data');
    }
  }
}
