import { Injectable, inject, signal, computed, effect, untracked } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { AllCategoriesDialogData } from '../layout/right/analyze/overlay/all-categories-dialog.component';
import { PlacesDialogData } from '../layout/right/analyze/places/places-dialog.component';
import { AnalyzeFeatureFacadeService } from './analyze-feature-facade.service';
import { ShareAccessService } from './share-access.service';

export type MobileSheet = 'none' | 'stats' | 'analyze';

export type AnalyzeStep = 'main' | 'activities' | 'places';

export type AnalyzeSubSheetPayload =
  | { type: 'analyze-activities'; data: AllCategoriesDialogData }
  | { type: 'analyze-places'; data: PlacesDialogData };

/** Matches Tailwind `lg` breakpoint (1024px). Phones and tablets use mobile layout. */
export const MOBILE_MEDIA_QUERY = '(max-width: 1023px)';

@Injectable({
  providedIn: 'root',
})
export class MobileUiService {
  private breakpointObserver = inject(BreakpointObserver);
  private analyzeFacade = inject(AnalyzeFeatureFacadeService);
  private shareAccess = inject(ShareAccessService);

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

  constructor() {
    // Close sheets whose feature the share disables (e.g. after a 403 from the backend).
    effect(() => {
      const sheet = this.activeSheet();
      const blocked =
        (sheet === 'stats' && !this.shareAccess.canUseStats()) ||
        (sheet === 'analyze' && !this.shareAccess.canAnalyze());
      if (blocked) {
        untracked(() => this.closeSheet());
      } else if (this.step() === 'places' && !this.shareAccess.canUsePlaces()) {
        untracked(() => this.backToAnalyze());
      }
    });
  }

  openStats(): void {
    if (!this.isMobile() || !this.shareAccess.canUseStats()) {
      return;
    }
    this.subSheetPayload.set(null);
    this.step.set('main');
    this.activeSheet.set('stats');
  }

  openAnalyze(): void {
    if (!this.isMobile() || !this.shareAccess.canAnalyze()) {
      return;
    }
    this.subSheetPayload.set(null);
    this.step.set('main');
    this.analyzeFacade.connect();
    this.activeSheet.set('analyze');
  }

  openAnalyzeDetail(
    step: 'activities',
    data: AllCategoriesDialogData,
  ): void {
    if (!this.isMobile() || !this.shareAccess.canAnalyze()) {
      return;
    }
    if (this.activeSheet() !== 'analyze') {
      this.analyzeFacade.connect();
      this.activeSheet.set('analyze');
    }
    this.step.set(step);
    this.subSheetPayload.set({
      type: 'analyze-activities',
      data,
    });
  }

  openAnalyzePlaces(data: PlacesDialogData): void {
    if (!this.isMobile() || !this.shareAccess.canAnalyze() || !this.shareAccess.canUsePlaces()) {
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
    type: 'analyze-activities' | 'analyze-places',
    data: AllCategoriesDialogData | PlacesDialogData,
  ): void {
    if (type === 'analyze-activities') {
      this.openAnalyzeDetail('activities', data as AllCategoriesDialogData);
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
