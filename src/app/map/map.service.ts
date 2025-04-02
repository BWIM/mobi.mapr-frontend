import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import Map from 'ol/Map';
import WebGLVectorLayer from 'ol/layer/WebGLVector';
import VectorSource from 'ol/source/Vector';
import VectorImageLayer from 'ol/layer/VectorImage';

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private map: Map | null = null;
  private mainLayer: VectorImageLayer<VectorSource> | null = null;
  private featuresSubject = new Subject<any>();
  features$ = this.featuresSubject.asObservable();

  private resetMapSubject = new Subject<void>();
  resetMap$ = this.resetMapSubject.asObservable();

  private visualizationSettingsSubject = new Subject<{
    averageType: 'mean' | 'median';
    populationArea: 'pop' | 'area';
  }>();
  visualizationSettings$ = this.visualizationSettingsSubject.asObservable();

  setMap(map: Map | null): void  {
    this.map = map;
  }

  getMap(): Map | null {
    return this.map;
  }

  setMainLayer(layer: VectorImageLayer<VectorSource> | null): void {
    this.mainLayer = layer;
  }

  getMainLayer(): VectorImageLayer<VectorSource> | null {
    return this.mainLayer;
  }

  updateFeatures(features: any[]): void {
    this.featuresSubject.next(features);
  }

  resetMap(): void {
    this.resetMapSubject.next();
  }

  updateVisualizationSettings(
    averageType: 'mean' | 'median',
    populationArea: 'pop' | 'area'
  ): void {
    this.visualizationSettingsSubject.next({
      averageType,
      populationArea
    });
  }
}
