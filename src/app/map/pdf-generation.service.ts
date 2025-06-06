import {Injectable} from '@angular/core';
import jsPDF, { GState } from 'jspdf';
import {MapService} from './map.service';
import {ProjectsService} from '../projects/projects.service';

export type PaperSize = 'a4' | 'a3' | 'a2' | 'a1' | 'a0';
export type Orientation = 'portrait' | 'landscape';

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

  constructor(
    private mapService: MapService,
    private projectsService: ProjectsService
  ) {}

  centerMapOnLayerWithPadding(layer: any, orientation: Orientation, paperSize: PaperSize = 'a4') {
    const map = this.mapService.getMap();
    if (!map) {
      console.error('Map could not be found.');
      return;
    }

    const extent = layer.getSource().getExtent();
    const dim = this.paperSizes[paperSize];
    const resolution = 300;
    
    // Setze temporär die PDF-Größe für korrekte Zoom-Berechnung
    const [width, height] = orientation === 'landscape' 
      ? [Math.round((dim[0] * resolution) / 25.4), Math.round((dim[1] * resolution) / 25.4)]
      : [Math.round((dim[1] * resolution) / 25.4), Math.round((dim[0] * resolution) / 25.4)];
    
    map.setSize([width, height]);

    const padding = orientation === 'portrait' 
      ? [10, 30, 60, 10]
      : [50, 20, 100, 10];

    map.getView().fit(extent, {
      size: [width, height],
      padding: padding,
      nearest: false
    });
  }

  private async addLogo(pdf: jsPDF, orientation: 'portrait' | 'landscape'): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = 'assets/images/logo_transparent.png';
      img.onload = () => {
        const imgWidth = 40;  // Logo Breite in mm
        const imgHeight = (img.height * imgWidth) / img.width;
        const pageWidth = orientation === 'portrait' ? 210 : 297;  // A4 Maße
        const margin = orientation === 'portrait' ? 10 : 0;  // Abstand vom Rand in mm
        
        pdf.addImage(
          img, 
          'PNG',
          pageWidth - imgWidth,  // X-Position (von rechts)
          margin,  // Y-Position (von oben)
          imgWidth,
          imgHeight
        );
        resolve();
      };
    });
  }

  private async addBWIMLogo(pdf: jsPDF, orientation: 'portrait' | 'landscape'): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = 'assets/images/BWIM.png';
      img.onload = () => {
        const imgWidth = 30;  // Logo Breite in mm
        const imgHeight = (img.height * imgWidth) / img.width;
        const pageWidth = orientation === 'portrait' ? 210 : 297;  // A4 Maße
        const pageHeight = orientation === 'portrait' ? 297 : 210;  // A4 Maße
        const margin = 5;  // Abstand vom Rand in mm
        const textSpace = 7;  // Platz für Text unter dem Logo in mm
        
        pdf.addImage(
          img, 
          'PNG',
          pageWidth - imgWidth - margin,  // X-Position (von rechts)
          pageHeight - imgHeight - margin - textSpace,  // Y-Position (von unten + Textplatz)
          imgWidth,
          imgHeight
        );
        resolve();
      };
    });
  }

  private async addLegend(pdf: jsPDF, orientation: 'portrait' | 'landscape'): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = 'assets/images/legend.png';
      img.onload = () => {
        const imgWidth = 18;  // Legende noch kleiner (von 20 auf 15)
        const imgHeight = (img.height * imgWidth) / img.width;
        const pageWidth = orientation === 'portrait' ? 210 : 297;  // A4 Maße
        const pageHeight = orientation === 'portrait' ? 297 : 210;  // A4 Maße
        const margin = 5;  // Abstand vom Rand in mm
        const padding = 2;   // Padding für Hintergrund in mm
        const cornerRadius = 3; // Radius für abgerundete Ecken in mm
        const textSpace = 7;  // Platz für Text unter dem Logo in mm
        
        // Position berechnen (weiter nach unten)
        const bwimLogoHeight = 18 * (img.height / img.width);
        const yPosition = pageHeight - bwimLogoHeight - margin - textSpace - (imgHeight / 2); // Näher am unteren Rand

        // Weißen, noch transparenteren Hintergrund zeichnen
        pdf.setFillColor(255, 255, 255);
        pdf.setGState(new GState({opacity: 0.4})); // Noch transparenter (von 0.8 auf 0.6)
        pdf.roundedRect(
          pageWidth - imgWidth - margin - padding,
          yPosition - padding,
          imgWidth + (padding * 2),
          imgHeight + (padding * 2),
          cornerRadius,
          cornerRadius,
          'F'
        );

        // Legende zeichnen
        pdf.setGState(new GState({opacity: 1.0}));
        pdf.addImage(
          img,
          'PNG',
          pageWidth - imgWidth - margin,
          yPosition,
          imgWidth,
          imgHeight
        );
        resolve();
      };
    });
  }

  private async addProjectDetails(pdf: jsPDF, orientation: 'portrait' | 'landscape', project: any): Promise<void> {
    const pageWidth = orientation === 'portrait' ? 210 : 297;  // A4 Maße
    const pageHeight = orientation === 'portrait' ? 297 : 210;  // A4 Maße

    // Projektname größer und weiter rechts oben
    pdf.setFont('times', 'bold');
    pdf.setFontSize(20);
    pdf.text(project.project_name, 10, 15);
    const maxWidth = orientation === 'portrait' ? 150 : 250;

    // Beschreibung nur hinzufügen, wenn verfügbar
    if (project.project_description) {
      pdf.setFont('times', 'normal');
      pdf.setFontSize(10);
      
      const lines = pdf.splitTextToSize(project.project_description, maxWidth);
      pdf.text(lines, 10, 20);
    }

    // Zusätzliche Projektinformationen unten links
    const margin = 10;
    
    pdf.setFont('times', 'normal');
    pdf.setFontSize(10);
    
    const personas = project.persona_abbreviations ? "Personas: " + project.persona_abbreviations : "";
    const profiles = project.profile_modes ? "Modi: " + project.profile_modes : "";
    const activities = project.activity_abbreviations ? pdf.splitTextToSize("Aktivitäten: " + project.activity_abbreviations, maxWidth) : [];
    
    // Gesamthöhe berechnen
    const lineHeight = 4;
    const startY = pageHeight - 5;
    
    const textHeight = lineHeight * (2 + activities.length);
    const totalHeight = textHeight + 6;
    
    // Hintergrund
    pdf.setFillColor(255, 255, 255);
    pdf.setGState(new GState({opacity: 0.6}));
    pdf.roundedRect(
      margin - 3,
      startY - totalHeight,
      maxWidth + 6,
      totalHeight,
      3,
      3,
      'F'
    );
    
    // Text zeichnen
    pdf.setGState(new GState({opacity: 1.0}));
    pdf.setTextColor(0, 0, 0);
    
    let currentY = startY - totalHeight + lineHeight;
    
    if (profiles) {
      pdf.text(profiles, margin, currentY);
      currentY += lineHeight;
    }

    if (personas) {
      pdf.text(personas, margin, currentY);
      currentY += lineHeight;
    }
    
    if (activities.length > 0) {
      pdf.text(activities, margin, currentY);
    }

    // Copyright
    if (project.creation_date) {
      pdf.setFont('times', 'normal');
      pdf.setFontSize(6);
      const copyrightText = "© bwim, " + project.creation_date;
      pdf.text(copyrightText, pageWidth - 10, pageHeight - 10, { align: 'right' });
    }
  }

  private async generatePDF(orientation: Orientation, paperSize: PaperSize = 'a4'): Promise<jsPDF> {
    const map = this.mapService.getMap();
    const layer = this.mapService.getMainLayer();

    if (!map || !layer) {
      throw new Error('Map or layer could not be found.');
    }

    const dim = this.paperSizes[paperSize];
    const resolution: number = 150;
    
    const [width, height] = orientation === 'landscape' 
      ? [Math.round((dim[0] * resolution) / 25.4), Math.round((dim[1] * resolution) / 25.4)]
      : [Math.round((dim[1] * resolution) / 25.4), Math.round((dim[0] * resolution) / 25.4)];

    // Einmalige Größenanpassung
    const originalSize = map.getSize();
    map.setSize([width, height]);

    // Fit extent
    const extent = layer.getSource()?.getExtent();
    if (!extent) {
      throw new Error('Layer extent could not be found.');
    }
    const padding = orientation === 'portrait' 
      ? [10, 20, 50, 10]
      : [50, 50, 50, 50];

    map.getView().fit(extent, {
      size: [width, height],
      padding: padding,
      nearest: false
    });

    return new Promise((resolve) => {
      const renderComplete = () => {
        const mapCanvas: HTMLCanvasElement = document.createElement('canvas');
        mapCanvas.width = width;
        mapCanvas.height = height;
        const mapContext: CanvasRenderingContext2D | null = mapCanvas.getContext('2d', {
          alpha: false,
          willReadFrequently: true
        });

        if (!mapContext) {
          throw new Error('Failed to get canvas context.');
        }

        mapContext.fillStyle = '#ffffff';
        mapContext.fillRect(0, 0, width, height);

        Array.from(document.querySelectorAll('canvas'))
          .filter((canvas: HTMLCanvasElement) => canvas.width > 0)
          .forEach((canvas: HTMLCanvasElement) => {
            mapContext.globalAlpha = parseFloat(canvas.style.opacity) || 1;
            mapContext.drawImage(canvas, 0, 0);
          });

        // Größe wiederherstellen
        map.setSize(originalSize);

        const pdf: jsPDF = new jsPDF(orientation, undefined, paperSize);
        const [pdfWidth, pdfHeight] = orientation === 'landscape' 
          ? [dim[0], dim[1]]
          : [dim[1], dim[0]];
        
        // Qualitätseinstellungen für die JPEG-Komprimierung
        const imageQuality = 1; // Guter Kompromiss zwischen Qualität und Dateigröße
        pdf.addImage(
          mapCanvas.toDataURL('image/jpeg', imageQuality),
          'JPEG',
          0,
          0,
          pdfWidth,
          pdfHeight
        );
        resolve(pdf);
      };

      // Asynchrones Rendering
      map.once('rendercomplete', renderComplete);
      map.render();
    });
  }

  private getFilename(project: any): string {
    const now = new Date();
    const formattedDate = now.toISOString().split('T')[0];
    const formattedTime = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const sanitizedProjectName = project.project_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return `${formattedDate}_${formattedTime}_${sanitizedProjectName}.pdf`;
  }

  private async exportToPDF(orientation: Orientation, paperSize: PaperSize = 'a4'): Promise<void> {
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

      const pdf = await this.generatePDF(orientation, paperSize);
      
      await this.addProjectDetails(pdf, orientation, projectInfo);
      await this.addLogo(pdf, orientation);
      await this.addLegend(pdf, orientation);
      await this.addBWIMLogo(pdf, orientation);

      const filename = this.getFilename(projectInfo);
      pdf.save(filename);
    } catch (error) {
      console.error(`Fehler beim Generieren des PDFs im ${orientation === 'portrait' ? 'Hoch' : 'Quer'}format:`, error);
    }
  }

  async exportToPDFPortrait(paperSize: PaperSize = 'a4'): Promise<void> {
    await this.exportToPDF('portrait', paperSize);
  }

  async exportToPDFLandscape(paperSize: PaperSize = 'a4'): Promise<void> {
    await this.exportToPDF('landscape', paperSize);
  }
}