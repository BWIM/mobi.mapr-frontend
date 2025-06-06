import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { RadioButtonModule } from 'primeng/radiobutton';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { PdfGenerationService, PaperSize, Orientation, MapExtent, PdfExportOptions } from '../pdf-generation.service';
import { PdfExportService } from '../pdf-export.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-pdf-export-dialog',
  standalone: true,
  imports: [
    CommonModule,
    DialogModule,
    ButtonModule,
    RadioButtonModule,
    DropdownModule,
    InputNumberModule,
    FormsModule,
    TranslateModule
  ],
  templateUrl: './pdf-export-dialog.component.html',
  styleUrl: './pdf-export-dialog.component.css'
})
export class PdfExportDialogComponent implements OnDestroy {
  visible: boolean = false;
  options: PdfExportOptions;
  private subscription: Subscription;

  paperSizes = [
    { label: 'A0', value: 'a0' },
    { label: 'A1', value: 'a1' },
    { label: 'A2', value: 'a2' },
    { label: 'A3', value: 'a3' },
    { label: 'A4', value: 'a4' }
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
    try {
      await this.pdfService.exportToPDF(this.options);
      this.pdfExportService.hideDialog();
    } catch (error) {
      console.error('Error exporting PDF:', error);
    }
  }

  onHide() {
    this.pdfExportService.hideDialog();
  }
} 