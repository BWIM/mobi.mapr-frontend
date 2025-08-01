import {Injectable} from '@angular/core';
import { MapV2Service } from '../map-v2.service';
import { ProjectsService } from '../../projects/projects.service';
import jsPDF from 'jspdf';
import maplibregl from 'maplibre-gl';

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
    private mapService: MapV2Service,
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
    // Project name - TOP LEFT
    const fontSize = 14;
    const x = 2;
    const y = 15; // 10mm from top (PDF coordinates are bottom-up)
    const maxWidth = pageWidth - 120; // Leave space for logo
    
    let text = project.project_name;
    
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', 'bold');
    pdf.text(text, x, y);

    // Project details - TOP LEFT
    const detailsFontSize = 10;
    let detailsY = y + fontSize/2;
    let textX = x + 20;
    
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
        const logoWidth = 40; // Fixed size in mm
        const logoHeight = 20; // Fixed size in mm
        const x = pageWidth - logoWidth - 10; // TOP RIGHT
        const y = 10; // 10mm from top

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

      // Fixed sizes for consistency
      const legendHeight = 50;
      const bwimWidth = 30;
      const bwimHeight = 15;

      const legendWidth = 15;

      // Position at BOTTOM RIGHT
      const legendX = pageWidth - legendWidth - 10;
      const bwimX = pageWidth - bwimWidth - 10;
      const bwimY = pageHeight - 20; // 10mm from bottom
      const legendY = bwimY - bwimHeight - 40; // Above BWIM logo

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
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        const textX = pageWidth - 35;
        const textY = bwimY + 18; // Below BWIM logo
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

      const map = this.mapService.getMap();
      if (!map) {
        throw new Error('Map is not available');
      }

      // Calculate pixel dimensions based on resolution
      const resolution = options.resolution; // DPI
      const pixelWidth = Math.round((mmWidth * resolution) / 25.4);
      const pixelHeight = Math.round((mmHeight * resolution) / 25.4);

      // Store original map size and view state
      const originalSize = map.getContainer().getBoundingClientRect();
      const originalCenter = map.getCenter();
      const originalZoom = map.getZoom();

          try {
            // Temporarily resize the map to the target pixel dimensions
            map.resize([pixelWidth, pixelHeight]);

            // Wait for the map to render with the new size
            map.once('idle', async () => {
              try {
                // Get the canvas as data URL
                const mapImage = map.getCanvas().toDataURL('image/png');

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

                // Restore original map size and state
                map.resize(originalSize);
                map.setCenter(originalCenter);
                map.setZoom(originalZoom);

                // Resolve the promise after PDF is saved


              } catch (error) {
                console.error('Error generating PDF:', error);
                // Restore original map size and state even on error
                map.resize(originalSize);
                map.setCenter(originalCenter);
                map.setZoom(originalZoom);
              }
            });

          } catch (error) {
            console.error('Error resizing map:', error);
            // Restore original map size and state
            map.resize(originalSize);
            map.setCenter(originalCenter);
            map.setZoom(originalZoom);
          }


    } catch (error) {
      console.error(`Fehler beim Generieren des PDFs:`, error);
      throw error;
    }
  }
}