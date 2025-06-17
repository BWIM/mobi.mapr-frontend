import {Injectable} from '@angular/core';
import jsPDF, { GState } from 'jspdf';
import {ProjectsService} from '../../projects/projects.service';
import * as olExtent from 'ol/extent';
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
  private readonly paperSizes: {[key in PaperSize]: [number, number]} = {
    a4: [297, 210],  // A4 in mm
    a3: [420, 297],  // A3 in mm
    a2: [594, 420],  // A2 in mm
    a1: [841, 594],  // A1 in mm
    a0: [1189, 841]  // A0 in mm
  };

  constructor(
    private mapService: MapV2Service,
    private projectsService: ProjectsService
  ) {}

  private getMapExtent(layer: any, mapExtent: MapExtent) {
    // const map = this.mapService.getMap();
    // if (!map) return null;
    // if (mapExtent === 'current') {
    //   const view = map.getView();
    //   if (!view) return null;
    //   return view.calculateExtent(map.getSize());
    // }
    // // For 'full', calculate the extent from all features if possible
    // const source = layer.getSource();
    // if (source && typeof source.getFeatures === 'function') {
    //   const features = source.getFeatures();
    //   if (features && features.length > 0) {
    //     // Use ol/extent to combine all feature extents
    //     let fullExtent = olExtent.createEmpty();
    //     features.forEach((feature: any) => {
    //       olExtent.extend(fullExtent, feature.getGeometry().getExtent());
    //     });
    //     return fullExtent;
    //   }
    // }
    // // Fallback to source extent if getFeatures is not available
    // if (source && typeof source.getExtent === 'function') {
    //   return source.getExtent();
    // }
    // // Fallback to current view if all else fails
    // const view = map.getView();
    // if (view) {
    //   return view.calculateExtent(map.getSize());
    // }
    // return null;
  }

  private async generatePDF(options: PdfExportOptions): Promise<jsPDF> {
  //   const map = this.mapService.getMap();
  //   const layer = this.mapService.getMainLayer();

  //   if (!map || !layer) {
  //     throw new Error('Map or layer could not be found.');
  //   }

  //   const dim = this.paperSizes[options.paperSize];
    
  //   const [width, height] = options.orientation === 'landscape' 
  //     ? [Math.round((dim[0] * options.resolution) / 25.4), Math.round((dim[1] * options.resolution) / 25.4)]
  //     : [Math.round((dim[1] * options.resolution) / 25.4), Math.round((dim[0] * options.resolution) / 25.4)];

  //   // Einmalige Größenanpassung
  //   const originalSize = map.getSize();
  //   map.setSize([width, height]);

  //   // Fit extent
  //   const extent = this.getMapExtent(layer, options.mapExtent);
  //   if (!extent) {
  //     throw new Error('Layer extent could not be found.');
  //   }
  //   if (options.mapExtent === 'full') {
  //     map.getView().fit(extent, {
  //       size: [width, height],
  //       // padding: padding,
  //       nearest: false
  //     });
  //   }
  //   // For 'current', do not change the view (no fit call)

  //   return new Promise((resolve) => {
  //     const renderComplete = () => {
  //       const mapCanvas: HTMLCanvasElement = document.createElement('canvas');
  //       mapCanvas.width = width;
  //       mapCanvas.height = height;
  //       const mapContext: CanvasRenderingContext2D | null = mapCanvas.getContext('2d', {
  //         alpha: false,
  //         willReadFrequently: true
  //       });

  //       if (!mapContext) {
  //         throw new Error('Failed to get canvas context.');
  //       }

  //       mapContext.fillStyle = '#ffffff';
  //       mapContext.fillRect(0, 0, width, height);

  //       Array.from(document.querySelectorAll('canvas'))
  //         .filter((canvas: HTMLCanvasElement) => canvas.width > 0)
  //         .forEach((canvas: HTMLCanvasElement) => {
  //           mapContext.globalAlpha = parseFloat(canvas.style.opacity) || 1;
  //           mapContext.drawImage(canvas, 0, 0);
  //         });

  //       // Größe wiederherstellen
  //       map.setSize(originalSize);

  //       const pdf: jsPDF = new jsPDF(options.orientation, undefined, options.paperSize);
  //       const [pdfWidth, pdfHeight] = options.orientation === 'landscape' 
  //         ? [dim[0], dim[1]]
  //         : [dim[1], dim[0]];
        
  //       // Qualitätseinstellungen für die JPEG-Komprimierung
  //       const imageQuality = 1; // Guter Kompromiss zwischen Qualität und Dateigröße
  //       pdf.addImage(
  //         mapCanvas.toDataURL('image/jpeg', imageQuality),
  //         'JPEG',
  //         0,
  //         0,
  //         pdfWidth,
  //         pdfHeight
  //       );
  //       resolve(pdf);
  //     };

  //     // Asynchrones Rendering
  //     map.once('rendercomplete', renderComplete);
  //     map.render();
  //   });
  // }

  // private getFilename(project: any): string {
  //   const now = new Date();
  //   const formattedDate = now.toISOString().split('T')[0];
  //   const formattedTime = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  //   const sanitizedProjectName = project.project_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  //   return `${formattedDate}_${formattedTime}_${sanitizedProjectName}.pdf`;
  // }

  // async exportToPDF(options: PdfExportOptions): Promise<void> {
  //   try {
  //     const projectInfo = await new Promise((resolve, reject) => {
  //       this.projectsService.getExportInfo().subscribe({
  //         next: (project) => resolve(project),
  //         error: (error) => {
  //           console.error('Fehler beim Laden der Projektdetails:', error);
  //           reject(error);
  //         }
  //       });
  //     });

  //     const pdf = await this.generatePDF(options);
      
  //     // await this.addProjectDetails(pdf, options.orientation, projectInfo);
  //     // await this.addLogo(pdf, options.orientation);
  //     // await this.addLegend(pdf, options.orientation);
  //     // await this.addBWIMLogo(pdf, options.orientation);

  //     const filename = this.getFilename(projectInfo);
  //     pdf.save(filename);
  //   } catch (error) {
  //     console.error(`Fehler beim Generieren des PDFs:`, error);
  //   }
  return new jsPDF();
  }

  async exportToPDFPortrait(paperSize: PaperSize = 'a4'): Promise<void> {
    // await this.exportToPDF({
    //   orientation: 'portrait',
    //   paperSize,
    //   resolution: 300,
    //   mapExtent: 'current'
    // });
  }

  async exportToPDFLandscape(paperSize: PaperSize = 'a4'): Promise<void> {
    // await this.exportToPDF({
    //   orientation: 'landscape',
    //   paperSize,
    //   resolution: 300,
    //   mapExtent: 'current'
    // });
  }
}