import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Map, StyleSpecification, SourceSpecification, LayerSpecification, LngLatBounds, FilterSpecification } from 'maplibre-gl';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { DashboardSessionService } from './dashboard-session.service';
import { appendProjectAccessParams, hasProjectAccess } from './project-access-params';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { WebsocketService } from './websocket.service';
import { ProjectsService } from './project.service';
import { ScoreColorsService } from './score-colors.service';

export interface ContentLayerFilters {
  profile_ids: number[];
  state_ids?: number[];
  category_ids?: number[];
  persona_id?: number;
  regiostar_ids?: number[];
  admin_level?: 'state' | 'county' | 'municipality' | 'hexagon';
  feature_type: 'index' | 'score';
  selected_quality_brackets?: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F'>;
  selected_time_brackets?: string[];
}

/** Backend sentinel: score === NO_DATA_SCORE means no data for this feature. */
export const NO_DATA_SCORE = 15000;

export interface FeatureInfoResponse {
  name: string;
  regiostar_name?: string | null;
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
  private compareRightMap: Map | null = null;
  private mapStyleSubject = new BehaviorSubject<StyleSpecification>(this.getBaseMapStyle());
  mapStyle$: Observable<StyleSpecification> = this.mapStyleSubject.asObservable();
  private authService = inject(AuthService);
  private dashboardSessionService = inject(DashboardSessionService);
  private http = inject(HttpClient);
  private websocketService = inject(WebsocketService);
  private projectService = inject(ProjectsService);
  private scoreColorsService = inject(ScoreColorsService);
  private currentFilters: ContentLayerFilters | null = null;
  private hasInitialZoom = false; // Track if initial zoom to geolocation has occurred
  
  /** Current API profile_ids selection (subset of project base_profiles). */
  private _currentProfileIds = signal<number[] | null>(null);
  readonly currentProfileIds = this._currentProfileIds.asReadonly();

  // Signal to track map loading state
  private _isMapLoading = signal<boolean>(false);
  readonly isMapLoading = this._isMapLoading.asReadonly();

  // Signal to track project preparation state (when preparing dialog is shown)
  private _isPreparingProject = signal<boolean>(false);
  readonly isPreparingProject = this._isPreparingProject.asReadonly();
  
  // Signal to track if ready check has completed (prevents rankings from loading too early)
  private _isReadyCheckComplete = signal<boolean>(false);
  readonly isReadyCheckComplete = this._isReadyCheckComplete.asReadonly();

  constructor() {}

  private getLegendBracketFilterExpression(filters: ContentLayerFilters): any[] | null {
    if (filters.feature_type === 'index') {
      const selected = filters.selected_quality_brackets ?? ['A', 'B', 'C', 'D', 'E', 'F'];
      if (selected.length === 0) {
        return ['==', ['get', 'id'], -1];
      }
      if (selected.length === 6) {
        return null;
      }

      const idx = ['/', ['get', 'index'], 100];
      const bracketExpressions: Record<string, any[]> = {
        A: ['<', idx, 0.35],
        B: ['all', ['>=', idx, 0.35], ['<', idx, 0.5]],
        C: ['all', ['>=', idx, 0.5], ['<', idx, 0.71]],
        D: ['all', ['>=', idx, 0.71], ['<', idx, 1.0]],
        E: ['all', ['>=', idx, 1.0], ['<', idx, 1.41]],
        F: ['>=', idx, 1.41]
      };

      return ['any', ...selected.map(bracket => bracketExpressions[bracket])];
    }

    const allBracketIds = this.scoreColorsService.bracketIds();
    const selected = filters.selected_time_brackets ?? allBracketIds;
    return this.scoreColorsService.buildBracketFilter(selected) as any[] | null;
  }

  setMap(map: Map | null): void {
    this.map = map;
  }

  getMap(): Map | null {
    return this.map;
  }

  setCompareRightMap(map: Map | null): void {
    this.compareRightMap = map;
  }

  getCompareRightMap(): Map | null {
    return this.compareRightMap;
  }

  hasCompareMaps(): boolean {
    return this.map !== null && this.compareRightMap !== null;
  }

  clearCompareMaps(): void {
    this.compareRightMap = null;
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
            maxzoom: 16,
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
    if (!hasProjectAccess(this.dashboardSessionService)) {
      throw new Error('Project ID or share key is required');
    }

    if (!filters.profile_ids?.length) {
      throw new Error('profile_ids is required');
    }

    let params = new HttpParams()
      .set('profile_ids', filters.profile_ids.join(','));

    params = appendProjectAccessParams(params, this.dashboardSessionService);

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

      // Add share key if available (for unauthenticated access)
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
    await this.zoomToContentLayerBoundsForMap(this.map, filters, true);
  }

  private async zoomToContentLayerBoundsForMap(
    targetMap: Map,
    filters: ContentLayerFilters,
    allowGeolocation: boolean
  ): Promise<void> {
    if (allowGeolocation && !this.hasInitialZoom) {
      const geoLocation = await this.fetchGeoLocation();

      if (geoLocation) {
        targetMap.flyTo({
          center: [geoLocation.lng, geoLocation.lat],
          zoom: 10,
          duration: 1000
        });
        this.hasInitialZoom = true;
        return;
      }
      this.hasInitialZoom = true;
    }

    const apiBounds = await this.fetchContentLayerBounds(filters);

    if (apiBounds) {
      const bounds = new LngLatBounds(
        [apiBounds.min_lon, apiBounds.min_lat],
        [apiBounds.max_lon, apiBounds.max_lat]
      );

      targetMap.fitBounds(bounds, {
        padding: 50,
        duration: 1000
      });
    }
  }

  private buildStyleWithContentLayer(filters: ContentLayerFilters, baseStyle?: StyleSpecification): StyleSpecification {
    const tileUrl = this.buildTileUrlForFilters(filters);
    const currentStyle = baseStyle ?? { ...this.mapStyleSubject.getValue() };
    const updatedStyle = { ...currentStyle, sources: { ...currentStyle.sources }, layers: [...currentStyle.layers] };

    if (updatedStyle.sources['content-layer']) {
      delete updatedStyle.sources['content-layer'];
    }

    updatedStyle.layers = updatedStyle.layers.filter(
      layer => layer.id !== 'content-layer-fill' &&
               layer.id !== 'content-layer-outline' &&
               layer.id !== 'content-layer-highlight' &&
               layer.id !== 'content-layer-selection'
    );

    if (!tileUrl) {
      return updatedStyle;
    }

    updatedStyle.sources['content-layer'] = {
      type: 'vector',
      tiles: [tileUrl],
      minzoom: 0,
      tileSize: 512
    } as SourceSpecification;

    const fillColorExpression = filters.feature_type === 'score'
      ? this.getScoreFillColorExpression()
      : this.getIndexFillColorExpression();

    const hexOpacityExpression: any = [
      'interpolate',
      ['cubic-bezier', 0.26, 0.38, 0.82, 0.36],
      ['get', 'population'],
      0, 0.2,
      100, 0.5,
      1000, 0.8,
      5000, 0.9
    ];

    const fillOpacityExpression: any = [
      'case',
      ['==', ['get', 't'], 'h'],
      hexOpacityExpression,
      0.7
    ];

    const lineOpacityExpression: any = [
      'case',
      ['==', ['get', 't'], 'h'],
      hexOpacityExpression,
      0.8
    ];
    const legendBracketFilter = this.getLegendBracketFilterExpression(filters);

    const fillLayer: any = {
      id: 'content-layer-fill',
      type: 'fill',
      source: 'content-layer',
      'source-layer': 'geodata',
      paint: {
        'fill-color': fillColorExpression,
        'fill-opacity': fillOpacityExpression
      }
    };
    if (legendBracketFilter) {
      fillLayer.filter = legendBracketFilter;
    }
    updatedStyle.layers.push(fillLayer as LayerSpecification);

    const outlineColorExpression = this.getDarkenedColorExpression(fillColorExpression, 0.75);
    const outlineLayer: any = {
      id: 'content-layer-outline',
      type: 'line',
      source: 'content-layer',
      'source-layer': 'geodata',
      paint: {
        'line-color': outlineColorExpression,
        'line-width': 1,
        'line-opacity': lineOpacityExpression
      }
    };
    if (legendBracketFilter) {
      outlineLayer.filter = legendBracketFilter;
    }
    updatedStyle.layers.push(outlineLayer as LayerSpecification);

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
      filter: ['==', ['get', 'name'], '__never_match__']
    } as LayerSpecification);

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
      filter: ['==', ['get', 'name'], '__never_match__']
    } as LayerSpecification);

    const labelsLayerIndex = updatedStyle.layers.findIndex(layer => layer.id === 'carto-labels-layer');
    if (labelsLayerIndex !== -1) {
      const labelsLayer = updatedStyle.layers.splice(labelsLayerIndex, 1)[0];
      updatedStyle.layers.push(labelsLayer);
    }

    return updatedStyle;
  }

  private buildTileUrlForFilters(filters: ContentLayerFilters): string | null {
    const effectiveId = this.dashboardSessionService.getEffectiveProjectId()
      ?? this.projectService.getProject()?.id?.toString()
      ?? null;

    if (!effectiveId || !filters.profile_ids?.length) {
      return null;
    }

    return this.buildTileUrl(effectiveId, filters);
  }

  private getCurrentContentLayerTileUrl(targetMap: Map): string | null {
    const source = targetMap.getSource('content-layer') as { tiles?: string[] } | undefined;
    return source?.tiles?.[0] ?? null;
  }

  private syncContentLayerState(filters: ContentLayerFilters): void {
    this._currentProfileIds.set([...filters.profile_ids]);
    this.currentFilters = filters;
  }

  /**
   * Updates the content layer in the map style based on filter parameters
   * @param filters - The filter parameters
   * @param zoomToBounds - Whether to zoom to bounds (default: false)
   */
  async loadContentLayerOnMap(
    targetMap: Map,
    filters: ContentLayerFilters,
    zoomToBounds: boolean = false,
    allowGeolocation: boolean = false
  ): Promise<boolean> {
    const tileUrl = this.buildTileUrlForFilters(filters);

    if (!filters.profile_ids?.length) {
      console.warn('Cannot load content layer: profile_ids is required');
      return false;
    }

    if (!tileUrl) {
      console.warn('Cannot load content layer: Invalid tile URL');
      return false;
    }

    if (zoomToBounds) {
      await this.zoomToContentLayerBoundsForMap(targetMap, filters, allowGeolocation);
    }

    this.syncContentLayerState(filters);
    const updatedStyle = this.buildStyleWithContentLayer(filters, this.getBaseMapStyle());

    await this.waitForMapStyleLoad(targetMap, () => {
      targetMap.setStyle(updatedStyle);
    });

    if (targetMap === this.map) {
      this.mapStyleSubject.next(updatedStyle);
    }

    return true;
  }

  private waitForMapStyleLoad(targetMap: Map, applyStyle: () => void): Promise<void> {
    return new Promise<void>(resolve => {
      let settled = false;
      const complete = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };

      targetMap.once('style.load', complete);
      applyStyle();
      queueMicrotask(() => {
        if (targetMap.isStyleLoaded()) {
          complete();
        }
      });
    });
  }

  /**
   * Updates tiles and layer styling on a specific map without replacing the full style.
   */
  async updateContentLayerOnMap(targetMap: Map, filters: ContentLayerFilters): Promise<void> {
    if (!filters.profile_ids?.length) {
      console.warn('Cannot update content layer: profile_ids is required');
      return;
    }

    const tileUrl = this.buildTileUrlForFilters(filters);
    if (!tileUrl) {
      console.warn('Cannot update content layer: Invalid tile URL');
      return;
    }

    const source = targetMap.getSource('content-layer') as { setTiles?: (tiles: string[]) => void; tiles?: string[] } | undefined;
    const currentTileUrl = this.getCurrentContentLayerTileUrl(targetMap) ?? undefined;
    const tileUrlChanged = currentTileUrl !== tileUrl;

    // setTiles alone does not reliably refetch when profile_ids or other query params change
    // (notably on the compare right map); reload the style when the tile URL changes.
    if (!source?.setTiles || tileUrlChanged) {
      await this.loadContentLayerOnMap(targetMap, filters, false, false);
      return;
    }

    source.setTiles([tileUrl]);
    this.applyContentLayerStyleToMap(targetMap, filters);
    this.syncContentLayerState(filters);
  }

  private applyContentLayerStyleToMap(targetMap: Map, filters: ContentLayerFilters): void {
    const fillColorExpression = filters.feature_type === 'score'
      ? this.getScoreFillColorExpression()
      : this.getIndexFillColorExpression();
    const outlineColorExpression = this.getDarkenedColorExpression(fillColorExpression, 0.75);
    const legendBracketFilter = this.getLegendBracketFilterExpression(filters);

    if (targetMap.getLayer('content-layer-fill')) {
      targetMap.setPaintProperty('content-layer-fill', 'fill-color', fillColorExpression);
      if (legendBracketFilter) {
        targetMap.setFilter('content-layer-fill', legendBracketFilter as FilterSpecification);
      } else {
        targetMap.setFilter('content-layer-fill', null);
      }
    }

    if (targetMap.getLayer('content-layer-outline')) {
      targetMap.setPaintProperty('content-layer-outline', 'line-color', outlineColorExpression);
      if (legendBracketFilter) {
        targetMap.setFilter('content-layer-outline', legendBracketFilter as FilterSpecification);
      } else {
        targetMap.setFilter('content-layer-outline', null);
      }
    }
  }

  async loadContentLayer(filters: ContentLayerFilters, zoomToBounds: boolean = false): Promise<void> {
    if (!filters.profile_ids?.length) {
      console.warn('Cannot load content layer: profile_ids is required');
      this._currentProfileIds.set(null);
      return;
    }

    if (!this.buildTileUrlForFilters(filters)) {
      console.warn('Cannot load content layer: Invalid tile URL');
      return;
    }

    if (this.map) {
      await this.loadContentLayerOnMap(this.map, filters, zoomToBounds, true);
      return;
    }

    this.syncContentLayerState(filters);

    if (zoomToBounds && this.map) {
      await this.zoomToContentLayerBounds(filters);
    }

    const updatedStyle = this.buildStyleWithContentLayer(filters);
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

  private isNoDataScoreExpression(): any {
    return ['==', ['get', 'score'], NO_DATA_SCORE];
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
    return this.scoreColorsService.buildMapLibreStepExpression(this.isNoDataScoreExpression());
  }

  /**
   * Returns a darkened copy of a fill color expression (multiply RGB channels by factor).
   * @param factor 1 = unchanged; 0.9 ≈ 10% darker (highlights); 0.75 ≈ 25% darker (outlines)
   */
  private getDarkenedColorExpression(baseExpression: any, factor = 0.9): any {
    if (baseExpression[0] === 'step' || baseExpression[0] === 'case') {
      const result = [baseExpression[0], baseExpression[1]];
      for (let i = 2; i < baseExpression.length; i++) {
        const entry = baseExpression[i];
        result.push(
          typeof entry === 'string' && (entry.startsWith('rgb') || entry.startsWith('rgba'))
            ? this.darkenColor(entry, factor)
            : entry
        );
      }
      return result;
    }
    return baseExpression;
  }

  /** Darkens an rgb/rgba color string; outline strokes use full opacity. */
  private darkenColor(color: string, factor: number): string {
    const match = color.match(
      /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/
    );
    if (!match) {
      return color;
    }
    const r = Math.round(Number(match[1]) * factor);
    const g = Math.round(Number(match[2]) * factor);
    const b = Math.round(Number(match[3]) * factor);
    const alpha = match[4] !== undefined ? Number(match[4]) : undefined;
    if (alpha !== undefined) {
      return alpha === 0 ? color : `rgba(${r}, ${g}, ${b}, 1)`;
    }
    return `rgb(${r}, ${g}, ${b})`;
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
      this.isNoDataScoreExpression(),
      'rgba(128, 128, 128, 0.7)',
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
    if (!hasProjectAccess(this.dashboardSessionService)) {
      throw new Error('Project ID or share key is required');
    }

    const url = `${environment.apiUrl}/feature-info/`;
    let httpParams = new HttpParams()
      .set('feature_type', params.feature_type)
      .set('feature_id', params.feature_id.toString())
      .set('profile_ids', params.profile_ids.join(','));

    httpParams = appendProjectAccessParams(httpParams, this.dashboardSessionService);

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
    if (!hasProjectAccess(this.dashboardSessionService)) {
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

    httpParams = appendProjectAccessParams(httpParams, this.dashboardSessionService);

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
