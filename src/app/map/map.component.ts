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
import { FeatureSelectionService } from '../shared/services/feature-selection.service';
import { AnalyzeService } from '../analyze/analyze.service';

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

  constructor(
    private mapService: MapService,
    private featureSelectionService: FeatureSelectionService,
    private analyzeService: AnalyzeService
  ) {}

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
        attributions: undefined,
      })
    });

    // WebGL Vector Layer mit Standard-Styling
    this.vectorLayer = new WebGLVectorLayer({
      source: new VectorSource(),
      style: {
        'stroke-color': [
          'interpolate',
          ['linear'],
          ['get', 'selected'],
          0, [0, 0, 0, 0.1],
          1, [67, 49, 67, 1]
        ],
        'stroke-width': [
          'interpolate',
          ['linear'],
          ['get', 'selected'],
          0, ['get', 'border_width'],
          1, 2
        ],
        'fill-color': ['get', 'rgbColor']
      }
    });
  }

  private setupMapInteractions(): void {
    // Click-Handler für Features
    this.map.on('click', (event) => {
      let clickedFeature: Feature | null = null;
      
      this.map.forEachFeatureAtPixel(event.pixel, (feature) => {
        if (feature instanceof Feature) {
          if (this.lastClickedFeature) {
            this.resetFeatureStyle(this.lastClickedFeature);
          }
          this.highlightFeature(feature as Feature<Geometry>);
          this.lastClickedFeature = feature;
          clickedFeature = feature;
          
          // Öffne Analyse-Dialog wenn ein Feature geklickt wurde
          this.analyzeService.setSelectedFeature(feature);
        }
      });

      // Wenn kein Feature geklickt wurde, setzen wir null
      this.featureSelectionService.setSelectedFeature(clickedFeature);
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
    if (this.lastClickedFeature) {
      this.lastClickedFeature.set('selected', false);
    }
    feature.set('selected', true);
    this.vectorLayer.changed();
  }

  private resetFeatureStyle(feature: Feature<Geometry>): void {
    feature.set('selected', false);
    this.vectorLayer.changed();
  }

  // Karte zurücksetzen
  public resetMap(): void {
    if (this.vectorLayer && this.vectorLayer.getSource()) {
      this.vectorLayer.getSource()?.clear();
      this.lastClickedFeature = null;
    }
  }
}
