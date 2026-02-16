import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Map, StyleSpecification, SourceSpecification, LayerSpecification } from 'maplibre-gl';

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private map: Map | null = null;
  private mapStyleSubject = new BehaviorSubject<StyleSpecification>(this.getBaseMapStyle());
  mapStyle$: Observable<StyleSpecification> = this.mapStyleSubject.asObservable();

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
      id: "myCustomMiniMap",
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
}
