import { Injectable, inject, signal, computed } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { AllCategoriesDialogData } from '../layout/right/analyze/overlay/all-categories-dialog.component';
import { PersonasDialogData } from '../layout/right/analyze/overlay/personas-dialog.component';
import { PlacesDialogData } from '../layout/right/analyze/places/places-dialog.component';
import { PersonaBreakdown } from './analyze.service';
import { AnalyzeFeatureFacadeService } from './analyze-feature-facade.service';

export type MobileSheet = 'none' | 'stats' | 'analyze';

export type AnalyzeStep = 'main' | 'activities' | 'personas' | 'places';

export type AnalyzeSubSheetPayload =
  | { type: 'analyze-activities'; data: AllCategoriesDialogData }
  | {
      type: 'analyze-personas';
      data: PersonasDialogData;
      personas?: PersonaBreakdown[];
    }
  | { type: 'analyze-places'; data: PlacesDialogData };

/** Matches Tailwind `md` breakpoint (768px). */
export const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

@Injectable({
  providedIn: 'root',
})
export class MobileUiService {
  private breakpointObserver = inject(BreakpointObserver);
  private analyzeFacade = inject(AnalyzeFeatureFacadeService);

  readonly isMobile = toSignal(
    this.breakpointObserver
      .observe(MOBILE_MEDIA_QUERY)
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  private activeSheet = signal<MobileSheet>('none');
  private step = signal<AnalyzeStep>('main');
  private subSheetPayload = signal<AnalyzeSubSheetPayload | null>(null);

  readonly sheet = this.activeSheet.asReadonly();
  readonly analyzeStep = this.step.asReadonly();
  readonly analyzeSubSheet = this.subSheetPayload.asReadonly();
  readonly isStatsOpen = computed(() => this.activeSheet() === 'stats');
  readonly isAnalyzeOpen = computed(() => this.activeSheet() === 'analyze');
  readonly isSheetOpen = computed(() => this.activeSheet() !== 'none');

  openStats(): void {
    if (!this.isMobile()) {
      return;
    }
    this.subSheetPayload.set(null);
    this.step.set('main');
    this.activeSheet.set('stats');
  }

  openAnalyze(): void {
    if (!this.isMobile()) {
      return;
    }
    this.subSheetPayload.set(null);
    this.step.set('main');
    this.analyzeFacade.connect();
    this.activeSheet.set('analyze');
  }

  openAnalyzeDetail(
    step: 'activities' | 'personas',
    data: AllCategoriesDialogData | PersonasDialogData,
    personas?: PersonaBreakdown[],
  ): void {
    if (!this.isMobile()) {
      return;
    }
    if (this.activeSheet() !== 'analyze') {
      this.analyzeFacade.connect();
      this.activeSheet.set('analyze');
    }
    this.step.set(step);
    if (step === 'activities') {
      this.subSheetPayload.set({
        type: 'analyze-activities',
        data: data as AllCategoriesDialogData,
      });
    } else {
      this.subSheetPayload.set({
        type: 'analyze-personas',
        data: data as PersonasDialogData,
        personas,
      });
    }
  }

  openAnalyzePlaces(data: PlacesDialogData): void {
    if (!this.isMobile()) {
      return;
    }
    if (this.activeSheet() !== 'analyze') {
      this.analyzeFacade.connect();
      this.activeSheet.set('analyze');
    }
    this.step.set('places');
    this.subSheetPayload.set({ type: 'analyze-places', data });
  }

  /** @deprecated Use openAnalyzeDetail / openAnalyzePlaces — kept for desktop analyze mobile branches */
  openAnalyzeSubSheet(
    type: 'analyze-activities' | 'analyze-personas' | 'analyze-places',
    data: AllCategoriesDialogData | PersonasDialogData | PlacesDialogData,
  ): void {
    if (type === 'analyze-activities') {
      this.openAnalyzeDetail('activities', data as AllCategoriesDialogData);
    } else if (type === 'analyze-personas') {
      this.openAnalyzeDetail('personas', data as PersonasDialogData);
    } else {
      this.openAnalyzePlaces(data as PlacesDialogData);
    }
  }

  backToAnalyze(): void {
    if (!this.isMobile()) {
      return;
    }
    this.subSheetPayload.set(null);
    this.step.set('main');
  }

  closeSheet(): void {
    this.subSheetPayload.set(null);
    this.step.set('main');
    this.activeSheet.set('none');
    this.analyzeFacade.disconnect();
  }

  closeAllSheets(): void {
    this.closeSheet();
  }
}
