import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { DialogModule } from 'primeng/dialog';
import { TranslateService } from '@ngx-translate/core';
import { FeatureSelectionService } from '../shared/services/feature-selection.service';
import { Feature } from 'ol';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-details-sidebar',
  standalone: true,
  imports: [
    SharedModule,
    ButtonModule,
    PanelModule,
    DialogModule,
  ],
  templateUrl: './details-sidebar.component.html',
  styleUrl: './details-sidebar.component.css'
})
export class DetailsSidebarComponent implements OnInit, OnDestroy {
  selectedFeature: Feature | null = null;
  featureProperties: any = null;
  private subscription: Subscription;

  constructor(
    private translate: TranslateService,
    private featureSelectionService: FeatureSelectionService
  ) {
    this.subscription = this.featureSelectionService.selectedFeature$.subscribe(
      feature => {
        this.selectedFeature = feature;
        console.log(this.selectedFeature);
        this.updateFeatureProperties();
      }
    );
  }

  ngOnInit() {}

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private updateFeatureProperties(): void {
    this.featureProperties = this.selectedFeature ? this.selectedFeature.getProperties() : null;
  }

  getFeatureProperties(): any {
    return this.featureProperties;
  }
} 