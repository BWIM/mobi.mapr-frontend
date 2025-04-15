import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject, debounceTime } from 'rxjs';
import Map from 'ol/Map';
import WebGLVectorLayer from 'ol/layer/WebGLVector';
import VectorSource from 'ol/source/Vector';

export interface OpacityThresholds {
  county: number;
  municipality: number;
  hexagon: number;
}

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private map: Map | null = null;
  private mapSubject = new BehaviorSubject<Map | null>(null);
  private mainLayer: WebGLVectorLayer<VectorSource> | null = null;
  private featuresSubject = new Subject<any>();
  private currentFeatures: { [key: string]: any } = {};  // Store current features
  features$ = this.featuresSubject.asObservable();

  private resetMapSubject = new Subject<void>();
  resetMap$ = this.resetMapSubject.asObservable();

  private visualizationSettingsSubject = new Subject<{
    averageType: 'mean' | 'median';
    populationArea: 'pop' | 'area';
    opacityThresholds: OpacityThresholds;
    updatedLevel?: keyof OpacityThresholds;
  }>();
  
  // Create a separate subject for opacity updates with debounce
  private opacityUpdateSubject = new Subject<{
    thresholds: Partial<OpacityThresholds>;
    level: keyof OpacityThresholds;
  }>();

  visualizationSettings$ = this.visualizationSettingsSubject.asObservable();
  
  constructor() {
    // Subscribe to debounced opacity updates
    this.opacityUpdateSubject.pipe(
      debounceTime(100) // Wait 100ms after the last update before emitting
    ).subscribe(({ thresholds, level }) => {
      const currentSettings = {
        averageType: 'mean' as const,
        populationArea: 'pop' as const,
        opacityThresholds: this.defaultOpacityThresholds
      };
      
      this.visualizationSettingsSubject.next({
        ...currentSettings,
        opacityThresholds: {
          ...currentSettings.opacityThresholds,
          ...thresholds
        },
        updatedLevel: level
      });
    });
  }

  // Default opacity thresholds (people per square km)
  private defaultOpacityThresholds: OpacityThresholds = {
    county: 200,
    municipality: 500,
    hexagon: 1000
  };

  setMap(map: Map | null): void  {
    this.map = map;
    this.mapSubject.next(map);
  }

  getMap(): Map | null {
    return this.map;
  }

  getMap$() {
    return this.mapSubject.asObservable();
  }

  setMainLayer(layer: WebGLVectorLayer<VectorSource> | null): void {
    this.mainLayer = layer;
  }

  getMainLayer(): WebGLVectorLayer<VectorSource> | null {
    return this.mainLayer;
  }

  updateFeatures(features: any): void {
    this.featuresSubject.next(features);  // Emit all features
  }

  addSingleFeature(feature: { [key: string]: { [key: string]: any } }): void {
    // Get the primary key (e.g., '082150000000')
    const primaryKey = Object.keys(feature)[0];
    
    this.currentFeatures = {
      ...this.currentFeatures,
      [primaryKey]: {
        ...(this.currentFeatures[primaryKey] || {}),
        ...feature[primaryKey]
      }
    };
    this.featuresSubject.next(this.currentFeatures);
  }

  resetMap(): void {
    this.resetMapSubject.next();
  }

  updateVisualizationSettings(
    averageType: 'mean' | 'median',
    populationArea: 'pop' | 'area',
    opacityThresholds?: Partial<OpacityThresholds>
  ): void {
    this.visualizationSettingsSubject.next({
      averageType,
      populationArea,
      opacityThresholds: {
        ...this.defaultOpacityThresholds,
        ...opacityThresholds
      }
    });
  }

  updateOpacityThresholds(thresholds: Partial<OpacityThresholds>, level: keyof OpacityThresholds): void {
    // Use the debounced subject instead of direct update
    this.opacityUpdateSubject.next({ thresholds, level });
  }
}
