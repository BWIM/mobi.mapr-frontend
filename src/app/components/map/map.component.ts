import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { Map, NavigationControl, FullscreenControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatInputModule, FormsModule],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css'
})
export class MapComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mapContainer') mapContainer?: ElementRef;
  private map?: Map;
  
  zoom: number = 7;
  center: [number, number] = [9.2156505, 49.320099];
  mapStyle: string = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
  selectedLocationType: 'land' | 'region' | 'kreis' | 'gemeinde' = 'region';
  currentLanguage: string = 'de';

  switchLanguage(lang: string): void {
    this.currentLanguage = lang;
    // TODO: Implement language switching
    console.log('Switching language to:', lang);
  }

  constructor() {}

  ngOnInit(): void {
    // TODO: Initialize map service subscriptions
  }

  ngAfterViewInit(): void {
    if (this.mapContainer) {
      this.initializeMap();
    }
  }

  private initializeMap(): void {
    if (!this.mapContainer) return;

    const mapOptions: any = {
      container: this.mapContainer.nativeElement,
      style: this.mapStyle,
      center: this.center,
      zoom: this.zoom,
      dragRotate: false,
      renderWorldCopies: false,
      attributionControl: false
    };

    this.map = new Map(mapOptions);

    // Add navigation controls (zoom + fullscreen) in the top-right corner
    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new FullscreenControl(), 'top-right');
    this.map.dragRotate.disable();
    this.map.touchZoomRotate.disableRotation();

    // Setup map events
    this.setupMapEvents();
  }

  private setupMapEvents(): void {
    if (!this.map) return;

    // TODO: Add map event handlers
    this.map.on('load', () => {
      console.log('Map loaded');
    });

    this.map.on('click', (e) => {
      console.log('Map clicked at:', e.lngLat);
      // TODO: Handle map click
    });
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }
}
