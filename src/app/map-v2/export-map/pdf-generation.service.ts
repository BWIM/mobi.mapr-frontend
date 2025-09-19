import { Injectable } from '@angular/core';
import { ProjectsService } from '../../projects/projects.service';
import jsPDF from 'jspdf';
import { print, downloadBlob } from '@camptocamp/inkmap';
import { ExportMapService } from './export-map.service';
import { MapV2Service } from '../map-v2.service';

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
  private readonly paperSizes: { [key in PaperSize]: [number, number] } = {
    a4: [210, 297],  // A4 in mm (width, height)
    a3: [297, 420],  // A3 in mm
    a2: [420, 594],  // A2 in mm
    a1: [594, 841],  // A1 in mm
    a0: [841, 1189]  // A0 in mm
  };

  private readonly modeIcons: { [key in string]: string } = {
    'Fahrrad': 'assets/icons/bicycle.png',
    'Auto': 'assets/icons/car.png',
    'Fußgänger': 'assets/icons/walk.png',
    'ÖPNV': 'assets/icons/tram.png',
  };

  private readonly activityIcons: { [key in string]: string } = {
    'Einkauf': 'assets/icons/shopping-cart.png',
    'Erledigung': 'assets/icons/clipboard.png',
    'Freizeit': 'assets/icons/resting.png',
  };

  private readonly activityCount: { [key in string]: number } = {
    'Einkauf': 3,
    'Erledigung': 12,
    'Freizeit': 14,
  };


  private createGeoStylerStyle(): any {
    return {
      name: 'BWIM Score Style',
      rules: [
        {
          name: 'Score 0 - No Data',
          filter: ['<=', 'index', 0],
          symbolizers: [{
            kind: 'Fill',
            color: '#808080',
            opacity: 0,
            outlineColor: '#808080',
            outlineOpacity: 0.8,
            outlineWidth: 0.5
          }]
        },
        {
          name: 'Score 0-0.35 - Very Low',
          filter: ['&&', ['>', 'index', 0], ['<=', 'index', 0.35]],
          symbolizers: [{
            kind: 'Fill',
            color: '#32612D',
            opacity: 0.6,
            outlineColor: '#32612D',
            outlineOpacity: 0.8,
            outlineWidth: 0.1
          }]
        },
        {
          name: 'Score 0.35-0.5 - Low',
          filter: ['&&', ['>', 'index', 0.35], ['<=', 'index', 0.5]],
          symbolizers: [{
            kind: 'Fill',
            color: '#3CB043',
            opacity: 0.6,
            outlineColor: '#3CB043',
            outlineOpacity: 0.8,
            outlineWidth: 0.1
          }]
        },
        {
          name: 'Score 0.5-0.71 - Medium',
          filter: ['&&', ['>', 'index', 0.5], ['<=', 'index', 0.71]],
          symbolizers: [{
            kind: 'Fill',
            color: '#FFED00',
            opacity: 0.6,
            outlineColor: '#FFED00',
            outlineOpacity: 0.8,
            outlineWidth: 0.1
          }]
        },
        {
          name: 'Score 0.71-1.0 - High',
          filter: ['&&', ['>', 'index', 0.71], ['<=', 'index', 1.0]],
          symbolizers: [{
            kind: 'Fill',
            color: '#ed7014',
            opacity: 0.6,
            outlineColor: '#ed7014',
            outlineOpacity: 0.8,
            outlineWidth: 0.1
          }]
        },
        {
          name: 'Score 1.0-1.41 - Very High',
          filter: ['&&', ['>', 'index', 1.0], ['<=', 'index', 1.41]],
          symbolizers: [{
            kind: 'Fill',
            color: '#C21807',
            opacity: 0.6,
            outlineColor: '#C21807',
            outlineOpacity: 0.8,
            outlineWidth: 0.1
          }]
        },
        {
          name: 'Score > 1.41 - Critical',
          filter: ['>', 'index', 1.41],
          symbolizers: [{
            kind: 'Fill',
            color: '#482683',
            opacity: 0.6,
            outlineColor: '#482683',
            outlineOpacity: 0.8,
            outlineWidth: 0.1
          }]
        }
      ]
    };
  }

  constructor(
    private exportMapService: ExportMapService,
    private mapService: MapV2Service,
    private projectsService: ProjectsService
  ) { }

  private async addProjectDetails(pdf: jsPDF, project: any, pageWidth: number, pageHeight: number): Promise<void> {
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
    let detailsY = y + fontSize / 2;
    let textX = x + 20 * scaleFactor;

    // Modes with icons
    if (project.profile_modes && Array.isArray(project.profile_modes)) {
      const label = 'Modi:';
      pdf.setFontSize(detailsFontSize);
      pdf.setFont('helvetica', 'bold');
      pdf.text(label, x, detailsY);

      // Display modes with icons
      let currentX = textX;
      for (const mode of project.profile_modes) {
        const iconPath = this.modeIcons[mode];
        if (iconPath) {
          try {
            const iconBase64 = await this.loadImageAsBase64(iconPath);
            if (iconBase64) {
              const iconSize = 4 * scaleFactor; // 4mm icon size
              pdf.addImage(iconBase64, 'PNG', currentX, detailsY - iconSize / 2, iconSize, iconSize);
              currentX += iconSize + 2 * scaleFactor; // Add spacing between icons
            }
          } catch (error) {
            console.warn(`Could not load mode icon for ${mode}:`, error);
          }
        }
      }

      // // Add mode names below icons
      // const modeNamesText = project.profile_modes.join(', ');
      // pdf.setFont('helvetica', 'normal');
      // pdf.text(modeNamesText, textX, detailsY + 6 * scaleFactor);
      detailsY += detailsFontSize; // Extra space for icons
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
      detailsY += detailsFontSize / 2;
    }

    // Activities with icons
    if (project.activities && Array.isArray(project.activities)) {
      const activityCounts: { [key in string]: number } = {};
      project.activities.forEach((act: string) => {
        activityCounts[act] = (activityCounts[act] || 0) + 1;
      });

      const label = 'Aktivitäten:';
      pdf.setFontSize(detailsFontSize);
      pdf.setFont('helvetica', 'bold');
      pdf.text(label, x, detailsY);

      // Display activities with icons in front of text
      let currentY = detailsY
      for (const [act, count] of Object.entries(activityCounts)) {
        const iconPath = this.activityIcons[act];
        if (iconPath) {
          try {
            const iconBase64 = await this.loadImageAsBase64(iconPath);
            if (iconBase64) {
              const iconSize = 4 * scaleFactor; // 4mm icon size
              // Place icon to the left of the text
              pdf.addImage(iconBase64, 'PNG', textX, currentY - iconSize / 2, iconSize, iconSize);

              // Add activity name and count to the right of the icon
              const activityText = `${act} (${count})`;
              pdf.setFont('helvetica', 'normal');
              pdf.text(activityText, textX + iconSize + 2 * scaleFactor, currentY);

              currentY += detailsFontSize / 2 + 2 * scaleFactor; // Move to next line
            }
          } catch (error) {
            console.warn(`Could not load activity icon for ${act}:`, error);
            // Still add text even if icon fails to load
            const activityText = `${act} (${count})`;
            pdf.setFont('helvetica', 'normal');
            pdf.text(activityText, textX, currentY);
            currentY += detailsFontSize / 2 + 2 * scaleFactor;
          }
        }
      }
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

  private getFilename(project: any): string {
    const now = new Date();
    const formattedDate = now.toISOString().split('T')[0];
    const formattedTime = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const sanitizedProjectName = project.project_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return `${formattedDate}_${formattedTime}_${sanitizedProjectName}.pdf`;
  }

  private zoomToScale(zoom: number, dpi: number, latitude: number = 0): number {
    // meters per pixel at given zoom & latitude
    const resolution = 156543.033928 * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom);

    // convert resolution (m/px) to scale denominator
    // scale = (ground_resolution * dpi) / meters_per_inch
    const metersPerInch = 0.0254;
    const scaleDenominator = resolution * dpi / metersPerInch;

    return scaleDenominator;
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

      // Get paper dimensions in mm
      const [mmWidth, mmHeight] = options.orientation === 'landscape'
        ? [this.paperSizes[options.paperSize][1], this.paperSizes[options.paperSize][0]]
        : [this.paperSizes[options.paperSize][0], this.paperSizes[options.paperSize][1]];

      const margin = 0;
      const mapWidth = mmWidth - 2 * margin;
      const mapHeight = mmHeight - 2 * margin;


      let size = [this.paperSizes[options.paperSize][0], this.paperSizes[options.paperSize][1], "mm"]
      if (options.orientation === 'landscape') {
        size = [size[1], size[0], "mm"];
      }
      const center = this.mapService.getMap()?.getCenter();
      const zoom = this.mapService.getMap()?.getZoom();
      let scale = 2000000;
      if (zoom) {
        scale = this.zoomToScale(zoom, options.resolution, center?.lat);
      }
      const geodataSource = this.mapService.getMap()?.getStyle().sources['geodata'];
      let mapURL = '';
      if (geodataSource && 'tiles' in geodataSource && geodataSource.tiles) {
        mapURL = geodataSource.tiles[0];
        console.log('Map URL:', mapURL);
      } else {
        console.warn('Geodata source or tiles not available');
      }

      if (!this.mapService.currentProject) {
        throw new Error('No current project selected');
      }

      let geojson: any;
      try {
        geojson = await this.mapService.getGeojson();
        console.log('Geojson:', geojson);

        if (!geojson) {
          throw new Error('Failed to fetch geojson data');
        }
      } catch (error) {
        console.error('Error fetching geojson:', error);
        throw new Error(`Failed to fetch geojson data: ${error}`);
      }

      const geoStylerStyle = this.createGeoStylerStyle();

      const specValue = {
        "layers": [
          {
            "type": "XYZ",
            "url": "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            "attribution": "© OpenStreetMap contributors"
          },
          {
            "type": "GeoJSON",
            "geojson": geojson,
            "attribution": "© bwim",
            "opacity": 1.0,
            "style": geoStylerStyle
          }
        ],
        "size": size,
        "center": [center?.lng, center?.lat],
        "dpi": options.resolution,
        "scale": scale,
        "scaleBar": false,
        "projection": "EPSG:3857",
        "northArrow": false,
        "attributions": false
      };

      // Generate map image using inkmap
      console.log('Generating map image with inkmap...');
      const blob = await print(specValue);
      console.log('Blob:', blob);

      // Create PDF
      const pdf = new jsPDF({
        orientation: mmWidth > mmHeight ? 'l' : 'p',
        unit: 'mm',
        format: [mmWidth, mmHeight],
        compress: true
      });

      // Create an Object URL from the map image blob and add it to the PDF
      const imgUrl = URL.createObjectURL(blob);
      pdf.addImage(imgUrl, 'JPEG', margin, margin, mapWidth, mapHeight);

      // Add project details (overlay on top)
      await this.addProjectDetails(pdf, projectInfo, mmWidth, mmHeight);

      // Add logo (overlay on top)
      await this.addLogo(pdf, mmWidth, mmHeight);

      // Add legend and BWIM logo (overlay on top)
      await this.addLegendAndBWIMLogo(pdf, mmWidth, mmHeight, projectInfo);

      // Save the PDF
      console.log('Saving PDF');
      pdf.save(this.getFilename(projectInfo));

      // Clean up the object URL
      URL.revokeObjectURL(imgUrl);

      console.log('Inkmap-based export completed successfully');

    } catch (error) {
      console.error(`Fehler beim Generieren des PDFs:`, error);
      throw error;
    }
  }
}