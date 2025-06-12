import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { MapV2Service } from './map-v2.service';
import { Subscription } from 'rxjs';
import { LngLatBounds, Map, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

@Component({
  selector: 'app-map-v2',
  templateUrl: './map-v2.component.html',
  styleUrl: './map-v2.component.css'
})
export class MapV2Component implements OnInit, OnDestroy, AfterViewInit {
  private map?: Map;
  private popup?: Popup;
  @ViewChild('mapContainer') mapContainer?: ElementRef;
  mapStyle: any;
  zoom: number = 7;
  center: [number, number] = [9.2156505, 49.320099];
  private subscription: Subscription;
  private boundsSubscription: Subscription;

  constructor(private mapService: MapV2Service) {
    this.subscription = this.mapService.mapStyle$.subscribe(style => {
      this.mapStyle = style;
      if (this.map) {
        this.map.setStyle(style);
      }
    });

    this.boundsSubscription = this.mapService.bounds$.subscribe(bounds => {
      if (bounds && this.map) {
        const mapBounds = new LngLatBounds(
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat]
        );
        this.map.fitBounds(mapBounds, {
          padding: 50,
          duration: 1000
        });
      }
    });
  }

  ngOnInit() {
    // Initial style is already set through the subscription in constructor
  }

  ngAfterViewInit() {
    if (this.mapContainer) {
      this.map = new Map({
        container: this.mapContainer.nativeElement,
        style: this.mapStyle,
        center: this.center,
        zoom: this.zoom
      });

      this.popup = new Popup({
        closeButton: false,
        closeOnClick: false
      });

      this.map.on('zoomend', () => {
        this.mapService.updateZoom(this.map!.getZoom());
      });

      this.map.on('mousemove', 'geodata-fill', (e) => {
        if (e.features && e.features[0]) {
          const feature = e.features[0];
          const properties = feature.properties;
          if (properties) {
            console.log(properties);
            const name = properties['name'] || 'Unknown';
            const score = properties['score'] ? (properties['score'] * 100).toFixed(1) + '%' : 'N/A';
            const population = properties['population'] ? properties['population'].toLocaleString() : 'N/A';
            const density = properties['population_density'] ? properties['population_density'].toFixed(2) : 'N/A';

            const popupContent = `
              <div style="padding: 5px;">
                <strong>${name}</strong><br>
                Score: ${score}<br>
                Population: ${population}<br>
                Density: ${density} per km²
              </div>
            `;

            this.popup!
              .setLngLat(e.lngLat)
              .setHTML(popupContent)
              .addTo(this.map!);
          }
        }
      });

      this.map.on('mouseleave', 'geodata-fill', () => {
        this.popup!.remove();
      });
    }
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
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
}
