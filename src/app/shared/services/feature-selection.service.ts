import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Feature } from 'ol';

export interface MapLibreFeatureData {
  properties: {
    name?: string;
    score?: number;
    index?: number;
    [key: string]: any;
  };
  geometry?: any;
  id?: string | number;
}

@Injectable({
  providedIn: 'root'
})
export class FeatureSelectionService {
  private selectedFeatureSource = new BehaviorSubject<Feature | null>(null);
  selectedFeature$ = this.selectedFeatureSource.asObservable();

  // MapLibre feature selection
  private selectedMapLibreFeatureSource = new BehaviorSubject<MapLibreFeatureData | null>(null);
  selectedMapLibreFeature$ = this.selectedMapLibreFeatureSource.asObservable();

  setSelectedFeature(feature: Feature | null) {
    this.selectedFeatureSource.next(feature);
  }

  setSelectedMapLibreFeature(feature: MapLibreFeatureData | null) {
    this.selectedMapLibreFeatureSource.next(feature);
  }
} 