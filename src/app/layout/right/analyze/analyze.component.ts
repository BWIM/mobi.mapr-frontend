import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { FeatureSelectionService } from '../../../shared/services/feature-selection.service';

@Component({
  selector: 'app-analyze',
  imports: [CommonModule],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css',
})
export class AnalyzeComponent implements OnInit, OnDestroy {
  selectedFeature: any | null = null;
  private featureSelectionService = inject(FeatureSelectionService);
  private featureSubscription?: Subscription;

  ngOnInit() {
    // Subscribe to feature selection changes
    this.featureSubscription = this.featureSelectionService.selectedMapLibreFeature$.subscribe(
      (feature) => {
        if (feature) {
          this.selectedFeature = feature;
          this.logFeatureInformation(feature);
        } else {
          this.selectedFeature = null;
        }
      }
    );
  }

  ngOnDestroy() {
    if (this.featureSubscription) {
      this.featureSubscription.unsubscribe();
    }
  }

  private logFeatureInformation(feature: any): void {
    console.log('=== Feature Information ===');
    console.log('Name:', feature.properties.name || feature.properties.NAME || 'Unnamed');
    
    if (feature.properties.score !== undefined && feature.properties.score !== null) {
      const minutes = (feature.properties.score / 60).toFixed(1);
      console.log('Score:', feature.properties.score, 'seconds', `(${minutes} minutes)`);
    }
    
    if (feature.properties.index !== undefined && feature.properties.index !== null) {
      const indexValue = feature.properties.index / 100;
      console.log('Index:', feature.properties.index, `(${indexValue.toFixed(2)})`);
    }
    
    console.log('ID:', feature.properties.id);
    console.log('All Properties:', feature.properties);
    console.log('Geometry:', feature.geometry);
    console.log('===========================');
  }
}
