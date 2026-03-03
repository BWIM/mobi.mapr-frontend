import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Map, StyleSpecification, SourceSpecification, LayerSpecification, LngLatBounds } from 'maplibre-gl';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { DashboardSessionService } from './dashboard-session.service';
import { HttpClient, HttpParams } from '@angular/common/http';
import { WebsocketService } from './websocket.service';
import { ProjectsService } from './project.service';

export interface ContentLayerFilters {
  profile_combination_id: number | null;
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
  profile_combination_id: number;
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
  
  // Signal to share current profile combination ID with other components
  private _currentProfileCombinationID = signal<number | null>(null);
  readonly currentProfileCombinationID = this._currentProfileCombinationID.asReadonly();

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
            maxzoom: 14
          } as SourceSpecification
        },
        layers: [
          {
            id: 'carto-light-layer',
            type: 'raster',
            source: 'carto-light',
            minzoom: 0,
            maxzoom: 14
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

    if (!filters.profile_combination_id) {
      throw new Error('profile_combination_id is required');
    }

    let params = new HttpParams()
      .set('profile_combination_id', filters.profile_combination_id.toString());

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
    if (!projectId || !filters.profile_combination_id) {
      return '';
    }

    const baseUrl = `${environment.apiUrl}/projects/${projectId}/tiles/{z}/{x}/{y}.pbf`;
    const params: string[] = [];

    // Required parameter
    params.push(`profile_combination_id=${filters.profile_combination_id}`);

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
      const url = `${environment.apiUrl}/geo`;
      const response = await firstValueFrom(
        this.http.get<GeoLocationResponse>(url)
      );
      
      // Check if response has error or missing lat/lng
      if (response.error || !response.lat || !response.lng) {
        return null;
      }
      
      return {
        lat: response.lat,
        lng: response.lng
      };
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

    if (!filters.profile_combination_id) {
      console.warn('Cannot load content layer: profile_combination_id is required');
      this._currentProfileCombinationID.set(null);
      return;
    }

    // Update the shared profile combination ID signal
    this._currentProfileCombinationID.set(filters.profile_combination_id);
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
               layer.id !== 'content-layer-outline'
    );

    // Add the new content layer source
    updatedStyle.sources['content-layer'] = {
      type: 'vector',
      tiles: [tileUrl],
      minzoom: 0,
      maxzoom: 14,
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

    // Add fill layer
    updatedStyle.layers.push({
      id: 'content-layer-fill',
      type: 'fill',
      source: 'content-layer',
      'source-layer': 'geodata',
      paint: {
        'fill-color': fillColorExpression,
        'fill-opacity': 0.7
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
        'line-opacity': 0.8
      }
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
               layer.id !== 'content-layer-outline'
    );

    this._currentProfileCombinationID.set(null);
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
      'rgb(23,25,63)',     // 0-10 min (default for < 600) - darkest
      600, 'rgb(43,40,105)',   // 11-15 min (600-900s) - very dark
      900, 'rgb(74,89,160)',    // 16-20 min (900-1200s) - darker
      1200, 'rgb(90,135,185)',  // 21-30 min (1200-1800s) - medium
      1800, 'rgb(121,194,230)', // 31-45 min (1800-2700s) - medium-light
      2700, 'rgb(162,210,235)'  // 45+ min (2700+s) - lightest
    ];
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
      .set('profile_combination_id', params.profile_combination_id.toString());

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
}
