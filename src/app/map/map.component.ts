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
import { LoadingService } from '../services/loading.service';

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
  private hiddenCountyLayer!: WebGLVectorLayer<VectorSource>;
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
    private featureSelectionService: FeatureSelectionService,
    private loadingService: LoadingService
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
        this.loadingService.startLoading(); // Start loading when new features arrive
        
        // Reset cache and clear layers, but don't reset view
        this.mapBuildService.resetCache();
        if (this.vectorLayer && this.vectorLayer.getSource()) {
          this.vectorLayer.getSource()?.clear();
        }
        if (this.hiddenCountyLayer && this.hiddenCountyLayer.getSource()) {
          this.hiddenCountyLayer.getSource()?.clear();
        }
        
        // Then set new features and update
        this.landkreise = features;
        
        try {
          // Update features
          await this.updateMapFeatures();
          
          // Ensure we have a clean state before zooming
          await new Promise(resolve => setTimeout(resolve, 250));
          
          // Now zoom to the features
          this.zoomToFeatures();
          this.loadingService.stopLoading();
        } catch (error) {
          console.error('Error updating features:', error);
          this.loadingService.stopLoading();
        }
      }),
      this.mapService.resetMap$.subscribe(async () => {
        await this.resetMap(true); // Pass true to indicate we want to reset view
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
    this.initializeMapInstance();
    this.setupMapEventHandlers();
    this.setupMapServices();
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

    // Add hidden county layer
    this.hiddenCountyLayer = new WebGLVectorLayer({
      source: new VectorSource({
        format: new GeoJSON()
      }),
      visible: false,  // Make it invisible
      style: {
        'stroke-color': [0, 0, 0, 0],
        'stroke-width': 0,
        'fill-color': [0, 0, 0, 0]
      }
    });
  }

  private initializeMapInstance(): void {
    this.map = new Map({
      target: 'map',
      layers: [this.baseLayer, this.vectorLayer, this.hiddenCountyLayer],  // Add hiddenCountyLayer
      view: new View({
        center: fromLonLat([8.5, 49.05]),
        zoom: 7,
        minZoom: 5,
        constrainResolution: true
      })
    });
  }

  private setupMapEventHandlers(): void {
    // Debounced view change handler to prevent too many updates
    let debounceTimeout: number;
    const handleViewChange = () => {
      if (debounceTimeout) {
        window.clearTimeout(debounceTimeout);
        this.loadingService.stopLoading(); // Stop loading if there was a pending update
      }
      this.loadingService.startLoading();
      debounceTimeout = window.setTimeout(async () => {
        await this.updateMapFeatures();
      }, 100);
    };

    this.map.getView().on('change:resolution', handleViewChange);
    this.map.getView().on('change:center', handleViewChange);
  }

  private setupMapServices(): void {
    this.mapService.setMap(this.map);
    this.mapService.setMainLayer(this.vectorLayer);
  }

  private async updateMapFeatures(): Promise<void> {
    if (!this.landkreise) {
      this.loadingService.stopLoading();
      return;
    }
    
    const zoom = this.map.getView().getZoom();
    if (!zoom) {
      this.loadingService.stopLoading();
      return;
    }

    const vectorSource = this.vectorLayer.getSource();
    const hiddenSource = this.hiddenCountyLayer.getSource();
    if (!vectorSource || !hiddenSource) {
      this.loadingService.stopLoading();
      return;
    }

    try {
      const level = this.determineFeatureLevel(zoom);
      
      // Always ensure we have counties in the hidden layer if needed
      if (level !== 'state' && hiddenSource.getFeatures().length === 0) {
        console.log('Loading counties into hidden layer');
        const countyGeojson = await this.mapBuildService.buildMap(this.landkreise, 'county');
        if (countyGeojson?.features) {
          await this.updateHiddenLayerFeatures(countyGeojson, 'county');
        }
      }

      // Only update if the zoom drastically changed
      if (level !== this.level) {
        console.log('level changed from', this.level, 'to', level);
        this.level = level;
        const extent = this.map.getView().calculateExtent(this.map.getSize());
        
        let geojson;
        if (level === 'state') {
          // For state level, we don't need to filter by visible counties
          geojson = await this.mapBuildService.buildMap(this.landkreise, level);
        } else {
          // For other levels, use visible counties from hidden layer
          const hiddenFeatures = hiddenSource.getFeaturesInExtent(extent);
          const hiddenIds = hiddenFeatures.map(feature => feature.get('ars') as string);
          
          if (hiddenIds.length === 0) {
            console.warn('No visible counties found for level', level);
            this.loadingService.stopLoading();
            return;
          }

          geojson = await this.mapBuildService.buildMap(
            this.landkreise, 
            level, 
            hiddenFeatures.length > 0 ? hiddenFeatures : undefined
          );
        }

        if (geojson?.features) {
          await this.updateVectorLayerFeatures(geojson, level);
          
          // If we're at county level, update the hidden layer
          if (level === 'county') {
            await this.updateHiddenLayerFeatures(geojson, level);
          }
        }
      } else {
        // When just moving/panning, use hidden layer to determine which features to show
        const extent = this.map.getView().calculateExtent(this.map.getSize());
        const hiddenFeatures = hiddenSource.getFeaturesInExtent(extent);
        const hiddenIds = hiddenFeatures.map(feature => feature.get('ars') as string);
        const visibleIds = vectorSource.getFeatures().map(feature => feature.get('ars') as string);

        // Only update if the visible features have changed
        if (hiddenIds.sort().join(',') !== visibleIds.sort().join(',')) {
          if (hiddenFeatures.length > 0) {
            const geojson = await this.mapBuildService.buildMap(
              this.landkreise, 
              level, 
              hiddenFeatures
            );
  
            if (geojson?.features) {
              await this.updateVectorLayerFeatures(geojson, level);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error updating map features:', error);
    } finally {
      this.loadingService.stopLoading();
    }
  }

  private determineFeatureLevel(zoom: number): 'state' | 'county' | 'municipality' | 'hexagon' {
    if (zoom >= 11) return 'hexagon';
    if (zoom >= 9) return 'municipality';
    if (zoom >= 8) return 'county';
    return 'state';
  }

  private async updateVectorLayerFeatures(geojson: any, level: 'state' | 'county' | 'municipality' | 'hexagon'): Promise<void> {
    const vectorSource = this.vectorLayer.getSource();
    if (!vectorSource) return;

    vectorSource.clear();
    
    const features = geojson.features.map((feature: { properties: { rgbColor: number[] } }) => {
      const olFeature = new GeoJSON().readFeature(feature, {
        featureProjection: this.map.getView().getProjection()
      }) as Feature<Geometry>;
      
      olFeature.set('rgbColor', feature.properties.rgbColor);
      olFeature.set('level', level);
      
      return olFeature;
    });

    vectorSource.addFeatures(features as Feature<Geometry>[]);
  }

  private async updateHiddenLayerFeatures(geojson: any, level: 'state' | 'county' | 'municipality' | 'hexagon'): Promise<void> {
    const hiddenSource = this.hiddenCountyLayer.getSource();
    if (!hiddenSource) return;
    
    hiddenSource.clear();
    
    const features = geojson.features.map((feature: any) => {
      const olFeature = new GeoJSON().readFeature(feature, {
        featureProjection: this.map.getView().getProjection()
      }) as Feature<Geometry>;
      
      // Copy all properties
      Object.keys(feature.properties).forEach(key => {
        olFeature.set(key, feature.properties[key]);
      });
      
      return olFeature;
    });

    hiddenSource.addFeatures(features as Feature<Geometry>[]);
  }

  public async resetMap(resetView: boolean = false): Promise<void> {
    // Reset cache first
    this.mapBuildService.resetCache();
    
    // Clear both layers
    if (this.vectorLayer && this.vectorLayer.getSource()) {
      this.vectorLayer.getSource()?.clear();
    }
    if (this.hiddenCountyLayer && this.hiddenCountyLayer.getSource()) {
      this.hiddenCountyLayer.getSource()?.clear();
    }

    // Only reset the view if explicitly requested
    if (resetView) {
      const view = this.map.getView();
      view.setCenter(fromLonLat([8.5, 49.05]));
      view.setZoom(7);
      view.setRotation(0);
    }

    // Reset level
    this.level = 'county';

    // Ensure changes are applied
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private zoomToFeatures(): void {
    console.log('zoomToFeatures');
    const vectorSource = this.vectorLayer.getSource();
    if (!vectorSource || vectorSource.getFeatures().length === 0) {
      console.warn('No features to zoom to');
      return;
    }

    const extent = vectorSource.getExtent();
    if (!extent || extent.some(val => !isFinite(val))) {
      console.warn('Invalid extent', extent);
      return;
    }

    try {
      this.map.getView().fit(extent, {
        duration: 1000,
        padding: [50, 50, 50, 50],
        maxZoom: 10
      });
    } catch (error) {
      console.error('Error zooming to features:', error);
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
