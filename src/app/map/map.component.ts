import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import VectorImageLayer from 'ol/layer/VectorImage';
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
import { SharedModule } from '../shared/shared.module';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, LegendComponent, SharedModule],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css'
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private map!: Map;
  private vectorLayer!: VectorImageLayer<VectorSource>;
  private baseLayer!: TileLayer<XYZ>;
  private lastClickedFeature: Feature | null = null;
  private subscriptions: Subscription[] = [];
  private currentPropertyKey: string = 'pop_mean_color'; // Standardwert

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
    
    // Referenzen im MapService zurücksetzen
    this.mapService.setMap(null);
    this.mapService.setMainLayer(null);
  }

  private setupSubscriptions(): void {
    this.subscriptions.push(
      this.mapService.features$.subscribe(features => {
        this.addFeatures(features);
      }),
      this.mapService.resetMap$.subscribe(() => {
        this.resetMap();
      }),
      this.mapService.visualizationSettings$.subscribe(settings => {
        this.currentPropertyKey = settings.populationArea + "_" + settings.averageType + "_color";
        this.updateFeatureColors();
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
        zoom: 9,
        constrainResolution: true,
        smoothExtentConstraint: true,
        smoothResolutionConstraint: true
      })
    });

    // Registriere Map und Layer im MapService
    this.mapService.setMap(this.map);
    this.mapService.setMainLayer(this.vectorLayer);

    this.setupMapInteractions();
  }

  private initializeLayers(): void {
    // Base Layer initialisieren
    this.baseLayer = new TileLayer({
      source: new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        attributions: undefined,
        crossOrigin: 'anonymous'  // CORS aktivieren
      })
    });

    // Vector Layer mit optimiertem Styling
    this.vectorLayer = new VectorImageLayer({
      source: new VectorSource(),
      imageRatio: 2,
      renderBuffer: 200,
      declutter: true,
      style: (feature) => {
        const selected = feature.get('selected') || false;
        const rgbColor = feature.get('rgbColor');
        const borderWidth = feature.get('border_width') || 0.1;
        
        return new Style({
          stroke: new Stroke({
            color: selected ? [67, 49, 67, 1] : [0, 0, 0, 0.1],
            width: selected ? 2 : borderWidth
          }),
          fill: new Fill({
            color: rgbColor
          })
        });
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

  private updateFeatureColors(): void {
    const features = this.vectorLayer.getSource()?.getFeatures() || [];
    features.forEach(feature => {
      let color = feature.get(this.currentPropertyKey);
      if (!color) {
        color = feature.get('score_color');
      }
      const opacity = feature.get('opacity') || 0.5;
      if (color) {
        const rgbColor = this.hexToRgba(color, opacity);
        feature.set('rgbColor', rgbColor);
      }
    });
    
    this.vectorLayer.changed();
  }

  public addFeatures(features: any[]): void {
    try {
      if (!this.vectorLayer) return;

      const vectorSource = this.vectorLayer.getSource();
      if (!vectorSource) return;

      features.forEach(feature => {
        const olFeature = new GeoJSON().readFeature(feature, {
          featureProjection: this.map.getView().getProjection()
        }) as Feature<Geometry>;

        let color = olFeature.get(this.currentPropertyKey);
        if (!color) {
          color = olFeature.get('score_color');
        }
        const opacity = olFeature.get('opacity') || 0.5;
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
      vectorSource.changed();

      this.zoomToFeatures();
    }
    catch (error) {
      console.error(error);
    }
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

  zoomIn() {
    const view = this.map.getView();
    const zoom = view.getZoom();
    view.animate({
      zoom: zoom ? zoom + 1 : 1,
      duration: 250
    });
  }

  zoomOut() {
    const view = this.map.getView();
    const zoom = view.getZoom();
    view.animate({
      zoom: zoom ? zoom - 1 : 1,
      duration: 250
    });
  }
}
