import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import WebGLVectorLayer from 'ol/layer/WebGLVector';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { fromLonLat } from 'ol/proj';
import GeoJSON from 'ol/format/GeoJSON';
import { Geometry } from 'ol/geom';
import { Style, Fill, Stroke } from 'ol/style';
import { MapService } from './map.service';
import { Subscription } from 'rxjs';
import { LegendComponent } from '../legend/legend.component';
import { CommonModule } from '@angular/common';
import { defaults as defaultControls, Zoom } from 'ol/control';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, LegendComponent],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css'
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private map!: Map;
  private vectorLayer!: WebGLVectorLayer<VectorSource>;
  private baseLayer!: TileLayer<XYZ>;
  private lastClickedFeature: Feature | null = null;
  private subscriptions: Subscription[] = [];

  constructor(private mapService: MapService) {}

  ngAfterViewInit() {
    this.initMap();
    this.setupSubscriptions();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private setupSubscriptions(): void {
    this.subscriptions.push(
      this.mapService.features$.subscribe(features => {
        this.addFeatures(features);
      }),
      this.mapService.resetMap$.subscribe(() => {
        this.resetMap();
      })
    );
  }

  private initMap(): void {
    this.initializeLayers();
    this.map = new Map({
      target: 'map',
      layers: [this.baseLayer, this.vectorLayer],
      view: new View({
        center: fromLonLat([8.5, 49.05]), // Zentrum von Ba-Wü
        zoom: 9
      })
    });

    this.setupMapInteractions();
  }

  private initializeLayers(): void {
    // Base Layer initialisieren
    this.baseLayer = new TileLayer({
      source: new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      })
    });

    // WebGL Vector Layer mit Standard-Styling
    this.vectorLayer = new WebGLVectorLayer({
      source: new VectorSource(),
      style: {
        'stroke-color': [0, 0, 0, 0.1],
        'stroke-width': ['get', 'border_width'],
        'fill-color': ['get', 'rgbColor']
      }
    });
  }

  private setupMapInteractions(): void {
    // Click-Handler für Features
    this.map.on('click', (event) => {
      this.map.forEachFeatureAtPixel(event.pixel, (feature) => {
        if (feature instanceof Feature) {
          if (this.lastClickedFeature) {
            this.resetFeatureStyle(this.lastClickedFeature);
          }
          this.highlightFeature(feature as Feature<Geometry>);
          this.lastClickedFeature = feature;
        }
      });
    });

    // Hover-Effekt für Features
    this.map.on('pointermove', (event) => {
      const pixel = event.pixel;
      const hit = this.map.hasFeatureAtPixel(pixel);
      this.map.getTargetElement().style.cursor = hit ? 'pointer' : '';
    });
  }

  // Hilfsfunktionen für Feature-Styling
  private hexToRgb(hex: string): number[] {
    hex = hex.replace('#', '');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r, g, b];
  }

  private hexToRgba(hex: string, opacity: number): [number, number, number, number] {
    const rgb = this.hexToRgb(hex);
    return [rgb[0], rgb[1], rgb[2], opacity];
  }

  // Feature zur Karte hinzufügen
  public addFeatures(features: any[]): void {
    if (!this.vectorLayer) return;

    const vectorSource = this.vectorLayer.getSource();
    if (!vectorSource) return;

    features.forEach(feature => {
      const olFeature = new GeoJSON().readFeature(feature, {
        featureProjection: this.map.getView().getProjection()
      }) as Feature<Geometry>;

      const color = olFeature.get('color');
      const opacity = olFeature.get('opacity') || 0;
      const border_width = olFeature.get('border_width') || 0.1;

      if (color) {
        const rgbColor = this.hexToRgba(color, opacity);
        olFeature.setProperties({
          rgbColor: rgbColor,
          opacity: opacity,
          border_width: border_width
        });
      }

      vectorSource.addFeature(olFeature);
    });

    this.zoomToFeatures();
  }

  private zoomToFeatures(): void {
    const vectorSource = this.vectorLayer.getSource();
    if (!vectorSource || vectorSource.getFeatures().length === 0) return;

    const extent = vectorSource.getExtent();
    this.map.getView().fit(extent, {
      duration: 1000,
      padding: [200,200,200,200]
    });
  }

  private highlightFeature(feature: Feature<Geometry>): void {
    const properties = feature.getProperties();
    const color = properties['color'] || '#ffffff';
    const opacity = properties['opacity'] || 1;

    feature.setStyle(new Style({
      stroke: new Stroke({
        color: '#4a90e2',
        width: 2
      }),
      fill: new Fill({
        color: `rgba(${this.hexToRgb(color)}, ${opacity})`
      })
    }));
  }

  private resetFeatureStyle(feature: Feature<Geometry>): void {
    feature.setStyle(undefined); // Zurück zum Standard-WebGL-Style
  }

  // Karte zurücksetzen
  public resetMap(): void {
    if (this.vectorLayer && this.vectorLayer.getSource()) {
      this.vectorLayer.getSource()?.clear();
      this.lastClickedFeature = null;
    }
  }
}
