import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PdfExportOptions } from './pdf-generation.service';

@Injectable({
  providedIn: 'root'
})
export class PdfExportService {
  private dialogVisible = new BehaviorSubject<boolean>(false);
  private defaultOptions: PdfExportOptions = {
    orientation: 'portrait',
    paperSize: 'a4',
    resolution: 300,
    mapExtent: 'current'
  };

  dialogVisible$ = this.dialogVisible.asObservable();

  showDialog() {
    this.dialogVisible.next(true);
  }

  hideDialog() {
    this.dialogVisible.next(false);
  }

  getDefaultOptions(): PdfExportOptions {
    return { ...this.defaultOptions };
  }
} 