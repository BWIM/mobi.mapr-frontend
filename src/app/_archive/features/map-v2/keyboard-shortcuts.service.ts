import { Injectable } from '@angular/core';
import { StatisticsService } from '../statistics/statistics.service';
// import { PdfGenerationService } from './pdf-generation.service';

import { ShareService } from '../share/share.service';
import { Subject } from 'rxjs';
import { ExportMapService } from './export-map/export-map.service';

export enum ShortcutAction {
  ZOOM_TO_FEATURES = 'ZOOM_TO_FEATURES',
  TOGGLE_FREEZE = 'TOGGLE_FREEZE',
  SHOW_STATISTICS = 'SHOW_STATISTICS',
  EXPORT_PDF_PORTRAIT = 'EXPORT_PDF_PORTRAIT',
  EXPORT_PDF_LANDSCAPE = 'EXPORT_PDF_LANDSCAPE',
  CREATE_SHARE = 'CREATE_SHARE',
  TOGGLE_HEXAGON_VIEW = 'TOGGLE_HEXAGON_VIEW',
  TOGGLE_SCORE_DISPLAY = 'TOGGLE_SCORE_DISPLAY',
  TOGGLE_GEMEINDE_VIEW = 'TOGGLE_GEMEINDE_VIEW',
  TOGGLE_LANDKREIS_VIEW = 'TOGGLE_LANDKREIS_VIEW'
}

@Injectable({
  providedIn: 'root'
})
export class KeyboardShortcutsService {
  private isFrozen = false;
  private projectInfo: any;
  private shortcutSubject = new Subject<ShortcutAction>();
  private frozenStateSubject = new Subject<boolean>();

  constructor(
    private statisticsService: StatisticsService,
    private shareService: ShareService,
    private exportMapService: ExportMapService
  ) {}

  setProjectInfo(info: any) {
    this.projectInfo = info;
  }

  setIsFrozen(frozen: boolean) {
    this.isFrozen = frozen;
    this.frozenStateSubject.next(frozen);
  }

  getIsFrozen(): boolean {
    return this.isFrozen;
  }

  getFrozenStateStream() {
    return this.frozenStateSubject.asObservable();
  }

  getShortcutStream() {
    return this.shortcutSubject.asObservable();
  }

  handleKeyboardEvent(event: KeyboardEvent): void {
    // Only handle shortcuts if no input element is focused
    if (document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA') {
      return;
    }

    switch(event.key.toLowerCase()) {
      case 'z':
        this.shortcutSubject.next(ShortcutAction.ZOOM_TO_FEATURES);
        break;
      case 's':
        this.statisticsService.visible = true;
        this.shortcutSubject.next(ShortcutAction.SHOW_STATISTICS);
        break;
      case 'e':
        this.exportMapService.showDialog();
        this.shortcutSubject.next(ShortcutAction.EXPORT_PDF_PORTRAIT);
        break;
      case 'h':
        this.shortcutSubject.next(ShortcutAction.TOGGLE_HEXAGON_VIEW);
        break;
      case 'f':
        this.shortcutSubject.next(ShortcutAction.TOGGLE_SCORE_DISPLAY);
        break;
      case 'g':
        this.shortcutSubject.next(ShortcutAction.TOGGLE_GEMEINDE_VIEW);
        break;
      case 'l':
        this.shortcutSubject.next(ShortcutAction.TOGGLE_LANDKREIS_VIEW);
        break;
    }
  }
} 