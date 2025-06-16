import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { MapV2Service } from './map-v2.service';
import { Subscription } from 'rxjs';
import { LngLatBounds, Map, Popup, NavigationControl, ScaleControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AnalyzeService } from '../analyze/analyze.service';
import { LoadingService } from '../services/loading.service';

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

  constructor(private mapService: MapV2Service, private analyzeService: AnalyzeService, private loadingService: LoadingService) {
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
          duration: 2000
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
        zoom: this.zoom,
        dragRotate: false,
        touchZoomRotate: false
      });
      this.mapService.setMap(this.map);

      // Add navigation control
      this.map.addControl(new NavigationControl({showCompass: false}), 'top-left');
      this.map.addControl(new ScaleControl(), 'bottom-left');
      this.map.dragRotate.disable();
      this.map.touchZoomRotate.disable();

      // Add panning event listeners to adjust layer opacity
      this.map.on('dragstart', () => {
        if (this.map?.getLayer('geodata-fill')) {
          const currentOpacity = this.map.getPaintProperty('geodata-fill', 'fill-opacity');
          if (Array.isArray(currentOpacity)) {
            // Create a new expression that multiplies the result by 0.5
            const newOpacity = ['*', currentOpacity, 0.25];
            this.map.setPaintProperty('geodata-fill', 'fill-opacity', newOpacity);
          }
        }
      });

      this.map.on('dragend', () => {
        if (this.map?.getLayer('geodata-fill')) {
          const currentOpacity = this.map.getPaintProperty('geodata-fill', 'fill-opacity');
          if (Array.isArray(currentOpacity)) {
            // Create a new expression that multiplies the result by 2
            const newOpacity = ['*', currentOpacity, 4];
            this.map.setPaintProperty('geodata-fill', 'fill-opacity', newOpacity);
          }
        }
      });

      this.popup = new Popup({
        closeButton: false,
        closeOnClick: false
      });

      this.map.on('zoomend', () => {
        this.mapService.updateZoom(this.map!.getZoom());
      });

      // Add sourcedata event handler to track tile loading
      this.map.on('sourcedata', (e) => {
        if (e.sourceId === 'geodata' && e.isSourceLoaded) {
          this.loadingService.stopLoading();
        }
      });

      this.map.on('mousemove', 'geodata-fill', (e) => {
        if (e.features && e.features[0]) {
          const feature = e.features[0];
          const properties = feature.properties;
          if (properties) {
            const name = properties['name'] || 'Unknown';

            const popupContent = `
              <div style="padding: 5px;">
                ${name}: <strong>${this.getScoreName(properties['score'])}</strong>
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

      this.map.on('click', 'geodata-fill', (e) => {
        if (e.features && e.features[0]) {
          const feature = e.features[0];
          this.analyzeService.setSelectedFeature(feature);
        }
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

  private getScoreName(score: number): string {
    if (score <= 0) return "Error";
    if (score <= 0.28) return "A+";
    if (score <= 0.32) return "A";
    if (score <= 0.35) return "A-";
    if (score <= 0.4) return "B+";
    if (score <= 0.45) return "B";
    if (score <= 0.5) return "B-";
    if (score <= 0.56) return "C+";
    if (score <= 0.63) return "C";
    if (score <= 0.71) return "C-";
    if (score <= 0.8) return "D+";
    if (score <= 0.9) return "D";
    if (score <= 1.0) return "D-";
    if (score <= 1.12) return "E+";
    if (score <= 1.26) return "E";
    if (score <= 1.41) return "E-";
    if (score <= 1.59) return "F+";
    if (score <= 1.78) return "F";
    return "F-";
  }
}
