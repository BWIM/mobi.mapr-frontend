import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import Map from 'ol/Map';
import WebGLVectorLayer from 'ol/layer/WebGLVector';
import VectorSource from 'ol/source/Vector';

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private map: Map | null = null;
  private mainLayer: WebGLVectorLayer<VectorSource> | null = null;
  private featuresSubject = new Subject<any>();
  features$ = this.featuresSubject.asObservable();

  private resetMapSubject = new Subject<void>();
  resetMap$ = this.resetMapSubject.asObservable();

  setMap(map: Map | null): void  {
    this.map = map;
  }

  getMap(): Map | null {
    return this.map;
  }

  setMainLayer(layer: WebGLVectorLayer<VectorSource> | null): void {
    this.mainLayer = layer;
  }

  getMainLayer(): WebGLVectorLayer<VectorSource> | null {
    return this.mainLayer;
  }

  updateFeatures(features: any[]): void {
    this.featuresSubject.next(features);
  }

  resetMap(): void {
    this.resetMapSubject.next();
  }
}
