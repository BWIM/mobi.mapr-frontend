import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Map, StyleSpecification, SourceSpecification, LayerSpecification } from 'maplibre-gl';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { DashboardSessionService } from './dashboard-session.service';

export interface ContentLayerFilters {
  profile_combination_id: number | null;
  state_ids?: number[];
  category_ids?: number[];
  persona_ids?: number[];
  regiotyp_id?: number | null;
  admin_level?: 'state' | 'county' | 'municipality' | 'hexagon';
  feature_type: 'index' | 'score';
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
  private currentFilters: ContentLayerFilters | null = null;

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
          maxzoom: 14
        } as SourceSpecification,
        'carto-labels': {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'],
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
        {
          id: 'carto-labels-layer',
          type: 'raster',
          source: 'carto-labels',
          minzoom: 0,
          maxzoom: 14
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

    if (filters.persona_ids && filters.persona_ids.length > 0) {
      params.push(`persona_ids=${filters.persona_ids.join(',')}`);
    }

    if (filters.regiotyp_id !== undefined && filters.regiotyp_id !== null) {
      params.push(`regiotyp_id=${filters.regiotyp_id}`);
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
   * Updates the content layer in the map style based on filter parameters
   */
  loadContentLayer(filters: ContentLayerFilters): void {
    const projectId = this.dashboardSessionService.getProjectId();
    
    if (!projectId) {
      console.warn('Cannot load content layer: No project ID available');
      return;
    }

    if (!filters.profile_combination_id) {
      console.warn('Cannot load content layer: profile_combination_id is required');
      return;
    }

    this.currentFilters = filters;
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

    // Remove existing content layer from layers array
    updatedStyle.layers = updatedStyle.layers.filter(
      layer => layer.id !== 'content-layer-fill' && layer.id !== 'content-layer-outline'
    );

    // Add the new content layer source
    updatedStyle.sources['content-layer'] = {
      type: 'vector',
      tiles: [tileUrl],
      minzoom: 0,
      maxzoom: 14,
      tileSize: 512
    } as SourceSpecification;

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

    // Ensure labels layer is on top
    const labelsLayerIndex = updatedStyle.layers.findIndex(layer => layer.id === 'carto-labels-layer');
    if (labelsLayerIndex !== -1) {
      const labelsLayer = updatedStyle.layers.splice(labelsLayerIndex, 1)[0];
      updatedStyle.layers.push(labelsLayer);
    }

    this.updateStyle(updatedStyle);
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

    // Remove content layer from layers array
    updatedStyle.layers = updatedStyle.layers.filter(
      layer => layer.id !== 'content-layer-fill' && layer.id !== 'content-layer-outline'
    );

    this.currentFilters = null;
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
   */
  private getScoreFillColorExpression(): any {
    return [
      'step',
      ['get', 'score'],
      'rgb(0, 60, 0)',      // < 10 min (deep dark green)
      600, 'rgb(0, 100, 0)',    // 10-20 min
      1200, 'rgb(0, 140, 0)',   // 20-30 min
      1800, 'rgb(133, 218, 133)', // 30-40 min (transition)
      2400, 'rgb(238, 61, 61)', // 40-50 min
      3000, 'rgb(201, 0, 0)',   // 50-60 min
      3600, 'rgb(126, 0, 0)'      // > 60 min (dark red)
    ];
  }

  /**
   * Returns the fill color expression for Index feature type
   */
  private getIndexFillColorExpression(): any {
    // Divide "index" by 100 before applying color breaks
    return [
      'case',
      ['<=', ['/', ['get', 'index'], 100], 0],
      'rgba(128, 128, 128, 0)',
      ['<=', ['/', ['get', 'index'], 100], 0.35],
      'rgba(50, 97, 45, 0.7)',
      ['<=', ['/', ['get', 'index'], 100], 0.5],
      'rgba(60, 176, 67, 0.7)',
      ['<=', ['/', ['get', 'index'], 100], 0.71],
      'rgba(238, 210, 2, 0.7)',
      ['<=', ['/', ['get', 'index'], 100], 1],
      'rgba(237, 112, 20, 0.7)',
      ['<=', ['/', ['get', 'index'], 100], 1.41],
      'rgba(194, 24, 7, 0.7)',
      'rgba(150, 86, 162, 0.7)'
    ];
  }
}
