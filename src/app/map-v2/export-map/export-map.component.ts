import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapV2Service } from '../map-v2.service';
import { Subscription } from 'rxjs';
import { SharedModule } from '../../shared/shared.module';
import { ExportMapService } from './export-map.service';
import { PdfGenerationService } from './pdf-generation.service';

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
export class ExportMapComponent implements OnInit, OnDestroy {
  visible: boolean = false;
  isExporting: boolean = false;
  options: PdfExportOptions = {
    orientation: 'portrait',
    paperSize: 'a4',
    resolution: 72,
    mapExtent: 'current'
  };
  
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
    { label: 'A0', value: 'a0' },
    { label: 'A1', value: 'a1' },
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
    private exportMapService: ExportMapService,
    private pdfGenerationService: PdfGenerationService
  ) {
    // Subscribe to map style changes (includes geodata layer updates)
    this.subscription = this.mapService.mapStyle$.subscribe(style => {
      this.mapStyle = style;
    });

    // Subscribe to bounds changes to ensure proper zoom
    this.boundsSubscription = this.mapService.bounds$.subscribe(bounds => {
      if (bounds) {
        // Update zoom and center for export
        this.zoom = this.mapService.getZoom();
        this.center = this.mapService.getCenter();
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
        // Copy current zoom and center from main map when dialog becomes visible
        this.zoom = this.mapService.getZoom();
        this.center = this.mapService.getCenter();
      }
    });
  }

  ngOnInit() {
    // Get the current project from the service
    this.currentProject = this.mapService.getCurrentProject();
    // Options are already initialized with defaults in the class
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
      // Set the current map state in the export service for Inkmap to use
      const currentMap = this.mapService.getMap();
      if (currentMap) {
        this.exportMapService.setMap(currentMap);
      }
      
      await this.pdfGenerationService.exportToPDF(this.options);
      this.hideDialog();
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      this.isExporting = false;
    }
  }

  ngOnDestroy() {
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

  // Method to hide the export map dialog
  hideDialog(): void {
    this.exportMapService.hideDialog();
  }
}
