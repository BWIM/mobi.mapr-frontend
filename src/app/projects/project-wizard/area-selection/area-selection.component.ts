import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../../../shared/shared.module';
import { AreasService } from '../../../services/areas.service';
import { LandsService } from '../../../services/lands.service';
import { Land } from '../../../services/interfaces/land.interface';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import GeoJSON from 'ol/format/GeoJSON';
import { Fill, Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';

@Component({
  selector: 'app-area-selection',
  templateUrl: './area-selection.component.html',
  styleUrls: ['./area-selection.component.css'],
  standalone: true,
  imports: [CommonModule, SharedModule]
})
export class AreaSelectionComponent implements OnInit, AfterViewInit, OnDestroy {
  private map?: Map;
  private vectorLayer?: VectorLayer<any>;
  private geoJsonFormat = new GeoJSON();
  private selectedFeatures: Set<string> = new Set();
  
  lands: Land[] = [];

  constructor(
    private areasService: AreasService,
    private landsService: LandsService
  ) {}

  ngOnInit() {
    this.loadLands();
    this.loadAreas();
  }

  ngAfterViewInit() {
    this.initializeMap();
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.dispose();
    }
  }

  private initializeMap() {
    const baseLayer = new TileLayer({
      source: new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      })
    });

    this.vectorLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const isSelected = this.selectedFeatures.has(feature.getId() as string);
        return new Style({
          zIndex: isSelected ? 1000 : 1,
          fill: new Fill({
            color: isSelected ? 'rgba(49, 159, 211, 0.5)' : 'rgba(255, 255, 255, 0.5)'
          }),
          stroke: new Stroke({
            color: '#319FD3',
            width: isSelected ? 2 : 1
          })
        });
      }
    });

    this.map = new Map({
      target: 'create-map',
      layers: [baseLayer, this.vectorLayer],
      view: new View({
        center: fromLonLat([10.4515, 51.1657]),
        zoom: 6
      })
    });

    this.map.on('click', (event) => {
      const feature = this.map?.forEachFeatureAtPixel(event.pixel, (feature) => feature);
      if (feature) {
        console.log(feature);
        const featureId = feature.getId() as string;
        if (this.selectedFeatures.has(featureId)) {
          this.selectedFeatures.delete(featureId);
        } else {
          this.selectedFeatures.add(featureId);
        }
        this.vectorLayer?.changed();
      }
    });
  }

  private loadLands() {
    this.landsService.getLands().subscribe({
      next: (lands: Land[]) => {
        this.lands = lands.sort((a, b) => a.name.localeCompare(b.name));
      },
      error: (error) => {
        console.error('Fehler beim Laden der Länder:', error);
      }
    });
  }

  private loadAreas() {
    this.areasService.getAreas().subscribe({
      next: (geojson: any) => {
        const features = this.geoJsonFormat.readFeatures(geojson, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326'
        });
        
        features.forEach(feature => {
          if (!feature.getId()) {
            feature.setId(feature.get('id'));
          }
        });

        const source = this.vectorLayer?.getSource();
        source?.clear();
        source?.addFeatures(features);
      },
      error: (error) => {
        console.error('Fehler beim Laden der Gebiete:', error);
      }
    });
  }

  getLandSelectionState(land: Land): any {
    const source = this.vectorLayer?.getSource();
    const features = source?.getFeatures() || [];
    const landFeatures = features.filter((f: any) => f.get('land') === land.id);
    
    if (landFeatures.length === 0) return true;
    
    const selectedCount = landFeatures.filter((f: any) => 
      this.selectedFeatures.has(f.getId() as string)
    ).length;
    
    if (selectedCount === 0) return false;
    if (selectedCount === landFeatures.length) return true;
    return true; // Zwischenzustand
  }

  selectLand(land: Land) {
    const source = this.vectorLayer?.getSource();
    const features = source?.getFeatures() || [];
    const landFeatures = features.filter((f: any) => f.get('land') === land.id);
    
    const currentState = this.getLandSelectionState(land);
    
    // Zyklus: false -> true -> null (teilweise) -> false
    if (currentState === false || currentState === null) {
      landFeatures.forEach((f: any) => {
        this.selectedFeatures.add(f.getId() as string);
      });
    } else {
      landFeatures.forEach((f: any) => {
        this.selectedFeatures.delete(f.getId() as string);
      });
    }
    
    this.vectorLayer?.changed();
  }

  isLandSelected(land: Land): boolean {
    const source = this.vectorLayer?.getSource();
    const features = source?.getFeatures() || [];
    const landFeatures = features.filter((f: any) => f.get('land') === land.id);
    
    return landFeatures.length > 0 && landFeatures.every((f: any) => 
      this.selectedFeatures.has(f.getId() as string)
    );
  }

  isLandIndeterminate(land: Land): boolean {
    const source = this.vectorLayer?.getSource();
    const features = source?.getFeatures() || [];
    const landFeatures = features.filter((f: any) => f.get('land') === land.id);

    return landFeatures.length > 0 && landFeatures.some((f: any) => 
      this.selectedFeatures.has(f.getId() as string)
    ) && !this.isLandSelected(land);
  }
} 