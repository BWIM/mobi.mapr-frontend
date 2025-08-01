import { Component, OnDestroy } from '@angular/core';
import { PdfGenerationService, PaperSize, Orientation, MapExtent, PdfExportOptions } from './pdf-generation.service';
import { PdfExportService } from './pdf-export.service';
import { Subscription } from 'rxjs';
import { SharedModule } from '../../shared/shared.module';

@Component({
  selector: 'app-pdf-export-dialog',
  standalone: true,
  imports: [
    SharedModule
  ],
  templateUrl: './pdf-export-dialog.component.html',
  styleUrl: './pdf-export-dialog.component.css'
})
export class PdfExportDialogComponent implements OnDestroy {
  visible: boolean = false;
  options: PdfExportOptions;
  isExporting: boolean = false;
  private subscription: Subscription;

  paperSizes = [
    // { label: 'A0', value: 'a0' },
    // { label: 'A1', value: 'a1' },
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
    private pdfService: PdfGenerationService,
    private pdfExportService: PdfExportService
  ) {
    this.options = this.pdfExportService.getDefaultOptions();
    this.subscription = this.pdfExportService.dialogVisible$.subscribe(
      visible => this.visible = visible
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  async exportPdf() {
    if (this.isExporting) return;
    
    this.isExporting = true;
    try {
      await this.pdfService.exportToPDF(this.options);
      this.pdfExportService.hideDialog();
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      this.isExporting = false;
    }
  }

  onHide() {
    if (!this.isExporting) {
      this.pdfExportService.hideDialog();
    }
  }

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
} 