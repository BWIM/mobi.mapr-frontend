import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { filter } from 'rxjs/operators';
import { SettingsService } from '../services/settings.service';
import { MobileUiService } from '../services/mobile-ui.service';
import {
  FeatureSelectionService,
  MapLibreFeatureData,
} from '../shared/services/feature-selection.service';
import { featureRefFromFeature } from '../url-state/url-params';
import { AllCategoriesDialogComponent } from '../layout/right/analyze/overlay/all-categories-dialog.component';
import { PlacesDialogComponent } from '../layout/right/analyze/places/places-dialog.component';

/**
 * Bump to show the tour again to everyone who has already seen it
 * (e.g. after a redesign that moves the highlighted elements).
 */
export const TUTORIAL_VERSION = 1;

/** User actions a step can wait for. */
export type TutorialAction = 'pick-place' | 'open-activities' | 'open-places';

/** Panels/sheets/dialogs a step needs. Applied by DashboardComponent when the step is shown. */
export interface TutorialLayout {
  /** Desktop: expand the left (filter) panel. */
  leftPanel?: boolean;
  /** Desktop: expand the right (stats/analyze) panel. */
  rightPanel?: boolean;
  /** Close open Material dialogs (desktop activity / places overlays). */
  closeDialogs?: boolean;
  /** Mobile: expand (true) or collapse (false) the bottom filter panel. */
  mobileFilter?: boolean;
  /** Mobile: close any open bottom sheet. */
  closeMobileSheet?: boolean;
  /** Mobile: inside the analyze sheet, go back from activities/places to the main view. */
  mobileAnalyzeMain?: boolean;
}

export interface TutorialStep {
  id: string;
  /** Translation key prefix; uses `<key>.title` and `<key>.text` (and `<key>.textMobile` if present). */
  key: string;
  /**
   * Value of the `data-tour` attribute to highlight. The first *visible* match wins, so the same
   * marker can be put on both the desktop and the mobile variant of an element.
   * Missing target → centered card without highlight.
   */
  target?: string;
  layout?: TutorialLayout;
  /** The user may interact with the highlighted element (clicks pass through the highlight). */
  interactive?: boolean;
  /** The step waits for this user action; "Next" is offered as "Skip step" until then. */
  awaitsAction?: TutorialAction;
  /**
   * Shown in place of key/target once the awaited action happened, instead of advancing.
   * Without it the tour moves on to the next step by itself.
   */
  result?: { key: string; target?: string };
  /** Step is skipped when this returns false. */
  showIf?: () => boolean;
  /**
   * Mobile only: where the card goes. Default is the half of the screen the target is not in.
   * 'bottom' with `compact` keeps the top of the map (zoom buttons, level switcher) usable.
   */
  mobilePlacement?: 'top' | 'bottom';
  /** Mobile only: smaller card, for steps where the user needs as much of the screen as possible. */
  compactOnMobile?: boolean;
  /** "Back" jumps to this step id (when the previous steps depend on dialogs that were closed meanwhile). */
  backTo?: string;
}

/** Feature levels that have activity / places details (municipalities and hexagons). */
const DETAIL_FEATURE_TYPES = new Set(['m', 'h']);

@Injectable({ providedIn: 'root' })
export class TutorialService {
  private settings = inject(SettingsService);
  private featureSelection = inject(FeatureSelectionService);
  private mobileUi = inject(MobileUiService);
  private dialog = inject(MatDialog);

  readonly steps: readonly TutorialStep[] = [
    { id: 'welcome', key: 'tutorial.steps.welcome' },
    {
      id: 'map',
      key: 'tutorial.steps.map',
      target: 'legend',
      layout: { mobileFilter: false, closeMobileSheet: true, closeDialogs: true },
    },
    {
      id: 'modes',
      key: 'tutorial.steps.modes',
      target: 'transport-modes',
      interactive: true,
      layout: { leftPanel: true, mobileFilter: true },
    },
    {
      id: 'analyze',
      key: 'tutorial.steps.analyze',
      target: 'map',
      interactive: true,
      awaitsAction: 'pick-place',
      mobilePlacement: 'bottom',
      compactOnMobile: true,
      layout: { rightPanel: true, mobileFilter: false, closeMobileSheet: true, closeDialogs: true },
    },
    {
      id: 'analyze-result',
      key: 'tutorial.steps.analyzeResult',
      target: 'analyze',
      mobilePlacement: 'bottom',
      compactOnMobile: true,
      layout: { rightPanel: true, mobileFilter: false, closeDialogs: true, mobileAnalyzeMain: true },
      showIf: () => this.featureSelection.getCurrentMapLibreFeature() !== null,
    },
    {
      id: 'all-activities',
      key: 'tutorial.steps.allActivities',
      target: 'all-activities',
      interactive: true,
      awaitsAction: 'open-activities',
      compactOnMobile: true,
      layout: { rightPanel: true, mobileFilter: false, closeDialogs: true, mobileAnalyzeMain: true },
      showIf: () => this.hasDetailFeature(),
    },
    {
      id: 'activity',
      key: 'tutorial.steps.activity',
      target: 'activity-list',
      interactive: true,
      awaitsAction: 'open-places',
      mobilePlacement: 'bottom',
      compactOnMobile: true,
      result: { key: 'tutorial.steps.places', target: 'places-map' },
      showIf: () => this.hasDetailFeature(),
    },
    {
      id: 'stats',
      key: 'tutorial.steps.stats',
      target: 'stats',
      layout: { rightPanel: true, mobileFilter: false, closeMobileSheet: true, closeDialogs: true },
      backTo: 'all-activities',
    },
    {
      id: 'done',
      key: 'tutorial.steps.done',
      target: 'tutorial-replay',
      layout: { mobileFilter: false, closeMobileSheet: true, closeDialogs: true },
    },
  ];

  private readonly _index = signal<number | null>(null);
  /** The current step's awaited action has happened (and the step shows its `result`). */
  private readonly _actionDone = signal(false);
  /** Extra hint for the current step, e.g. "zoom in further". */
  private readonly _hintKey = signal<string | null>(null);

  readonly isActive = computed(() => this._index() !== null);
  readonly currentStep = computed(() => {
    const index = this._index();
    return index === null ? null : this.steps[index];
  });
  readonly hintKey = this._hintKey.asReadonly();

  /** True while the step still waits for the user to do something. */
  readonly isAwaitingAction = computed(() => !!this.currentStep()?.awaitsAction && !this._actionDone());

  /** Translation key prefix and highlight target, taking a completed action's `result` into account. */
  readonly currentKey = computed(() => {
    const step = this.currentStep();
    if (!step) {
      return null;
    }
    return step.result && this._actionDone() ? step.result.key : step.key;
  });
  readonly currentTarget = computed(() => {
    const step = this.currentStep();
    if (!step) {
      return undefined;
    }
    return step.result && this._actionDone() ? step.result.target : step.target;
  });

  /**
   * "3 / 9". Counts all steps (not only the currently visible ones), so the total stays stable
   * when conditional steps become available during the tour.
   */
  readonly progress = computed(() => {
    const index = this._index();
    return index === null ? null : { current: index + 1, total: this.steps.length };
  });

  readonly isFirst = computed(() => this._index() === 0);
  readonly isLast = computed(() => {
    const index = this._index();
    return index !== null && this.findVisible(index + 1, 1) === null;
  });

  constructor() {
    this.featureSelection.selectedMapLibreFeature$
      .pipe(filter((feature) => feature !== null))
      .subscribe((feature) => this.onPlacePicked(feature));

    // Desktop: activities and places open as dialogs.
    this.dialog.afterOpened.subscribe((ref) => {
      if (ref.componentInstance instanceof AllCategoriesDialogComponent) {
        this.notifyAction('open-activities');
      } else if (ref.componentInstance instanceof PlacesDialogComponent) {
        this.notifyAction('open-places');
      }
    });

    // Mobile: activities and places are sub-views of the analyze sheet.
    effect(() => {
      if (!this.mobileUi.isAnalyzeOpen()) {
        return;
      }
      const view = this.mobileUi.analyzeStep();
      untracked(() => {
        if (view === 'activities') {
          this.notifyAction('open-activities');
        } else if (view === 'places') {
          this.notifyAction('open-places');
        }
      });
    });
  }

  /** True if the tour (in its current version) was never finished or skipped on this device. */
  shouldAutoStart(): boolean {
    const seen = this.settings.loadSettings()?.tutorialVersionSeen ?? 0;
    return seen < TUTORIAL_VERSION;
  }

  start(): void {
    this.goTo(0);
  }

  next(): void {
    const index = this._index();
    if (index === null) {
      return;
    }
    const nextIndex = this.findVisible(index + 1, 1);
    if (nextIndex === null) {
      this.finish();
    } else {
      this.goTo(nextIndex);
    }
  }

  back(): void {
    const step = this.currentStep();
    const index = this._index();
    if (!step || index === null) {
      return;
    }
    if (step.backTo) {
      const backIndex = this.steps.findIndex((s) => s.id === step.backTo);
      if (backIndex >= 0 && this.isVisible(this.steps[backIndex])) {
        this.goTo(backIndex);
        return;
      }
    }
    const prevIndex = this.findVisible(index - 1, -1);
    if (prevIndex !== null) {
      this.goTo(prevIndex);
    }
  }

  /** Ends the tour (finished or skipped) and remembers that it was seen. */
  finish(): void {
    this.goTo(null);
    this.settings.saveSettings({ tutorialVersionSeen: TUTORIAL_VERSION });
  }

  private goTo(index: number | null): void {
    this._actionDone.set(false);
    this._hintKey.set(null);
    this._index.set(index);
  }

  private onPlacePicked(feature: MapLibreFeatureData): void {
    if (this.currentStep()?.awaitsAction !== 'pick-place') {
      return;
    }
    // Activities and places are only available for municipalities and hexagons.
    if (!isDetailFeature(feature)) {
      this._hintKey.set('tutorial.steps.analyze.zoomHint');
      // Mobile opens the analyze sheet on every pick (after this handler); close it again
      // so the map stays free for zooming.
      setTimeout(() => {
        if (this.currentStep()?.awaitsAction === 'pick-place' && this.mobileUi.isSheetOpen()) {
          this.mobileUi.closeSheet();
        }
      });
      return;
    }
    this.notifyAction('pick-place');
  }

  private notifyAction(action: TutorialAction): void {
    const step = this.currentStep();
    if (!step || step.awaitsAction !== action || this._actionDone()) {
      return;
    }
    if (step.result) {
      this._hintKey.set(null);
      this._actionDone.set(true);
    } else {
      this.next();
    }
  }

  private hasDetailFeature(): boolean {
    const feature = this.featureSelection.getCurrentMapLibreFeature();
    return feature !== null && isDetailFeature(feature);
  }

  private isVisible(step: TutorialStep): boolean {
    return step.showIf ? step.showIf() : true;
  }

  private findVisible(from: number, direction: 1 | -1): number | null {
    for (let i = from; i >= 0 && i < this.steps.length; i += direction) {
      if (this.isVisible(this.steps[i])) {
        return i;
      }
    }
    return null;
  }
}

function isDetailFeature(feature: MapLibreFeatureData): boolean {
  const type = featureRefFromFeature(feature)?.type;
  // Unknown type: don't block the tour.
  return type === undefined || DETAIL_FEATURE_TYPES.has(type);
}
