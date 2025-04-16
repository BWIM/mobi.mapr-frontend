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
import { ProjectsService } from '../projects/projects.service';
import { AnalyzeService } from '../analyze/analyze.service';
import { FeatureSelectionService } from '../shared/services/feature-selection.service';

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
  private lastClickedFeature: Feature | null = null;
  private subscriptions: Subscription[] = [];
  private landkreise: { [key: string]: any } | null = null;
  private tooltip!: HTMLElement;
  private level: 'state' | 'county' | 'municipality' | 'hexagon' = 'county';

  constructor(
    private mapService: MapService,
    private mapBuildService: MapBuildService,
    private projectsService: ProjectsService,
    private analyzeService: AnalyzeService,
    private featureSelectionService: FeatureSelectionService
  ) {}

  ngAfterViewInit() {
    this.initMap();
    this.setupSubscriptions();
    this.setupTooltip();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.mapService.setMap(null);
    this.mapService.setMainLayer(null);
  }

  private setupSubscriptions(): void {
    this.subscriptions.push(
      this.mapService.features$.subscribe(async features => {
        this.mapBuildService.resetCache();
        this.landkreise = features;
        
        // First zoom out to county level to prevent unnecessary hexagon calculations
        const view = this.map.getView();
        const currentZoom = view.getZoom();
        if (currentZoom && currentZoom >= 9) {
          view.setZoom(8); // Zoom out to county level
        }
        
        // Then update features and zoom to them
        await this.updateMapFeatures().then(() => {
          this.zoomToFeatures();
          
        });
      }),
      this.mapService.resetMap$.subscribe(() => {
        this.resetMap();
      }),
      this.mapService.visualizationSettings$.subscribe(async () => {
        if (this.landkreise) {
          await this.updateMapFeatures();
        }
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

    if (zoom >= 11) {
      this.level = 'hexagon';
    } else if (zoom >= 9) {
      this.level = 'municipality';
    } else if (zoom >= 8) {
      this.level = 'county';
    } else {
      this.level = 'state';
    }

    // Get current viewport extent
    const extent = this.map.getView().calculateExtent(this.map.getSize());

    const geojson = await this.mapBuildService.buildMap(this.landkreise, this.level, extent);

    if (geojson && geojson.features) {
      vectorSource.clear();
      
      const features = geojson.features.map(feature => {
        const olFeature = new GeoJSON().readFeature(feature, {
          featureProjection: this.map.getView().getProjection()
        }) as Feature<Geometry>;
        
        olFeature.set('rgbColor', feature.properties.rgbColor);
        
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

  private zoomToFeatures(): void {
    const vectorSource = this.vectorLayer.getSource();
    if (!vectorSource || vectorSource.getFeatures().length === 0) return;

    const extent = vectorSource.getExtent();
    this.map.getView().fit(extent, {
      duration: 1000,
      padding: [200,200,200,200]
    });
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

  private setupTooltip(): void {
    this.tooltip = document.getElementById('tooltip') as HTMLElement;
    
    // Add click handler
    this.map.on('click', (event) => {
      let clickedFeature: Feature | null = null;
      
      this.map.forEachFeatureAtPixel(event.pixel, (feature) => {
        if (feature instanceof Feature) {
          this.lastClickedFeature = feature;
          clickedFeature = feature;

          this.analyzeService.setMapType(this.level);
          
          // Öffne Analyse-Dialog wenn ein Feature geklickt wurde
          this.analyzeService.setSelectedFeature(feature);
        }
      });

      // Wenn kein Feature geklickt wurde, setzen wir null
      this.featureSelectionService.setSelectedFeature(clickedFeature);
    });

    // Existing pointer move handler
    this.map.on('pointermove', (evt) => {
      const pixel = this.map.getEventPixel(evt.originalEvent);
      const hit = this.map.hasFeatureAtPixel(pixel);
      
      if (hit) {
        const feature = this.map.forEachFeatureAtPixel(pixel, (feature) => feature);
        if (feature) {
          const properties = feature.getProperties();
          const name = properties['name'] || 'N/A';
          const score = properties['score'] !== undefined ? (properties['score'] * 100).toFixed(1) : 'N/A';
          
          this.tooltip.innerHTML = `${name}<br>Score: ${score}%`;
          this.tooltip.style.display = 'block';
          this.tooltip.style.left = `${pixel[0] + 10}px`;
          this.tooltip.style.top = `${pixel[1] + 10}px`;
        }
      } else {
        this.tooltip.style.display = 'none';
      }
      
      // Change cursor style
      const mapElement = document.getElementById('map');
      if (mapElement) {
        mapElement.style.cursor = hit ? 'pointer' : '';
      }
    });
    
    // Hide tooltip when moving the map
    this.map.on('movestart', () => {
      this.tooltip.style.display = 'none';
    });
  }

}
