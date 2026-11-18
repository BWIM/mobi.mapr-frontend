import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Map as MapLibreMap, RequestParameters, ResourceType, StyleSpecification, SourceSpecification, LayerSpecification, LngLatBounds, FilterSpecification } from 'maplibre-gl';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { shareForbiddenFeature } from './share-access.service';
import { DashboardSessionService } from './dashboard-session.service';
import { appendProjectAccessParams, hasProjectAccess } from './project-access-params';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ProjectsService } from './project.service';
import { ScoreColorsService } from './score-colors.service';
import { TileTokenService } from './tile-token.service';
import {
  buildDifferenceFillColorExpression,
  buildDiffInSelectionExpression,
  buildHasDiffExpression,
  buildQualityDifferenceConfig,
  buildTimeDifferenceConfig,
  DifferenceColorConfig,
} from '../utils/difference-colors.util';
import { buildGradeColorExpression, buildGradeFilterExpression } from '../utils/grade.util';
import { buildBasemapStyle, moveBasemapLabelsToTop } from './basemap-style';

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

export const NO_DATA_SCORE = 15000;
/** Capped mobility time in minutes (NO_DATA_SCORE / 60). */
export const CAPPED_SCORE_MINUTES = NO_DATA_SCORE / 60;

export const CONTENT_LAYER_SOURCE = 'content-layer';
export const CONTENT_SOURCE_LAYER = 'geodata';

/**
 * Highest zoom the content tiles are requested at. Above it MapLibre overzooms the z12 tiles
 * (vector, so still sharp) instead of fetching 4x more tiles per zoom step from the backend.
 */
export const CONTENT_TILES_MAX_ZOOM = 12;
/** Germany (west, south, east, north): no content tiles are requested outside it. */
export const CONTENT_TILES_BOUNDS: [number, number, number, number] = [5.8, 47.2, 15.1, 55.1];

export interface FeatureInfoResponse {
  name: string;
  regiostar_name?: string | null;
  population: number;
  /** Absent for city districts (Stadtteile) treated as municipalities. */
  rank?: number | null;
  total_ranks?: number | null;
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

export interface MapViewport {
  zoom: number;
  lat: number;
  lng: number;
}

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private map: MapLibreMap | null = null;
  private compareRightMap: MapLibreMap | null = null;
  private mapStyleSubject = new BehaviorSubject<StyleSpecification>(this.getBaseMapStyle());
  mapStyle$: Observable<StyleSpecification> = this.mapStyleSubject.asObservable();
  private authService = inject(AuthService);
  private dashboardSessionService = inject(DashboardSessionService);
  private http = inject(HttpClient);
  private projectService = inject(ProjectsService);
  private scoreColorsService = inject(ScoreColorsService);
  private tileTokenService = inject(TileTokenService);
  private currentFilters: ContentLayerFilters | null = null;
  private hasInitialZoom = false; // Track if initial zoom to geolocation has occurred
  
  /** Current API profile_ids selection (subset of project base_profiles). */
  private _currentProfileIds = signal<number[] | null>(null);
  readonly currentProfileIds = this._currentProfileIds.asReadonly();

  // Signal to track map loading state
  private _isMapLoading = signal<boolean>(false);
  readonly isMapLoading = this._isMapLoading.asReadonly();

  /**
   * Last known viewport of the primary map (updated on moveend), or the viewport requested
   * before a map exists. New maps are created with this viewport.
   */
  private _viewport = signal<MapViewport | null>(null);
  readonly viewport = this._viewport.asReadonly();

  /** True when the project content layer has no tile features (e.g. scores not populated). */
  private _noProjectTiles = signal<boolean>(false);
  readonly noProjectTiles = this._noProjectTiles.asReadonly();

  constructor() {
    // Tiles requested while the tile token had lapsed got a 401; refetch them with the new token.
    this.tileTokenService.renewedAfterExpiry.subscribe(() => {
      for (const targetMap of [this.map, this.compareRightMap]) {
        const source = targetMap?.getSource(CONTENT_LAYER_SOURCE) as
          | { setTiles?: (tiles: string[]) => void; tiles?: string[] }
          | undefined;
        if (source?.setTiles && source.tiles) {
          source.setTiles([...source.tiles]);
        }
      }
    });
  }

  /**
   * MapLibre `transformRequest`: adds the short-lived tile token (`tt`) to content tile requests
   * of logged-in users. The token is not part of the source URL, so renewing it does not
   * change the style or reload the map. Share-key URLs are left as they are.
   */
  transformTileRequest(url: string, resourceType?: ResourceType): RequestParameters {
    if (resourceType !== 'Tile' || /[?&]key=/.test(url)) {
      return { url };
    }
    const match = /\/projects\/(\d+)\/(?:diff-)?tiles\/\d+\/\d+\/\d+\.pbf/.exec(url);
    if (!match) {
      return { url };
    }
    const tt = this.tileTokenService.current(Number(match[1]));
    if (!tt) {
      return { url };
    }
    const separator = url.includes('?') ? '&' : '?';
    return { url: `${url}${separator}tt=${encodeURIComponent(tt)}` };
  }

  /**
   * Logged-in users need a tile token for the current project before its tiles are requested.
   * Share viewers authenticate with their share key instead.
   */
  private async ensureTileAuth(): Promise<void> {
    if (this.dashboardSessionService.getShareKey() || !this.authService.isLoggedIn()) {
      return;
    }
    const projectId = Number(this.getEffectiveProjectId());
    if (Number.isInteger(projectId) && projectId > 0) {
      await this.tileTokenService.ensure(projectId);
    }
  }

  private getLegendBracketFilterExpression(filters: ContentLayerFilters): any[] | null {
    if (filters.feature_type === 'index') {
      const selected = filters.selected_quality_brackets ?? ['A', 'B', 'C', 'D', 'E', 'F'];
      if (selected.length === 0) {
        return ['==', ['get', 'id'], -1];
      }
      if (selected.length === 6) {
        return null;
      }

      return ['any', ...selected.map(bracket => buildGradeFilterExpression(bracket))];
    }

    const allBracketIds = this.scoreColorsService.bracketIds();
    const selected = filters.selected_time_brackets ?? allBracketIds;
    return this.scoreColorsService.buildBracketFilter(selected) as any[] | null;
  }

  setMap(map: MapLibreMap | null): void {
    this.map = map;
  }

  /** Records the viewport of the primary map. Call after the user (or code) moved it. */
  reportViewport(targetMap: MapLibreMap): void {
    if (targetMap !== this.map) {
      return;
    }
    const center = targetMap.getCenter();
    const next: MapViewport = { zoom: targetMap.getZoom(), lat: center.lat, lng: center.lng };
    const current = this._viewport();
    if (
      current &&
      Math.abs(current.zoom - next.zoom) < 1e-3 &&
      Math.abs(current.lat - next.lat) < 1e-6 &&
      Math.abs(current.lng - next.lng) < 1e-6
    ) {
      return;
    }
    this._viewport.set(next);
  }

  /** Moves the map to the viewport (or remembers it for the next map that is created). */
  requestViewport(viewport: MapViewport): void {
    this._viewport.set({ ...viewport });
    this.map?.jumpTo({ center: [viewport.lng, viewport.lat], zoom: viewport.zoom });
  }

  getMap(): MapLibreMap | null {
    return this.map;
  }

  setCompareRightMap(map: MapLibreMap | null): void {
    this.compareRightMap = map;
  }

  getCompareRightMap(): MapLibreMap | null {
    return this.compareRightMap;
  }

  hasCompareMaps(): boolean {
    return this.map !== null && this.compareRightMap !== null;
  }

  clearCompareMaps(): void {
    this.compareRightMap = null;
  }


  getDifferenceColorConfig(featureType: 'index' | 'score'): DifferenceColorConfig | null {
    if (featureType === 'score') {
      const scoreConfig = this.scoreColorsService.getConfig();
      return scoreConfig ? buildTimeDifferenceConfig(scoreConfig) : null;
    }
    return buildQualityDifferenceConfig();
  }

  /** True when the map's content source serves server-side difference tiles. */
  hasDifferenceLayers(targetMap: MapLibreMap = this.map as MapLibreMap): boolean {
    return !!targetMap && (this.getCurrentContentLayerTileUrl(targetMap)?.includes('/diff-tiles/') ?? false);
  }

  private resolveDifferenceSelectedBracketIds(
    filters: ContentLayerFilters,
    config: DifferenceColorConfig
  ): string[] {
    if (filters.feature_type === 'index') {
      return filters.selected_quality_brackets?.length
        ? [...filters.selected_quality_brackets]
        : config.steps.map((step) => step.bracketId);
    }
    const allIds = config.steps.map((step) => step.bracketId);
    return filters.selected_time_brackets?.length
      ? [...filters.selected_time_brackets]
      : allIds;
  }

  async loadDifferenceLayersOnMap(
    targetMap : MapLibreMap,
    leftFilters: ContentLayerFilters,
    rightFilters: ContentLayerFilters,
    zoomToBounds: boolean = false
  ): Promise<boolean> {
    const diffTileUrl = this.buildDiffTileUrlForFilters(leftFilters, rightFilters);

    if (!leftFilters.profile_ids?.length || !rightFilters.profile_ids?.length) {
      console.warn('Cannot load difference layers: profile_ids required on both sides');
      return false;
    }
    if (!diffTileUrl) {
      console.warn('Cannot load difference layers: Invalid tile URL');
      return false;
    }

    const colorConfig = this.getDifferenceColorConfig(leftFilters.feature_type);
    if (!colorConfig) {
      console.warn('Cannot load difference layers: missing difference color config');
      return false;
    }

    await this.ensureTileAuth();

    if (zoomToBounds) {
      await this.zoomToContentLayerBoundsForMap(targetMap, leftFilters, false);
    }

    this.syncContentLayerState(leftFilters);

    const updatedStyle = this.buildStyleWithDifferenceLayers(
      leftFilters,
      rightFilters,
      colorConfig,
      this.getBaseMapStyle()
    );

    await this.waitForMapStyleLoad(targetMap, () => {
      targetMap.setStyle(updatedStyle);
    });

    if (targetMap === this.map) {
      this.mapStyleSubject.next(updatedStyle);
    }

    return true;
  }

  async updateDifferenceLayersOnMap(
    targetMap : MapLibreMap,
    leftFilters: ContentLayerFilters,
    rightFilters: ContentLayerFilters
  ): Promise<void> {
    const diffTileUrl = this.buildDiffTileUrlForFilters(leftFilters, rightFilters);
    if (!diffTileUrl) {
      console.warn('Cannot update difference layers: Invalid tile URL');
      return;
    }

    // Tile URL (profiles/filters) or metric changed: reload the style so the new tiles are fetched.
    const tileUrlChanged = this.getCurrentContentLayerTileUrl(targetMap) !== diffTileUrl;
    const featureTypeChanged = this.currentFilters?.feature_type !== leftFilters.feature_type;

    if (tileUrlChanged || featureTypeChanged) {
      await this.loadDifferenceLayersOnMap(targetMap, leftFilters, rightFilters, false);
      return;
    }

    const colorConfig = this.getDifferenceColorConfig(leftFilters.feature_type);
    if (!colorConfig) {
      return;
    }

    // Only the bracket selection changed: restyle in place (no tile reload).
    this.syncContentLayerState(leftFilters);
    this.applyDifferenceLayerStyleToMap(targetMap, leftFilters, colorConfig);
  }

  private applyDifferenceLayerStyleToMap(
    targetMap : MapLibreMap,
    filters: ContentLayerFilters,
    colorConfig: DifferenceColorConfig
  ): void {
    const fillColorExpression = buildDifferenceFillColorExpression(colorConfig, filters.feature_type);
    const outlineColorExpression = this.getDarkenedColorExpression(fillColorExpression, 0.75);
    const fillOpacityExpression = this.getDifferenceFillOpacityExpression(filters, colorConfig);
    const lineOpacityExpression = this.getDifferenceLineOpacityExpression(filters, colorConfig);

    if (targetMap.getLayer('content-layer-fill')) {
      targetMap.setPaintProperty('content-layer-fill', 'fill-color', fillColorExpression as any);
      targetMap.setPaintProperty('content-layer-fill', 'fill-opacity', fillOpacityExpression as any);
      targetMap.setFilter('content-layer-fill', null);
    }
    if (targetMap.getLayer('content-layer-outline')) {
      targetMap.setPaintProperty('content-layer-outline', 'line-color', outlineColorExpression as any);
      targetMap.setPaintProperty('content-layer-outline', 'line-opacity', lineOpacityExpression as any);
      targetMap.setFilter('content-layer-outline', null);
    }
  }

  /** Hidden without data on both sides, dimmed when outside the selected brackets. */
  private getDifferenceOpacityGate(
    filters: ContentLayerFilters,
    colorConfig: DifferenceColorConfig,
    baseOpacity: unknown[]
  ): unknown[] {
    const selectedBracketIds = this.resolveDifferenceSelectedBracketIds(filters, colorConfig);
    return [
      'case',
      ['!', buildHasDiffExpression(filters.feature_type)],
      0,
      ['!', buildDiffInSelectionExpression(colorConfig, filters.feature_type, selectedBracketIds)],
      0.12,
      baseOpacity,
    ];
  }

  private getDifferenceFillOpacityExpression(filters: ContentLayerFilters, colorConfig: DifferenceColorConfig): unknown[] {
    const hexOpacityExpression: unknown[] = [
      'interpolate',
      ['cubic-bezier', 0.26, 0.38, 0.82, 0.36],
      ['get', 'population'],
      0, 0.2,
      100, 0.5,
      1000, 0.8,
      5000, 0.9,
    ];
    const baseOpacity: unknown[] = [
      'case',
      ['==', ['get', 't'], 'h'],
      hexOpacityExpression,
      0.7,
    ];
    return this.getDifferenceOpacityGate(filters, colorConfig, baseOpacity);
  }

  private getDifferenceLineOpacityExpression(filters: ContentLayerFilters, colorConfig: DifferenceColorConfig): unknown[] {
    const hexOpacityExpression: unknown[] = [
      'interpolate',
      ['cubic-bezier', 0.26, 0.38, 0.82, 0.36],
      ['get', 'population'],
      0, 0.2,
      100, 0.5,
      1000, 0.8,
      5000, 0.9,
    ];
    const baseOpacity: unknown[] = [
      'case',
      ['==', ['get', 't'], 'h'],
      hexOpacityExpression,
      0.8,
    ];
    return this.getDifferenceOpacityGate(filters, colorConfig, baseOpacity);
  }

  private buildStyleWithDifferenceLayers(
    leftFilters: ContentLayerFilters,
    rightFilters: ContentLayerFilters,
    colorConfig: DifferenceColorConfig,
    baseStyle?: StyleSpecification
  ): StyleSpecification {
    const diffTileUrl = this.buildDiffTileUrlForFilters(leftFilters, rightFilters);
    const currentStyle = baseStyle ?? { ...this.mapStyleSubject.getValue() };
    const updatedStyle = { ...currentStyle, sources: { ...currentStyle.sources }, layers: [...currentStyle.layers] };

    delete updatedStyle.sources[CONTENT_LAYER_SOURCE];

    updatedStyle.layers = updatedStyle.layers.filter(
      (layer) =>
        layer.id !== 'content-layer-fill' &&
        layer.id !== 'content-layer-outline' &&
        layer.id !== 'content-layer-highlight' &&
        layer.id !== 'content-layer-selection'
    );

    if (!diffTileUrl) {
      return updatedStyle;
    }

    // One source: each feature carries left_* and right_* values, coloured by their difference.
    updatedStyle.sources[CONTENT_LAYER_SOURCE] = {
      type: 'vector',
      tiles: [diffTileUrl],
      minzoom: 0,
      maxzoom: CONTENT_TILES_MAX_ZOOM,
      bounds: CONTENT_TILES_BOUNDS,
      tileSize: 512,
    } as SourceSpecification;

    const fillColorExpression = buildDifferenceFillColorExpression(colorConfig, leftFilters.feature_type);
    const fillOpacityExpression = this.getDifferenceFillOpacityExpression(leftFilters, colorConfig);
    const lineOpacityExpression = this.getDifferenceLineOpacityExpression(leftFilters, colorConfig);

    updatedStyle.layers.push({
      id: 'content-layer-fill',
      type: 'fill',
      source: CONTENT_LAYER_SOURCE,
      'source-layer': CONTENT_SOURCE_LAYER,
      paint: {
        'fill-color': fillColorExpression as any,
        'fill-opacity': fillOpacityExpression as any,
      },
    } as LayerSpecification);

    const outlineColorExpression = this.getDarkenedColorExpression(fillColorExpression, 0.75);
    updatedStyle.layers.push({
      id: 'content-layer-outline',
      type: 'line',
      source: CONTENT_LAYER_SOURCE,
      'source-layer': CONTENT_SOURCE_LAYER,
      paint: {
        'line-color': outlineColorExpression,
        'line-width': 1,
        'line-opacity': lineOpacityExpression as any,
      },
    } as LayerSpecification);

    const darkenedColorExpression = this.getDarkenedColorExpression(fillColorExpression);
    updatedStyle.layers.push({
      id: 'content-layer-highlight',
      type: 'line',
      source: CONTENT_LAYER_SOURCE,
      'source-layer': CONTENT_SOURCE_LAYER,
      paint: {
        'line-color': darkenedColorExpression,
        'line-width': 2,
        'line-opacity': 1,
      },
      filter: ['==', ['get', 'name'], '__never_match__'],
    } as LayerSpecification);

    updatedStyle.layers.push({
      id: 'content-layer-selection',
      type: 'line',
      source: CONTENT_LAYER_SOURCE,
      'source-layer': CONTENT_SOURCE_LAYER,
      paint: {
        'line-color': '#FFFFFF',
        'line-width': 2,
        'line-opacity': 1,
      },
      filter: ['==', ['get', 'name'], '__never_match__'],
    } as LayerSpecification);

    return moveBasemapLabelsToTop(updatedStyle);
  }

  getBaseMapStyle(): StyleSpecification {
    return buildBasemapStyle();
  }

  updateStyle(style: StyleSpecification): void {
    this.mapStyleSubject.next(style);
    if (this.map) {
      this.map.setStyle(style);
    }
  }

  getMinimapConfig(): any {
    const basemapStyle = buildBasemapStyle({ hideLabels: true });
    // maplibregl-minimap bundles MapLibre 2, which rejects multi-sprite arrays.
    // Labels are hidden anyway, so sprites are unused.
    const { sprite: _sprite, ...minimapStyle } = basemapStyle;

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
      style: minimapStyle,
    };
  }

  /**
   * Builds the tile URL with query parameters for the content layer.
   * Tiles always use the stored project mix — do not send persona_id.
   */
  private buildTileUrl(projectId: string, filters: ContentLayerFilters, compareProfileIds?: number[]): string {
    if (!projectId || !filters.profile_ids?.length) {
      return '';
    }

    const isDiff = !!compareProfileIds?.length;
    const tilePath = isDiff ? 'diff-tiles' : 'tiles';
    const baseUrl = `${environment.apiUrl}/projects/${projectId}/${tilePath}/{z}/{x}/{y}.pbf`;
    const params: string[] = [];

    params.push(`profile_ids=${filters.profile_ids.join(',')}`);
    if (isDiff) {
      params.push(`compare_profile_ids=${compareProfileIds.join(',')}`);
    }

    // Optional parameters - only add if they have values
    if (filters.state_ids && filters.state_ids.length > 0) {
      params.push(`state_ids=${filters.state_ids.join(',')}`);
    }

    if (filters.category_ids && filters.category_ids.length > 0) {
      params.push(`category_ids=${filters.category_ids.join(',')}`);
    }

    if (filters.regiostar_ids && filters.regiostar_ids.length > 0) {
      params.push(`regiostar_ids=${filters.regiostar_ids.join(',')}`);
    }

    if (filters.admin_level) {
      params.push(`admin_level=${filters.admin_level}`);
    }

    // Feature type (required for normal tiles; diff tiles always carry score and index)
    if (!isDiff) {
      params.push(`feature_type=${filters.feature_type}`);
    }

    // Tiles require a share key or a login (401/403 otherwise). Share viewers always use their
    // key, since it decides which projects and profiles they may see. Logged-in users get the
    // short-lived tile token added per request (transformTileRequest), never the access JWT.
    const shareKey = this.dashboardSessionService.getShareKey();
    if (shareKey) {
      params.push(`key=${encodeURIComponent(shareKey)}`);
    } else if (!this.authService.isLoggedIn()) {
      return '';
    }

    return `${baseUrl}?${params.join('&')}`;
  }

  /**
   * Sets the map loading state
   */
  setMapLoading(loading: boolean): void {
    this._isMapLoading.set(loading);
    if (loading) {
      this._noProjectTiles.set(false);
    }
  }

  setNoProjectTiles(empty: boolean): void {
    this._noProjectTiles.set(empty);
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

      // Same auth as the tiles: share key, else the short-lived tile token (never the JWT).
      const shareKey = this.dashboardSessionService.getShareKey();
      if (shareKey) {
        params = params.set('key', shareKey);
      } else {
        const projectId = Number(this.getEffectiveProjectId());
        const tt = Number.isInteger(projectId) && projectId > 0
          ? await this.tileTokenService.ensure(projectId)
          : null;
        if (tt) {
          params = params.set('tt', tt);
        }
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
    targetMap : MapLibreMap,
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
      maxzoom: CONTENT_TILES_MAX_ZOOM,
      bounds: CONTENT_TILES_BOUNDS,
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

    return moveBasemapLabelsToTop(updatedStyle);
  }

  private getEffectiveProjectId(): string | null {
    return this.dashboardSessionService.getProjectId()
      ?? this.projectService.getProject()?.id?.toString()
      ?? null;
  }

  private buildTileUrlForFilters(filters: ContentLayerFilters, compareProfileIds?: number[]): string | null {
    const effectiveId = this.getEffectiveProjectId();

    if (!effectiveId || !filters.profile_ids?.length) {
      return null;
    }

    return this.buildTileUrl(effectiveId, filters, compareProfileIds) || null;
  }

  /**
   * Server-side difference tiles: `profile_ids` is the left side, `compare_profile_ids` the right.
   * All other filters are shared by both sides (they only differ in their transport modes).
   */
  private buildDiffTileUrlForFilters(
    leftFilters: ContentLayerFilters,
    rightFilters: ContentLayerFilters
  ): string | null {
    if (!rightFilters.profile_ids?.length) {
      return null;
    }
    return this.buildTileUrlForFilters(leftFilters, rightFilters.profile_ids);
  }

  private getCurrentContentLayerTileUrl(targetMap: MapLibreMap): string | null {
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
    targetMap : MapLibreMap,
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

    await this.ensureTileAuth();

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

  private waitForMapStyleLoad(targetMap : MapLibreMap, applyStyle: () => void): Promise<void> {
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
  async updateContentLayerOnMap(targetMap : MapLibreMap, filters: ContentLayerFilters): Promise<void> {
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

  private applyContentLayerStyleToMap(targetMap : MapLibreMap, filters: ContentLayerFilters): void {
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

    await this.ensureTileAuth();
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
    this._noProjectTiles.set(false);
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
    return this.scoreColorsService.buildMapLibreStepExpression();
  }

  /**
   * Returns a darkened copy of a fill color expression (multiply RGB channels by factor).
   * @param factor 1 = unchanged; 0.9 ≈ 10% darker (highlights); 0.75 ≈ 25% darker (outlines)
   */
  private getDarkenedColorExpression(baseExpression: any, factor = 0.9): any {
    if (!Array.isArray(baseExpression)) {
      if (
        typeof baseExpression === 'string' &&
        (baseExpression.startsWith('rgb') || baseExpression.startsWith('rgba'))
      ) {
        return this.darkenColor(baseExpression, factor);
      }
      return baseExpression;
    }

    if (baseExpression[0] === 'step' || baseExpression[0] === 'case') {
      const result = [baseExpression[0], baseExpression[1]];
      for (let i = 2; i < baseExpression.length; i++) {
        result.push(this.getDarkenedColorExpression(baseExpression[i], factor));
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

  /** Fill colour expression for the quality index; see buildGradeColorExpression in grade.util.ts. */
  private getIndexFillColorExpression(): any {
    return buildGradeColorExpression();
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
        if (shareForbiddenFeature(error) === 'export') {
          throw new Error('geojsonDownload.error.notAllowed');
        }
      }
      throw error instanceof Error ? error : new Error('Failed to export map data');
    }
  }
}
