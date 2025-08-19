import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PdfExportOptions } from './export-map.component';

@Injectable({
  providedIn: 'root'
})
export class ExportMapService {
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
