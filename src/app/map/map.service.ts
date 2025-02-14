import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private featuresSubject = new Subject<any>();
  features$ = this.featuresSubject.asObservable();

  private resetMapSubject = new Subject<void>();
  resetMap$ = this.resetMapSubject.asObservable();

  updateFeatures(features: any[]): void {
    this.featuresSubject.next(features);
  }

  resetMap(): void {
    this.resetMapSubject.next();
  }
} 