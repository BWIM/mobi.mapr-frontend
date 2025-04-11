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
import { MapService } from './map.service';
import { Subscription } from 'rxjs';
import { LegendComponent } from '../legend/legend.component';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared/shared.module';
import { VisualizationOverlayComponent } from './visualization-overlay/visualization-overlay.component';
import { MapBuildService } from './map-build.service';
import { Extent } from 'ol/extent';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [
    CommonModule,
    LegendComponent,
    SharedModule,
    VisualizationOverlayComponent
  ],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css'
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private map!: Map;
  private vectorLayer!: WebGLVectorLayer<VectorSource>;
  private baseLayer!: TileLayer<XYZ>;
  private subscriptions: Subscription[] = [];
  private landkreise: { [key: string]: any } | null = null;

  constructor(
    private mapService: MapService,
    private mapBuildService: MapBuildService
  ) {}

  ngAfterViewInit() {
    this.initMap();
    this.setupSubscriptions();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.mapService.setMap(null);
    this.mapService.setMainLayer(null);
  }

  private setupSubscriptions(): void {
    this.subscriptions.push(
      this.mapService.features$.subscribe(async features => {
        this.landkreise = features;
        await this.updateMapFeatures();
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
        center: fromLonLat([8.5, 49.05]),
        zoom: 7,
        minZoom: 7,
        maxZoom: 15,
        constrainResolution: true
      })
    });

    this.mapService.setMap(this.map);
    this.mapService.setMainLayer(this.vectorLayer);

    // Update features when zoom changes or view moves
    this.map.getView().on('change:resolution', async () => {
      await this.updateMapFeatures();
    });
    
    this.map.getView().on('change:center', async () => {
      await this.updateMapFeatures();
    });
  }

  private initializeLayers(): void {
    this.baseLayer = new TileLayer({
      source: new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        crossOrigin: 'anonymous'
      })
    });

    this.vectorLayer = new WebGLVectorLayer({
      source: new VectorSource({
        format: new GeoJSON()
      }),
      style: {
        'stroke-color': [0, 0, 0, 0.1],
        'stroke-width': 0.1,
        'fill-color': ['get', 'rgbColor']
      }
    });
  }

  private async updateMapFeatures(): Promise<void> {
    if (!this.landkreise) return;
    
    const zoom = this.map.getView().getZoom();
    if (!zoom) return;

    const vectorSource = this.vectorLayer.getSource();
    if (!vectorSource) return;

    let level: 'county' | 'municipality' | 'hexagon';
    if (zoom >= 12) {
      level = 'hexagon';
    } else if (zoom >= 10) {
      level = 'municipality';
    } else {
      level = 'county';
    }

    // Get current viewport extent
    const extent = this.map.getView().calculateExtent(this.map.getSize());

    const geojson = await this.mapBuildService.buildMap(this.landkreise, level, extent);

    if (geojson && geojson.features) {
      vectorSource.clear();
      
      const features = geojson.features.map(feature => {
        const olFeature = new GeoJSON().readFeature(feature, {
          featureProjection: this.map.getView().getProjection()
        });
        return olFeature;
      });

      vectorSource.addFeatures(features as Feature<Geometry>[]);
    }
  }

  public resetMap(): void {
    if (this.vectorLayer && this.vectorLayer.getSource()) {
      this.vectorLayer.getSource()?.clear();
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
