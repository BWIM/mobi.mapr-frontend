import { Injectable } from '@angular/core';
import { StatisticsService } from '../statistics/statistics.service';
import { PdfGenerationService } from './pdf-generation.service';
import { ShareService } from '../share/share.service';
import { Subject } from 'rxjs';

export enum ShortcutAction {
  ZOOM_TO_FEATURES = 'ZOOM_TO_FEATURES',
  TOGGLE_FREEZE = 'TOGGLE_FREEZE',
  SHOW_STATISTICS = 'SHOW_STATISTICS',
  EXPORT_PDF_PORTRAIT = 'EXPORT_PDF_PORTRAIT',
  EXPORT_PDF_LANDSCAPE = 'EXPORT_PDF_LANDSCAPE',
  CREATE_SHARE = 'CREATE_SHARE'
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
    private pdfGenerationService: PdfGenerationService,
    private shareService: ShareService
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
      case 'c':
        this.shortcutSubject.next(ShortcutAction.ZOOM_TO_FEATURES);
        break;
      case 'f':
        this.setIsFrozen(!this.isFrozen);
        this.shortcutSubject.next(ShortcutAction.TOGGLE_FREEZE);
        break;
      case 's':
        this.statisticsService.visible = true;
        this.shortcutSubject.next(ShortcutAction.SHOW_STATISTICS);
        break;
      case 'h':
        this.pdfGenerationService.exportToPDFPortrait();
        this.shortcutSubject.next(ShortcutAction.EXPORT_PDF_PORTRAIT);
        break;
      case 'q':
        this.pdfGenerationService.exportToPDFLandscape();
        this.shortcutSubject.next(ShortcutAction.EXPORT_PDF_LANDSCAPE);
        break;
    }
  }
} 