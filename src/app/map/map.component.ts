import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { default as OlMap } from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import WebGLVectorLayer from 'ol/layer/WebGLVector';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { fromLonLat } from 'ol/proj';
import GeoJSON from 'ol/format/GeoJSON';
import { Geometry, Point } from 'ol/geom';
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
import { Style, Text, Fill, Stroke } from 'ol/style';
import VectorLayer from 'ol/layer/Vector';
import { KeyboardShortcutsService, ShortcutAction } from './keyboard-shortcuts.service';

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
  private map!: OlMap;
  private vectorLayer!: WebGLVectorLayer<VectorSource>;
  private baseLayer!: TileLayer<XYZ>;
  private hiddenCountyLayer!: WebGLVectorLayer<VectorSource>;
  private labelLayer!: VectorLayer<VectorSource>;
  private subscriptions: Subscription[] = [];
  private landkreise: { [key: string]: any } | null = null;
  private tooltip!: HTMLElement;
  private level: 'state' | 'county' | 'municipality' | 'hexagon' = 'county';

  constructor(
    private mapService: MapService,
    private mapBuildService: MapBuildService,
    private analyzeService: AnalyzeService,
    private featureSelectionService: FeatureSelectionService,
    private loadingService: LoadingService,
    private keyboardShortcutsService: KeyboardShortcutsService
  ) {
    // Subscribe to keyboard shortcuts
    this.subscriptions.push(
      this.keyboardShortcutsService.getShortcutStream().subscribe(action => {
        switch(action) {
          case ShortcutAction.ZOOM_TO_FEATURES:
            this.zoomToFeatures();
            break;
        }
      })
    );

    // Subscribe to frozen state changes
    this.subscriptions.push(
      this.keyboardShortcutsService.getFrozenStateStream().subscribe(isFrozen => {
        this.handleFrozenStateChange(isFrozen);
      })
    );
  }

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
        try {          
          // Reset cache and clear layers
          this.mapBuildService.resetCache();
          if (this.vectorLayer && this.vectorLayer.getSource()) {
            this.vectorLayer.getSource()?.clear();
          }
          if (this.hiddenCountyLayer && this.hiddenCountyLayer.getSource()) {
            this.hiddenCountyLayer.getSource()?.clear();
          }
          
          this.landkreise = features;
          
          if (this.landkreise) {
            // First load county level features
            const countyGeojson = await this.mapBuildService.buildMap(this.landkreise, 'county');
            if (countyGeojson?.features) {
              // If we have few enough features, we can zoom directly to county level
              if (countyGeojson.features.length <= 50) {
                await this.updateVectorLayerFeatures(countyGeojson, 'county');
                this.level = 'county';
              } else {
                // Otherwise, load state level for initial view
                const stateGeojson = await this.mapBuildService.buildMap(this.landkreise, 'state');
                if (stateGeojson?.features) {
                  await this.updateVectorLayerFeatures(stateGeojson, 'state');
                  this.level = 'state';
                }
              }
              
              // Ensure features are rendered before zooming
              await new Promise(resolve => setTimeout(resolve, 250));
              this.zoomToFeatures();
            }
          }
        } catch (error) {
          console.error('Error updating features:', error);
        } finally {
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
      }),
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

    // Add a new layer for labels when in frozen mode
    this.labelLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        return new Style({
          text: new Text({
            text: feature.get('labelText'),
            font: '10px Calibri,sans-serif',
            fill: new Fill({
              color: '#000'
            }),
            stroke: new Stroke({
              color: '#fff',
              width: 2
            }),
            offsetY: 0
          })
        });
      },
      visible: false
    });
  }

  private initializeMapInstance(): void {
    this.map = new OlMap({
      target: 'map',
      layers: [this.baseLayer, this.vectorLayer, this.hiddenCountyLayer, this.labelLayer],  // Add labelLayer
      view: new View({
        center: fromLonLat([8.5, 49.05]),
        zoom: 7,
        minZoom: 5,
        constrainResolution: true,
        enableRotation: false,
        constrainRotation: true
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

    // Add map dragging opacity handlers
    this.map.on('movestart', () => {
      this.setLowOpacity();
    });

    this.map.on('moveend', () => {
      this.resetOpacity();
    });
  }

  private setupMapServices(): void {
    this.mapService.setMap(this.map);
    this.mapService.setMainLayer(this.vectorLayer);
  }

  private async updateMapFeatures(): Promise<void> {
    try {
      if (!this.landkreise) {
        return;
      }
      
      const zoom = this.map.getView().getZoom();
      if (!zoom) {
        return;
      }

      const vectorSource = this.vectorLayer.getSource();
      const hiddenSource = this.hiddenCountyLayer.getSource();
      if (!vectorSource || !hiddenSource) {
        return;
      }

      this.loadingService.startLoading();

      const level = this.determineFeatureLevel(zoom);
      
      // Always ensure we have counties in the hidden layer if needed
      if (level !== 'state' && hiddenSource.getFeatures().length === 0) {
        const countyGeojson = await this.mapBuildService.buildMap(this.landkreise, 'county');
        if (countyGeojson?.features) {
          await this.updateHiddenLayerFeatures(countyGeojson, 'county');
        }
      }

      // Only update if the zoom drastically changed
      if (level !== this.level) {
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
      this.loadingService.stopLoadingAndReset();
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
    const vectorSource = this.vectorLayer.getSource();
    if (!vectorSource || vectorSource.getFeatures().length === 0) {
        console.warn('No features to zoom to');
        return;
    }

    let extent = vectorSource.getExtent();
    if (!extent || extent.some(val => !isFinite(val))) {
        console.warn('Invalid extent', extent);
        return;
    }

    try {
      const maxZoom = this.level === 'state' ? 8 : 10;
      this.map.getView().fit(extent, {
          duration: 1000,
          padding: [50, 50, 50, 50],
          maxZoom: maxZoom
      });
    } catch (error) {
        console.error('Error zooming to features:', error);
    } finally {
      this.loadingService.stopLoading();
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
          clickedFeature = feature;

          this.analyzeService.setMapType(this.level);
          
          // Öffne Analyse-Dialog wenn ein Feature geklickt wurde
          this.analyzeService.setSelectedFeature(feature);
        }
      });

      // Wenn kein Feature geklickt wurde, setzen wir null
      this.featureSelectionService.setSelectedFeature(clickedFeature);
    });

    // Modify the pointermove handler
    this.map.on('pointermove', (evt) => {
      // If frozen, don't update tooltip position
      if (this.keyboardShortcutsService.getIsFrozen()) return;

      const pixel = this.map.getEventPixel(evt.originalEvent);
      const hit = this.map.hasFeatureAtPixel(pixel);
      
      if (hit) {
        const feature = this.map.forEachFeatureAtPixel(pixel, (feature) => feature);
        if (feature) {
          const properties = feature.getProperties();
          const name = properties['name'] || 'N/A';

          const score_name = this.getScoreName(properties['score']);
          
          if (this.keyboardShortcutsService.getIsFrozen()) {
            this.tooltip.innerHTML = `${score_name}`;
          } else {
            this.tooltip.innerHTML = `${name}: ${score_name}`;
          }
          this.tooltip.style.display = 'block';
          this.tooltip.style.left = `${pixel[0] + 10}px`;
          this.tooltip.style.top = `${pixel[1] + 10}px`;
        }
      } else if (!this.keyboardShortcutsService.getIsFrozen()) {
        this.tooltip.style.display = 'none';
      }
      
      // Change cursor style
      const mapElement = document.getElementById('map');
      if (mapElement) {
        mapElement.style.cursor = hit ? 'pointer' : '';
      }
    });
    
    // Modify the movestart handler
    this.map.on('movestart', () => {
      if (!this.keyboardShortcutsService.getIsFrozen()) {
        this.tooltip.style.display = 'none';
      }
    });
  }

  private setLowOpacity(): void {
    const vectorLayer = this.mapService.getMainLayer();
    if (!vectorLayer) return;

    // Update the layer's style directly
    vectorLayer.setOpacity(0.5);
  }

  private resetOpacity(): void {
    const vectorLayer = this.mapService.getMainLayer();
    if (!vectorLayer) return;

    // Reset to original style
    vectorLayer.setOpacity(1);
  }

  private handleFrozenStateChange(isFrozen: boolean): void {
    if (isFrozen) {
      // Show labels for all visible features
      const vectorSource = this.vectorLayer.getSource();
      const labelSource = this.labelLayer.getSource();
      
      if (!vectorSource || !labelSource) return;
      
      // Clear any existing labels
      labelSource.clear();
      
      // Create label features
      const features = vectorSource.getFeatures();
      features.forEach(feature => {
        const properties = feature.getProperties();
        const score = properties['score'] !== undefined ? 
          (properties['score'] * 100).toFixed(0) : 'N/A';
        const score_name = this.getScoreName(properties['score']);
        
        // Create a point feature at the center of the original feature
        const geometry = feature.getGeometry();
        if (geometry) {
          const extent = geometry.getExtent();
          const centerX = (extent[0] + extent[2]) / 2;
          const centerY = (extent[1] + extent[3]) / 2;
          
          const labelFeature = new Feature({
            geometry: new Point([centerX, centerY]),
            labelText: `${score_name}`,
            ars: properties['ars']
          });
          
          labelSource.addFeature(labelFeature);
        }
      });
      
      // Show the label layer
      this.labelLayer.setVisible(true);
      
      // Hide the regular tooltip
      if (this.tooltip) {
        this.tooltip.style.display = 'none';
      }
    } else {
      // Hide the label layer
      this.labelLayer.setVisible(false);
    }
  }

  private getScoreName(score: number): string {
    if (score <= 0) return "Error";
    if (score <= 0.28) return "A+";
    if (score <= 0.32) return "A";
    if (score <= 0.35) return "A-";
    if (score <= 0.4) return "B+";
    if (score <= 0.45) return "B";
    if (score <= 0.5) return "B-";
    if (score <= 0.56) return "C+";
    if (score <= 0.63) return "C";
    if (score <= 0.71) return "C-";
    if (score <= 0.8) return "D+";
    if (score <= 0.9) return "D";
    if (score <= 1.0) return "D-";
    if (score <= 1.12) return "E+";
    if (score <= 1.26) return "E";
    if (score <= 1.41) return "E-";
    if (score <= 1.59) return "F+";
    if (score <= 1.78) return "F";
    return "F-";
  }
}
