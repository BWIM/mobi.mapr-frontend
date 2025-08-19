import {Injectable} from '@angular/core';
import { ProjectsService } from '../../projects/projects.service';
import jsPDF from 'jspdf';
import maplibregl from 'maplibre-gl';
import { ExportMapService } from './export-map.service';

export type PaperSize = 'a4' | 'a3' | 'a2' | 'a1' | 'a0';
export type Orientation = 'portrait' | 'landscape';
export type MapExtent = 'current' | 'full';

export interface PdfExportOptions {
  orientation: Orientation;
  paperSize: PaperSize;
  resolution: number;
  mapExtent: MapExtent;
}

@Injectable({
  providedIn: 'root'
})
export class PdfGenerationService {
  private readonly paperSizes: {[key in PaperSize]: [number, number]} = {
    a4: [297, 210],  // A4 in mm
    a3: [420, 297],  // A3 in mm
    a2: [594, 420],  // A2 in mm
    a1: [841, 594],  // A1 in mm
    a0: [1189, 841]  // A0 in mm
  };

  private readonly modeIcons: {[key in string]: string} = {
    'Fahrrad': '🚴',
    'Auto': '🚗',
    'Fußgänger': '🚶',
    'ÖPNV': '🚋',
  };

  private readonly activityIcons: {[key in string]: string} = {
    'Einkauf': '🛒',
    'Erledigung': '🧹',
    'Freizeit': '🎉',
  };

  private readonly activityCount: {[key in string]: number} = {
    'Einkauf': 3,
    'Erledigung': 12,
    'Freizeit': 14,
  };

  constructor(
    private exportMapService: ExportMapService,
    private projectsService: ProjectsService
  ) {}

  private toPixels(length: number, unit: 'mm' | 'in' = 'mm'): string {
    const conversionFactor = 96;
    const factor = unit === 'mm' ? conversionFactor / 25.4 : conversionFactor;
    return (factor * length) + 'px';
  }

  private async loadImageAsBase64(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn(`Could not load image: ${url}`, error);
      return '';
    }
  }

  private addProjectDetails(pdf: jsPDF, project: any, pageWidth: number, pageHeight: number): void {
    // Calculate scaling factor based on paper size
    const baseSize = 210; // A4 width in mm
    const scaleFactor = Math.max(1, pageWidth / baseSize);
    
    // Project name - TOP LEFT
    const fontSize = Math.round(14 * scaleFactor);
    const x = 2 * scaleFactor;
    const y = 15 * scaleFactor; // 10mm from top (PDF coordinates are bottom-up)
    const maxWidth = pageWidth - 120 * scaleFactor; // Leave space for logo
    
    let text = project.project_name;
    
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', 'bold');
    pdf.text(text, x, y);

    // Project details - TOP LEFT
    const detailsFontSize = Math.round(10 * scaleFactor);
    let detailsY = y + fontSize/2;
    let textX = x + 20 * scaleFactor;
    
    // Modes
    if (project.profile_modes && Array.isArray(project.profile_modes)) {
      const label = 'Modi:';
      pdf.setFontSize(detailsFontSize);
      pdf.setFont('helvetica', 'bold');
      pdf.text(label, x, detailsY);
      
      const modesText = project.profile_modes.join(', ');
      pdf.setFont('helvetica', 'normal');
      pdf.text(` ${modesText}`, textX, detailsY);
      detailsY += detailsFontSize/2;
    }

    // Personas
    if (project.persona_abbreviations && Array.isArray(project.persona_abbreviations)) {
      const label = 'Personen:';
      pdf.setFontSize(detailsFontSize);
      pdf.setFont('helvetica', 'bold');
      pdf.text(label, x, detailsY);
      
      const personasText = project.persona_abbreviations.length === 12 ? 'Alle Personengruppen' : 'Auswahl Personengruppen';
      pdf.setFont('helvetica', 'normal');
      pdf.text(` ${personasText}`, textX, detailsY);
      detailsY += detailsFontSize/2;
    }

    // Activities
    if (project.activities && Array.isArray(project.activities)) {
      const activityCounts: {[key in string]: number} = {};
      project.activities.forEach((act: string) => {
        activityCounts[act] = (activityCounts[act] || 0) + 1;
      });
      
      const label = 'Aktivitäten:';
      pdf.setFontSize(detailsFontSize);
      pdf.setFont('helvetica', 'bold');
      pdf.text(label, x, detailsY);
      
      const activitiesText = Object.entries(activityCounts)
        .map(([act, count]) => `${act} (${count})`)
        .join(', ');
      
      pdf.setFont('helvetica', 'normal');
      pdf.text(` ${activitiesText}`, textX, detailsY);
    }
  }

  private async addLogo(pdf: jsPDF, pageWidth: number, pageHeight: number): Promise<void> {
    try {
      const logoBase64 = await this.loadImageAsBase64('assets/images/logo_transparent.png');
      if (logoBase64) {
        // Calculate scaling factor based on paper size
        const baseSize = 210; // A4 width in mm
        const scaleFactor = Math.max(1, pageWidth / baseSize);
        
        const logoWidth = 40 * scaleFactor; // Scaled size in mm
        const logoHeight = 20 * scaleFactor; // Scaled size in mm
        const x = pageWidth - logoWidth - 10 * scaleFactor; // TOP RIGHT
        const y = 10 * scaleFactor; // 10mm from top

        pdf.addImage(logoBase64, 'PNG', x, y, logoWidth, logoHeight);
      }
    } catch (error) {
      console.warn('Could not load logo:', error);
    }
  }

  private async addLegendAndBWIMLogo(pdf: jsPDF, pageWidth: number, pageHeight: number, project?: any): Promise<void> {
    try {
      // Load images in parallel
      const [legendBase64, bwimBase64] = await Promise.all([
        this.loadImageAsBase64('assets/images/legend.png'),
        this.loadImageAsBase64('assets/images/BWIM.png')
      ]);

      // Calculate scaling factor based on paper size
      const baseSize = 210; // A4 width in mm
      const scaleFactor = Math.max(1, pageWidth / baseSize);

      // Scaled sizes for consistency
      const legendHeight = 50 * scaleFactor;
      const bwimWidth = 30 * scaleFactor;
      const bwimHeight = 15 * scaleFactor;
      const legendWidth = 15 * scaleFactor;

      // Position at BOTTOM RIGHT
      const legendX = pageWidth - legendWidth - 10 * scaleFactor;
      const bwimX = pageWidth - bwimWidth - 10 * scaleFactor;
      const bwimY = pageHeight - 20 * scaleFactor; // 10mm from bottom
      const legendY = bwimY - bwimHeight - 40 * scaleFactor; // Above BWIM logo

      // Draw legend
      if (legendBase64) {
        pdf.addImage(legendBase64, 'PNG', legendX, legendY, legendWidth, legendHeight);
      }

      // Draw BWIM logo
      if (bwimBase64) {
        pdf.addImage(bwimBase64, 'PNG', bwimX, bwimY, bwimWidth, bwimHeight);
      }

      // Draw copyright and date
      if (project && project.creation_date) {
        const copyrightText = `© BWIM, ${project.creation_date}`;
        const copyrightFontSize = Math.round(8 * scaleFactor);
        pdf.setFontSize(copyrightFontSize);
        pdf.setFont('helvetica', 'normal');
        const textX = pageWidth - 35 * scaleFactor;
        const textY = bwimY + 18 * scaleFactor; // Below BWIM logo
        pdf.text(copyrightText, textX, textY);
      }
    } catch (error) {
      console.warn('Could not load legend or BWIM logo:', error);
    }
  }

  private getFilename(project: any): string {
    const now = new Date();
    const formattedDate = now.toISOString().split('T')[0];
    const formattedTime = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const sanitizedProjectName = project.project_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return `${formattedDate}_${formattedTime}_${sanitizedProjectName}.pdf`;
  }

  async exportToPDF(options: PdfExportOptions): Promise<void> {
    try {
      // Get project info
      const projectInfo = await new Promise((resolve, reject) => {
        this.projectsService.getExportInfo().subscribe({
          next: (project) => resolve(project),
          error: (error) => {
            console.error('Fehler beim Laden der Projektdetails:', error);
            reject(error);
          }
        });
      });

      // Calculate page size in mm
      const [mmWidth, mmHeight] = options.orientation === 'landscape' 
        ? [this.paperSizes[options.paperSize][0], this.paperSizes[options.paperSize][1]]
        : [this.paperSizes[options.paperSize][1], this.paperSizes[options.paperSize][0]];

      const originalMap = this.exportMapService.getMap();
      if (!originalMap) {
        throw new Error('Map is not available');
      }

      // Calculate pixel dimensions based on resolution
      const targetDPI = options.resolution;
      const pixelWidth = Math.round((mmWidth * targetDPI) / 25.4);
      const pixelHeight = Math.round((mmHeight * targetDPI) / 25.4);

      // Store original map state
      const originalCenter = originalMap.getCenter();
      const originalZoom = originalMap.getZoom();
      const originalStyle = originalMap.getStyle();

      // Calculate the zoom adjustment needed for the high-resolution export
      // The export map will have much larger pixel dimensions, so we need to zoom in accordingly
      const originalSize = originalMap.getContainer().getBoundingClientRect();
      const originalPixelWidth = originalSize.width;
      const originalPixelHeight = originalSize.height;
      
      // Calculate zoom adjustment: log2(export_pixels / original_pixels)
      const zoomAdjustment = Math.log2(Math.min(pixelWidth / originalPixelWidth, pixelHeight / originalPixelHeight));
      const exportZoom = originalZoom + zoomAdjustment;

      console.log('Zoom calculation:', {
        originalZoom,
        originalPixelWidth,
        originalPixelHeight,
        exportPixelWidth: pixelWidth,
        exportPixelHeight: pixelHeight,
        zoomAdjustment,
        exportZoom
      });

      // Create a temporary high-resolution map container
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '-9999px';
      tempContainer.style.width = `${pixelWidth}px`;
      tempContainer.style.height = `${pixelHeight}px`;
      document.body.appendChild(tempContainer);

      let exportMap: maplibregl.Map | undefined;

      // Create a new high-resolution map for export
      exportMap = new maplibregl.Map({
        container: tempContainer,
        style: originalStyle,
        center: originalCenter,
        zoom: exportZoom, // Use the adjusted zoom level
        // High-quality settings for crisp rendering
        pixelRatio: Math.max(2, window.devicePixelRatio || 1), // Force higher pixel ratio for crisp tiles
        fadeDuration: 0, // Disable fade animations for cleaner exports
        // Disable interactions
        dragRotate: false,
        touchZoomRotate: false,
        doubleClickZoom: false,
        keyboard: false,
        scrollZoom: false
      });

      // Force high-DPI tile loading by temporarily setting a very high pixel ratio
      // This ensures we get the highest quality tiles available
      const originalPixelRatio = exportMap.getPixelRatio();
      const targetPixelRatio = Math.max(4, targetDPI / 72);
      exportMap.setPixelRatio(targetPixelRatio);
      
      console.log('Quality enhancement:', {
        originalPixelRatio,
        targetPixelRatio,
        targetDPI,
        'tileQuality': `${targetPixelRatio}x standard resolution`
      });

      // Wait for the export map to be ready
      await new Promise<void>((resolve, reject) => {
        if (exportMap) {
          // First, wait for the initial idle state
          exportMap.once('idle', () => {
            // Force a repaint and wait for all tiles to be fully loaded at high quality
            exportMap.triggerRepaint();
            
            // Wait additional time for high-DPI tiles to load
            setTimeout(() => {
              // Force another repaint to ensure all tiles are rendered at maximum quality
              exportMap.triggerRepaint();
              
              // Final wait to ensure everything is crisp
              setTimeout(() => {
                resolve();
              }, 2000);
            }, 1500);
          });

          exportMap.once('error', (error) => {
            reject(error);
          });
        }
      });

        // Get the high-resolution canvas
        if (exportMap) {
          const canvas = exportMap.getCanvas();
          
          // Ensure maximum canvas quality
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Set high-quality rendering context
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
          }
          
          const mapImage = canvas.toDataURL('image/png', 1.0);

        // Create PDF
        const pdf = new jsPDF({
          orientation: mmWidth > mmHeight ? 'l' : 'p',
          unit: 'mm',
          format: [mmWidth, mmHeight],
          compress: true
        });

        // Add map image to PDF - fill the entire page
        pdf.addImage(mapImage, 'PNG', 0, 0, mmWidth, mmHeight);

        // Add project details (overlay on top)
        this.addProjectDetails(pdf, projectInfo, mmWidth, mmHeight);
        
        // Add logo (overlay on top)
        await this.addLogo(pdf, mmWidth, mmHeight);
        
        // Add legend and BWIM logo (overlay on top)
        await this.addLegendAndBWIMLogo(pdf, mmWidth, mmHeight, projectInfo);

        // Save the PDF
        console.log('Saving PDF');
        pdf.save(this.getFilename(projectInfo));

        // Restore original pixel ratio for cleanup
        if (exportMap) {
          exportMap.setPixelRatio(originalPixelRatio);
        }
        
        console.log('High-quality export completed successfully');

      
    }
   } catch (error) {
      console.error(`Fehler beim Generieren des PDFs:`, error);
      throw error;
    }
  }
}