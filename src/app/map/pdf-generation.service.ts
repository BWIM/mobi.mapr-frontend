import {Injectable} from '@angular/core';
import jsPDF, { GState } from 'jspdf';
import {MapService} from './map.service';
import {ProjectsService} from '../projects/projects.service';

@Injectable({
  providedIn: 'root'
})
export class PdfGenerationService {
  constructor(
    private mapService: MapService,
    private projectsService: ProjectsService
  ) {}

  centerMapOnLayerWithPadding(layer: any, orientation: 'portrait' | 'landscape') {
    const map = this.mapService.getMap();
    if (!map) {
      console.error('Map could not be found.');
      return;
    }

    const extent = layer.getSource().getExtent();
    const dims = {
      a4: [297, 210]
    };
    const format = 'a4';
    const resolution = 300;
    const dim = dims[format];
    
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
      img.src = 'assets/img/logo_transparent.png';
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
      img.src = 'assets/img/BWIM.png';
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
      img.src = 'assets/img/legend.png';
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

  private async addProjectDetails(pdf: jsPDF, orientation: 'portrait' | 'landscape'): Promise<void> {
    return new Promise((resolve, reject) => {
      const project = sessionStorage.getItem('project');
      if (!project) {
        resolve();
        return;
      }
      const pageWidth = orientation === 'portrait' ? 210 : 297;  // A4 Maße
      const pageHeight = orientation === 'portrait' ? 297 : 210;  // A4 Maße

      this.projectsService.getExportInfo().subscribe({
        next: (project) => {
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
          const startY = pageHeight - 5; // Näher am Seitenrand (nur 5mm Abstand)
          
          // Berechne tatsächliche Höhe basierend auf dem Text
          const textHeight = lineHeight * (2 + activities.length);
          const totalHeight = textHeight + 6;
          
          // Hintergrund
          pdf.setFillColor(255, 255, 255);
          pdf.setGState(new GState({opacity: 0.6}));
          pdf.roundedRect(
            margin - 3,
            startY - totalHeight,
            maxWidth +6 ,
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

          resolve();
        },
        error: (error) => {
          console.error('Fehler beim Laden der Projektdetails:', error);
          resolve();
        }
      });
    });
  }

  private async generatePDF(orientation: 'portrait' | 'landscape'): Promise<jsPDF> {
    const map = this.mapService.getMap();
    const layer = this.mapService.getMainLayer();

    if (!map || !layer) {
      throw new Error('Map or layer could not be found.');
    }

    const dims: {[key: string]: [number, number]} = {
      a4: [297, 210]
    };

    const format: string = 'a4';
    const resolution: number = 300;
    const dim: [number, number] = dims[format];
    
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
      map.once('rendercomplete', async () => {
        const mapCanvas: HTMLCanvasElement = document.createElement('canvas');
        mapCanvas.width = width;
        mapCanvas.height = height;
        const mapContext: CanvasRenderingContext2D | null = mapCanvas.getContext('2d');

        if (!mapContext) {
          throw new Error('Failed to get canvas context.');
        }

        mapContext.fillStyle = '#ffffff';
        mapContext.fillRect(0, 0, width, height);

        const layers: NodeListOf<HTMLCanvasElement> = document.querySelectorAll('canvas');
        layers.forEach((canvas: HTMLCanvasElement) => {
          if (canvas.width > 0) {
            mapContext.globalAlpha = parseFloat(canvas.style.opacity) || 1;
            mapContext.drawImage(canvas, 0, 0);
          }
        });

        // Größe wiederherstellen
        map.setSize(originalSize);

        const pdf: jsPDF = new jsPDF(orientation, undefined, format);
        const [pdfWidth, pdfHeight] = orientation === 'landscape' 
          ? [dim[0], dim[1]]  // Landscape: 297 x 210
          : [dim[1], dim[0]]; // Portrait: 210 x 297
        pdf.addImage(mapCanvas.toDataURL('image/jpeg'), 'JPEG', 0, 0, pdfWidth, pdfHeight);
        resolve(pdf);
      });

      map.renderSync();
    });
  }

  private getFilename(): string {
    const now = new Date();
    const formattedDate = now.toISOString().split('T')[0];
    const formattedTime = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `${formattedDate}_${formattedTime}.pdf`;
  }

  async exportToPDFPortrait(): Promise<void> {
    try {
      const pdf = await this.generatePDF('portrait');
      
      await this.addProjectDetails(pdf, 'portrait');
      await this.addLogo(pdf, 'portrait');
      await this.addLegend(pdf, 'portrait');
      await this.addBWIMLogo(pdf, 'portrait');

      pdf.save(this.getFilename());
    } catch (error) {
      console.error('Fehler beim Generieren des PDFs im Hochformat:', error);
    }
  }

  async exportToPDFLandscape(): Promise<void> {
    try {
      const pdf = await this.generatePDF('landscape');
      
      await this.addProjectDetails(pdf, 'landscape');
      await this.addLogo(pdf, 'landscape');
      await this.addLegend(pdf, 'landscape');
      await this.addBWIMLogo(pdf, 'landscape');

      pdf.save(this.getFilename());
    } catch (error) {
      console.error('Fehler beim Generieren des PDFs im Querformat:', error);
    }
  }
}