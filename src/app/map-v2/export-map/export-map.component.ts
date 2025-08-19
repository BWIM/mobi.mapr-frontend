import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapV2Service } from '../map-v2.service';
import { Subscription } from 'rxjs';
import { LngLatBounds, Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SharedModule } from '../../shared/shared.module';
import { ExportMapService } from './export-map.service';

// PDF Export Types
export type PaperSize = 'a4' | 'a3' | 'a2' | 'a1' | 'a0';
export type Orientation = 'portrait' | 'landscape';
export type MapExtent = 'current' | 'full';

export interface PdfExportOptions {
  orientation: Orientation;
  paperSize: PaperSize;
  resolution: number;
  mapExtent: MapExtent;
}

@Component({
  selector: 'app-export-map',
  standalone: true,
  imports: [CommonModule, SharedModule],
  templateUrl: './export-map.component.html',
  styleUrl: './export-map.component.css'
})
export class ExportMapComponent implements OnInit, OnDestroy, AfterViewInit {
  visible: boolean = false;
  isExporting: boolean = false;
  options: PdfExportOptions = {
    orientation: 'portrait',
    paperSize: 'a4',
    resolution: 300,
    mapExtent: 'current'
  };
  
  @ViewChild('exportMapContainer') exportMapContainer?: ElementRef;
  private exportMap?: Map;
  private subscription: Subscription;
  private boundsSubscription: Subscription;
  private projectSubscription: Subscription;
  private dialogSubscription: Subscription;
  mapStyle: any;
  zoom: number = 7;
  center: [number, number] = [9.2156505, 49.320099];
  currentProject: string | null = null;

  // PDF Export Options
  paperSizes = [
    { label: 'A2', value: 'a2' },
    { label: 'A3', value: 'a3' },
    { label: 'A4', value: 'a4' }
  ];

  resolutionOptions = [
    { label: '72 DPI (Low)', value: 72 },
    { label: '144 DPI (Medium)', value: 144 },
    { label: '300 DPI (High)', value: 300 },
    { label: '600 DPI (Very High)', value: 600 }
  ];
  
  constructor(
    private mapService: MapV2Service,
    private exportMapService: ExportMapService
  ) {
    // Subscribe to map style changes (includes geodata layer updates)
    this.subscription = this.mapService.mapStyle$.subscribe(style => {
      this.mapStyle = style;
      if (this.exportMap) {
        this.exportMap.setStyle(style);
      }
    });

    // Subscribe to bounds changes to ensure proper zoom
    this.boundsSubscription = this.mapService.bounds$.subscribe(bounds => {
      if (bounds && this.exportMap) {
        const mapBounds = new LngLatBounds(
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat]
        );
        this.exportMap.fitBounds(mapBounds, {
          padding: 50,
          duration: 2000
        });
      }
    });

    // Subscribe to project changes to ensure we have the same project data
    this.projectSubscription = this.mapService.mapStyle$.subscribe(() => {
      this.currentProject = this.mapService.getCurrentProject();
    });

    // Subscribe to dialog visibility changes
    this.dialogSubscription = this.exportMapService.dialogVisible$.subscribe(visible => {
      this.visible = visible;
      if (visible) {
        // Refresh the map when dialog becomes visible
        setTimeout(() => {
          this.refreshExportMap();
        }, 100);
      }
    });
  }

  ngOnInit() {
    // Get the current project from the service
    this.currentProject = this.mapService.getCurrentProject();
    // Get default options from the service
    this.options = this.exportMapService.getDefaultOptions();
  }

  ngAfterViewInit() {
    if (this.exportMapContainer) {
      // Create the export map with the same style as the main map
      this.exportMap = new Map({
        container: this.exportMapContainer.nativeElement,
        style: this.mapStyle || this.mapService.getBaseMapStyle(),
        center: this.center,
        zoom: this.zoom,
        dragRotate: false,
        touchZoomRotate: false
      });

      // Disable all interactions for export map (read-only)
      this.exportMap.dragRotate.disable();
      this.exportMap.touchZoomRotate.disable();
      this.exportMap.doubleClickZoom.disable();
      this.exportMap.keyboard.disable();

      // Setup basic map events for export map
      this.setupExportMapEvents(this.exportMap);

      // If there's already a project loaded, ensure the export map gets the same data
      if (this.currentProject) {
        this.updateExportMapProject();
      }
    }
  }

  private updateExportMapProject(): void {
    if (this.exportMap && this.currentProject) {
      // Get the current project style from the service
      const projectStyle = this.mapService['getProjectMapStyle'](this.currentProject);
      if (projectStyle) {
        this.exportMap.setStyle(projectStyle);
      }
    }
  }

  private setupExportMapEvents(map: Map): void {
    // Add sourcedata event handler to track tile loading
    map.on('sourcedata', (e) => {
      if (e.sourceId === 'geodata' && e.isSourceLoaded) {
        // Map is ready for export
        console.log('Export map tiles loaded');
      }
    });

    // Handle style loading to ensure geodata layer is properly displayed
    map.on('style.load', () => {
      console.log('Export map style loaded');
    });
  }

  // PDF Export Helper Methods
  getSelectedPaperSizeLabel(): string {
    const selectedSize = this.paperSizes.find(size => size.value === this.options.paperSize);
    return selectedSize ? selectedSize.label : this.options.paperSize.toUpperCase();
  }

  getMapExtentLabel(): string {
    switch (this.options.mapExtent) {
      case 'current':
        return 'Current View';
      case 'full':
        return 'Full Map';
      default:
        return this.options.mapExtent;
    }
  }

  async exportPdf() {
    if (this.isExporting) return;
    
    this.isExporting = true;
    try {
      // TODO: Implement PDF export functionality
      console.log('Exporting PDF with options:', this.options);
      // For now, just simulate export
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.hideDialog();
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      this.isExporting = false;
    }
  }

  ngOnDestroy() {
    if (this.exportMap) {
      this.exportMap.remove();
    }
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.boundsSubscription) {
      this.boundsSubscription.unsubscribe();
    }
    if (this.projectSubscription) {
      this.projectSubscription.unsubscribe();
    }
    if (this.dialogSubscription) {
      this.dialogSubscription.unsubscribe();
    }
  }

  // Method to refresh the export map when it becomes visible
  refreshExportMap(): void {
    if (this.exportMap && this.currentProject) {
      this.updateExportMapProject();
    }
  }

  // Method to hide the export map dialog
  hideDialog(): void {
    this.exportMapService.hideDialog();
  }
}
