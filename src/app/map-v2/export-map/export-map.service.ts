import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PdfExportOptions } from './export-map.component';
import { Map } from 'maplibre-gl';

@Injectable({
  providedIn: 'root'
})
export class ExportMapService {
  private dialogVisible = new BehaviorSubject<boolean>(false);
  private exportMapSubject = new BehaviorSubject<Map | null>(null);
  dialogVisible$ = this.dialogVisible.asObservable();

  showDialog() {
    this.dialogVisible.next(true);
  }

  hideDialog() {
    this.dialogVisible.next(false);
  }

  setMap(map: Map | null) {
    this.exportMapSubject.next(map);
  }

  getMap(): Map | null {
    return this.exportMapSubject.getValue();
  }
}
