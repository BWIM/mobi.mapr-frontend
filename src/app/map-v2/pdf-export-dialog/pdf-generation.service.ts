import {Injectable} from '@angular/core';
import { MapV2Service } from '../map-v2.service';
import fontkit from '@pdf-lib/fontkit';
import { ProjectsService } from '../../projects/projects.service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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


  // Helper to convert mm to inches
  private mmToInch(mm: number): number {
    return mm / 25.4;
  }

  // Helper to convert mm to PDF points
  private mmToPt(mm: number): number {
    return mm * 2.83465;
  }

  private async getMapCanvas(paperSize: PaperSize, orientation: Orientation, mapExtent: MapExtent, resolution: number): Promise<HTMLCanvasElement> {
    const map = this.mapService.getMap();
    if (!map) {
      throw new Error('Map is not available');
    }
    
    const container = map?.getContainer();
    const originalSize = {
      width: container.clientWidth,
      height: container.clientHeight,
      styleWidth: container.style.width,
      styleHeight: container.style.height,
    };

    // Calculate physical size in mm
    const [mmWidth, mmHeight] = orientation === 'landscape' 
      ? [this.paperSizes[paperSize][0], this.paperSizes[paperSize][1]]
      : [this.paperSizes[paperSize][1], this.paperSizes[paperSize][0]];

    // Convert to inches
    const inchWidth = this.mmToInch(mmWidth);
    const inchHeight = this.mmToInch(mmHeight);

    // Calculate pixel size for export (DPI)
    const pxWidth = Math.round(inchWidth * resolution);
    const pxHeight = Math.round(inchHeight * resolution);

    // Resize the map container to export size (in px)
    container.style.width = pxWidth + 'px';
    container.style.height = pxHeight + 'px';
    map.resize();

    // Optionally handle map extent (TODO: see previous note)
    if (mapExtent === 'full') {
      // Get bounds from your service or backend
      const bounds = this.mapService.getDataBounds(); // You need to implement this
      if (bounds) {
        const { LngLatBounds } = await import('maplibre-gl');
        const mapBounds = new LngLatBounds([bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]);
        map.fitBounds(mapBounds, {
          padding: 20, // or adjust based on paper size
          duration: 0
        });
        await new Promise((resolve) => map.once('idle', resolve));
      }
    }

    // Wait for the map to render fully
    await new Promise((resolve) => map.once('idle', resolve));

    // Copy canvas to new canvas to keep image
    const mapCanvas = map.getCanvas();
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = pxWidth;
    exportCanvas.height = pxHeight;
    const ctx = exportCanvas.getContext('2d');
    ctx?.drawImage(mapCanvas, 0, 0, pxWidth, pxHeight);

    // Restore original size
    container.style.width = originalSize.styleWidth;
    container.style.height = originalSize.styleHeight;
    map.resize();

    return exportCanvas;
  }

  private async addProjectDetails(
    pdfDoc: PDFDocument,
    page: any,
    pageSize: { width: number, height: number },
    orientation: Orientation,
    project: any,
    corbelBoldFont: any,
    logoWidth: number,
    logoMarginRight: number,
    logoMarginTop: number,
    logoHeight: number,
    corbelFont: any
  ): Promise<void> {
    // Project name (bold)
    const font = corbelBoldFont;
    const fontSize = logoHeight * 0.35;
    const x = 10;
    const y = pageSize.height - 50;
    const maxWidth = pageSize.width - logoWidth - logoMarginRight - x;
    let text = project.project_name;
    let textWidth = font.widthOfTextAtSize(text, fontSize);
    if (textWidth > maxWidth) {
      while (text.length > 0 && font.widthOfTextAtSize(text + '…', fontSize) > maxWidth) {
        text = text.slice(0, -1);
      }
      text += '…';
    }
    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });

    // Details font
    const detailsFont = corbelFont;
    const detailsFontSize = fontSize * 0.5;
    let detailsY = y - fontSize - 2;
    let iconSize = detailsFontSize * 1.2;
    let iconGap = 8;

    // 1. Modes (icons)
    if (project.profile_modes && Array.isArray(project.profile_modes)) {
      const modeIconFiles: {[key: string]: string} = {
        'Fahrrad': 'bicycle.png',
        'Auto': 'car.png',
        'ÖPNV': 'tram.png',
        'Fußgänger': 'walk.png',
      };
      // Draw label in bold
      const label = 'Modi:';
      page.drawText(label, {
        x,
        y: detailsY + iconSize * 0.1,
        size: detailsFontSize,
        font: corbelBoldFont,
        color: rgb(0, 0, 0),
      });
      let modeX = x + corbelBoldFont.widthOfTextAtSize(label, detailsFontSize) + iconGap;
      for (const mode of project.profile_modes) {
        const iconFile = modeIconFiles[mode];
        if (iconFile) {
          const iconUrl = `assets/icons/${iconFile}`;
          const iconBytes = await fetch(iconUrl).then(res => res.arrayBuffer());
          const iconImg = await pdfDoc.embedPng(iconBytes);
          page.drawImage(iconImg, {
            x: modeX,
            y: detailsY,
            width: iconSize,
            height: iconSize,
          });
          modeX += iconSize + 2;
        }
      }
      detailsY -= iconSize + 2;
    }

    // 2. Personas
    if (project.persona_abbreviations && Array.isArray(project.persona_abbreviations)) {
      const label = 'Personen:';
      page.drawText(label, {
        x,
        y: detailsY,
        size: detailsFontSize,
        font: corbelBoldFont,
        color: rgb(0, 0, 0),
      });
      const personasText = project.persona_abbreviations.length === 12 ? 'Alle Personengruppen' : 'Auswahl Personengruppen';
      page.drawText(` ${personasText}`, {
        x: x + corbelBoldFont.widthOfTextAtSize(label, detailsFontSize) + 2,
        y: detailsY,
        size: detailsFontSize,
        font: detailsFont,
        color: rgb(0, 0, 0),
      });
      detailsY -= detailsFontSize + 10;
    }

    // 3. Activities (icons + counts)
    if (project.activities && Array.isArray(project.activities)) {
      const activityIconFiles: {[key: string]: string} = {
        'Einkauf': 'shopping-cart.png',
        'private Erledigung': 'clipboard.png',
        'Freizeit': 'resting.png',
      };
      // Count occurrences
      const activityCounts: {[key: string]: number} = {};
      project.activities.forEach((act: string) => {
        activityCounts[act] = (activityCounts[act] || 0) + 1;
      });
      // Draw label in bold
      const label = 'Aktivitäten:';
      page.drawText(label, {
        x,
        y: detailsY + iconSize * 0.1,
        size: detailsFontSize,
        font: corbelBoldFont,
        color: rgb(0, 0, 0),
      });
      let actX = x + corbelBoldFont.widthOfTextAtSize(label, detailsFontSize) + iconGap;
      for (const act of Object.keys(activityCounts)) {
        const iconFile = activityIconFiles[act];
        if (iconFile) {
          const iconUrl = `assets/icons/${iconFile}`;
          const iconBytes = await fetch(iconUrl).then(res => res.arrayBuffer());
          const iconImg = await pdfDoc.embedPng(iconBytes);
          page.drawImage(iconImg, {
            x: actX,
            y: detailsY,
            width: iconSize,
            height: iconSize,
          });
          actX += iconSize + 2;
        }
        // Draw activity name and count
        const max = this.activityCount[act] || activityCounts[act];
        const activityLabel = `${act} ${activityCounts[act]}/${max}`;
        page.drawText(activityLabel, {
          x: actX,
          y: detailsY + iconSize * 0.1,
          size: detailsFontSize,
          font: detailsFont,
          color: rgb(0, 0, 0),
        });
        actX += detailsFont.widthOfTextAtSize(activityLabel, detailsFontSize) + iconGap;
      }
    }
  }

  private async addLogo(pdfDoc: PDFDocument, page: any, pageSize: { width: number, height: number }, orientation: Orientation): Promise<void> {
    try {
      const logoResponse = await fetch('assets/images/logo_transparent.png');
      const logoBytes = await logoResponse.arrayBuffer();
      const logoImage = await pdfDoc.embedPng(logoBytes);

      // 30% of the page width
      const logoWidth = pageSize.width * 0.3;
      const aspectRatio = logoImage.height / logoImage.width;
      const logoHeight = logoWidth * aspectRatio;
      const marginTop = 10; // points
      const x = (pageSize.width - logoWidth) - 20;
      const y = pageSize.height - logoHeight - marginTop;

      page.drawImage(logoImage, {
        x,
        y,
        width: logoWidth,
        height: logoHeight,
      });
    } catch (error) {
      console.warn('Could not load logo:', error);
    }
  }

  private async addLegendAndBWIMLogo(pdfDoc: PDFDocument, page: any, pageSize: { width: number, height: number }, project?: any, corbelFont?: any): Promise<void> {
    try {
      // Fetch images
      const [legendResponse, bwimResponse] = await Promise.all([
        fetch('assets/images/legend.png'),
        fetch('assets/images/BWIM.png')
      ]);
      const [legendBytes, bwimBytes] = await Promise.all([
        legendResponse.arrayBuffer(),
        bwimResponse.arrayBuffer()
      ]);
      const legendImage = await pdfDoc.embedPng(legendBytes);
      const bwimImage = await pdfDoc.embedPng(bwimBytes);

      // Layout constants
      const marginBottom = 20; // points
      const marginLeft = 10; // points
      const totalHeight = pageSize.height * 0.3;
      const legendRatio = 0.7; // 70% legend, 30% logo
      const legendHeight = totalHeight * legendRatio;
      const bwimHeight = totalHeight * (1 - legendRatio);

      // Calculate legend size (portrait)
      const legendAspect = legendImage.height / legendImage.width;
      const legendWidth = legendHeight / legendAspect;

      // Calculate BWIM logo size (landscape)
      const bwimAspect = bwimImage.width / bwimImage.height;
      const bwimWidth = bwimHeight * bwimAspect;

      // X positions (right-aligned)
      const legendX = pageSize.width - legendWidth - marginLeft;
      const bwimX = pageSize.width - bwimWidth - marginLeft;

      // Y positions (stacked, from bottom)
      const bwimY = marginBottom;
      const legendY = bwimY + bwimHeight + 10;

      // Draw legend (portrait)
      page.drawImage(legendImage, {
        x: legendX,
        y: legendY,
        width: legendWidth,
        height: legendHeight,
      });

      // Draw BWIM logo (landscape)
      page.drawImage(bwimImage, {
        x: bwimX,
        y: bwimY,
        width: bwimWidth,
        height: bwimHeight,
      });

      // Draw copyright and date below the BWIM logo
      if (project && project.creation_date && corbelFont) {
        const copyrightText = `© BWIM, ${project.creation_date}`;
        const fontSize = 8;
        const textWidth = corbelFont.widthOfTextAtSize(copyrightText, fontSize);
        const textX = bwimX + bwimWidth - textWidth; // right-aligned with logo
        const marginBelowText = 3;
        const textY = bwimY - fontSize - marginBelowText; // below the logo
        page.drawText(copyrightText, {
          x: textX,
          y: textY,
          size: fontSize,
          font: corbelFont,
          color: rgb(0, 0, 0),
        });
      }
    } catch (error) {
      console.warn('Could not load legend or BWIM logo:', error);
    }
  }

  private async createPDF(mapImageDataUrl: string, pageSize: { width: number, height: number }, orientation: Orientation, project: any): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const corbelFontBytes = await fetch('assets/fonts/CORBEL.TTF').then(res => res.arrayBuffer());
    const corbelFont = await pdfDoc.embedFont(corbelFontBytes);
    const corbelBoldFontBytes = await fetch('assets/fonts/CORBEL_BOLD.TTF').then(res => res.arrayBuffer());
    const corbelBoldFont = await pdfDoc.embedFont(corbelBoldFontBytes);
    const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
  
    // Add map image
    const pngImage = await pdfDoc.embedPng(mapImageDataUrl);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageSize.width,
      height: pageSize.height,
    });

    // Calculate logo dimensions (must match addLogo)
    const logoWidth = pageSize.width * 0.3;
    const aspectRatio = pngImage.height / pngImage.width; // This is not correct for the logo, so we fetch the logo image
    const logoMarginTop = 10;
    const logoMarginRight = 20;
    // Fetch logo image to get correct aspect ratio
    const logoResponse = await fetch('assets/images/logo_transparent.png');
    const logoBytes = await logoResponse.arrayBuffer();
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoAspectRatio = logoImage.height / logoImage.width;
    const logoHeight = logoWidth * logoAspectRatio;

    // Add project name in bold, aligned with logo
    await this.addProjectDetails(
      pdfDoc,
      page,
      pageSize,
      orientation,
      project,
      corbelBoldFont,
      logoWidth,
      logoMarginRight,
      logoMarginTop,
      logoHeight,
      corbelFont
    );
    await this.addLogo(pdfDoc, page, pageSize, orientation);
    await this.addLegendAndBWIMLogo(pdfDoc, page, pageSize, project, corbelFont);
  
    return await pdfDoc.save();
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
      const projectInfo = await new Promise((resolve, reject) => {
        this.projectsService.getExportInfo().subscribe({
          next: (project) => resolve(project),
          error: (error) => {
            console.error('Fehler beim Laden der Projektdetails:', error);
            reject(error);
          }
        });
      });

      // Calculate page size in PDF points (1 pt = 1/72 inch)
      const [mmWidth, mmHeight] = options.orientation === 'landscape' 
        ? [this.paperSizes[options.paperSize][0], this.paperSizes[options.paperSize][1]]
        : [this.paperSizes[options.paperSize][1], this.paperSizes[options.paperSize][0]];
      const ptWidth = this.mmToPt(mmWidth);
      const ptHeight = this.mmToPt(mmHeight);

      // Get high-res map canvas
      const mapCanvas = await this.getMapCanvas(options.paperSize, options.orientation, options.mapExtent, options.resolution);
      const imageData = mapCanvas.toDataURL('image/png');

      const pdfBytes = await this.createPDF(imageData, { width: ptWidth, height: ptHeight }, options.orientation, projectInfo);

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = this.getFilename(projectInfo);
      link.click();
      
      // Clean up
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(`Fehler beim Generieren des PDFs:`, error);
      throw error;
    }
  }
}