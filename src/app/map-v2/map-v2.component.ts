import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { MapComponent } from '@maplibre/ngx-maplibre-gl';
import { MapV2Service } from './map-v2.service';
import { Subscription } from 'rxjs';
import { LngLatBounds } from 'maplibre-gl';

@Component({
  selector: 'app-map-v2',
  imports: [MapComponent],
  templateUrl: './map-v2.component.html',
  styleUrl: './map-v2.component.css'
})
export class MapV2Component implements OnInit, OnDestroy {
  @ViewChild(MapComponent) mapComponent?: MapComponent;
  mapStyle: any;
  zoom: [number] = [7];
  center: [number, number] = [9.2156505, 49.320099];
  private subscription: Subscription;
  private boundsSubscription: Subscription;

  constructor(private mapService: MapV2Service) {
    this.subscription = this.mapService.mapStyle$.subscribe(style => {
      this.mapStyle = style;
    });

    this.boundsSubscription = this.mapService.bounds$.subscribe(bounds => {
      if (bounds && this.mapComponent) {
        const mapBounds = new LngLatBounds(
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat]
        );
        this.mapComponent.mapInstance.fitBounds(mapBounds, {
          padding: 50,
          duration: 1000
        });
      }
    });
  }

  ngOnInit() {
    // Initial style is already set through the subscription in constructor
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.boundsSubscription) {
      this.boundsSubscription.unsubscribe();
    }
  }

  setProject(projectId: string) {
    this.mapService.setProject(projectId);
  }

  onZoomChange(event: any) {
    setTimeout(() => {
      this.mapService.updateZoom(event.target.getZoom());
    }, 500);
  }
}
