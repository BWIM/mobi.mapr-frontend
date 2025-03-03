import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Feature } from 'ol';

@Injectable({
  providedIn: 'root'
})
export class FeatureSelectionService {
  private selectedFeatureSource = new BehaviorSubject<Feature | null>(null);
  selectedFeature$ = this.selectedFeatureSource.asObservable();

  setSelectedFeature(feature: Feature | null) {
    this.selectedFeatureSource.next(feature);
  }
} 