import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MobileUiService } from '../services/mobile-ui.service';
import { LanguageService } from '../services/language.service';
import { TutorialService } from './tutorial.service';

interface MeasureState {
  startedAt: number;
  /** Target was scrolled into view once for this step. */
  scrolled: boolean;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Space between highlighted element and highlight ring. */
const HOLE_PADDING = 6;
/** Distance between card and viewport edge / highlighted element. */
const MARGIN = 16;
/** How long to wait for a step's target to appear (panels animate, sheets open) before centering the card. */
const TARGET_WAIT_MS = 700;

@Component({
  selector: 'app-tutorial-overlay',
  imports: [TranslateModule, MatIconModule],
  templateUrl: './tutorial-overlay.component.html',
  styleUrl: './tutorial-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class TutorialOverlayComponent {
  readonly tutorial = inject(TutorialService);
  private mobileUi = inject(MobileUiService);
  private languageService = inject(LanguageService);
  private translate = inject(TranslateService);
  private zone = inject(NgZone);

  private dialog = inject(MatDialog);

  private root = viewChild<ElementRef<HTMLElement>>('root');
  private card = viewChild<ElementRef<HTMLElement>>('card');

  readonly step = this.tutorial.currentStep;
  readonly isMobile = this.mobileUi.isMobile;
  readonly availableLangs = this.languageService.availableLanguages;
  readonly currentLang = signal(this.languageService.getCurrentLanguage());

  /** Highlighted area in viewport coordinates (already padded), or null for a centered card. */
  readonly hole = signal<Box | null>(null);
  /** True while waiting for the step's target to show up. */
  readonly pending = signal(false);
  private readonly cardSize = signal({ width: 0, height: 0 });
  private readonly viewport = signal({ width: window.innerWidth, height: window.innerHeight });

  readonly titleKey = computed(() => `${this.tutorial.currentKey()}.title`);

  readonly textKey = computed(() => {
    const key = this.tutorial.currentKey();
    if (!key) {
      return '';
    }
    this.currentLang(); // re-evaluate after language switch
    const mobileKey = `${key}.textMobile`;
    if (this.isMobile() && this.translate.instant(mobileKey) !== mobileKey) {
      return mobileKey;
    }
    return `${key}.text`;
  });

  /** Dims everything except the hole; the hole stays clickable because clip-path also clips hit-testing. */
  readonly backdropClipPath = computed(() => {
    const hole = this.hole();
    if (!hole) {
      return 'none';
    }
    const x1 = hole.left;
    const y1 = hole.top;
    const x2 = hole.left + hole.width;
    const y2 = hole.top + hole.height;
    return (
      `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ` +
      `${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px)`
    );
  });

  readonly cardPosition = computed((): Partial<Record<'left' | 'right' | 'top' | 'bottom' | 'transform', string>> => {
    const hole = this.hole();
    const { width: vw, height: vh } = this.viewport();
    const { width: cw, height: ch } = this.cardSize();

    if (this.isMobile()) {
      const top = { left: '12px', right: '12px', top: 'calc(12px + env(safe-area-inset-top, 0px))' };
      const bottom = { left: '12px', right: '12px', bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' };
      const placement = this.step()?.mobilePlacement;
      if (placement) {
        return placement === 'top' ? top : bottom;
      }
      if (!hole) {
        return { left: '12px', right: '12px', top: '50%', transform: 'translateY(-50%)' };
      }
      // Card goes to the half of the screen the target is not in.
      const targetCenter = hole.top + hole.height / 2;
      return targetCenter > vh / 2 ? top : bottom;
    }

    if (!hole) {
      return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
    }

    const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - cw - MARGIN);
    const clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - ch - MARGIN);
    const right = hole.left + hole.width;
    const bottom = hole.top + hole.height;

    let left: number;
    let top: number;
    if (right + MARGIN + cw <= vw - MARGIN) {
      left = right + MARGIN;
      top = clampY(hole.top);
    } else if (hole.left - MARGIN - cw >= MARGIN) {
      left = hole.left - MARGIN - cw;
      top = clampY(hole.top);
    } else if (bottom + MARGIN + ch <= vh - MARGIN) {
      left = clampX(hole.left);
      top = bottom + MARGIN;
    } else if (hole.top - MARGIN - ch >= MARGIN) {
      left = clampX(hole.left);
      top = hole.top - MARGIN - ch;
    } else {
      // Target fills most of the screen (e.g. the map): place the card in its lower right corner.
      left = clampX(right - cw - MARGIN * 1.5);
      top = clampY(bottom - ch - MARGIN * 1.5);
    }
    return { left: `${left}px`, top: `${top}px` };
  });

  constructor() {
    this.languageService.onLanguageChange().subscribe((event) => this.currentLang.set(event.lang));

    // Put the tour into the top layer as soon as it is rendered.
    effect(() => {
      const root = this.root()?.nativeElement;
      if (root) {
        raiseToTop(root);
      }
    });

    // Dialogs opened later (e.g. "All activities", places) join the top layer above the tour,
    // so move the tour back on top of them.
    this.dialog.afterOpened.pipe(takeUntilDestroyed()).subscribe(() => {
      requestAnimationFrame(() => {
        const root = this.root()?.nativeElement;
        if (root) {
          raiseToTop(root);
        }
      });
    });

    // Follow the target every frame while the tour runs: panels and sheets animate,
    // the window resizes and the target may only appear after a user action.
    effect((onCleanup) => {
      if (!this.step()) {
        return;
      }
      const target = this.tutorial.currentTarget();
      const state: MeasureState = { startedAt: performance.now(), scrolled: false };
      let frame = 0;
      const tick = () => {
        this.measure(target, state);
        frame = requestAnimationFrame(tick);
      };
      this.zone.runOutsideAngular(() => (frame = requestAnimationFrame(tick)));
      onCleanup(() => cancelAnimationFrame(frame));
    });

    // Move focus into the card on every step so keyboard and screen reader users follow along.
    effect(() => {
      if (this.step() && !this.pending()) {
        // Wait for the card to be rendered / updated before focusing it.
        setTimeout(() => untracked(() => this.card())?.nativeElement.focus({ preventScroll: true }));
      }
    });
  }

  next(): void {
    this.tutorial.next();
  }

  back(): void {
    this.tutorial.back();
  }

  close(): void {
    this.tutorial.finish();
  }

  switchLanguage(code: string): void {
    this.languageService.setLanguage(code);
    this.currentLang.set(code);
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.tutorial.isActive()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.back();
    }
  }

  private measure(target: string | undefined, state: MeasureState): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const viewport = this.viewport();
    if (viewport.width !== vw || viewport.height !== vh) {
      this.viewport.set({ width: vw, height: vh });
    }

    const cardEl = this.card()?.nativeElement;
    if (cardEl) {
      const size = this.cardSize();
      if (size.width !== cardEl.offsetWidth || size.height !== cardEl.offsetHeight) {
        this.cardSize.set({ width: cardEl.offsetWidth, height: cardEl.offsetHeight });
      }
    }

    const element = target ? findVisibleTarget(target) : null;
    if (element && !state.scrolled) {
      // Targets inside scrollable panels/sheets (e.g. "All activities") may be out of view.
      state.scrolled = true;
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const box = element ? paddedBox(element.getBoundingClientRect(), vw, vh) : null;
    if (!sameBox(box, this.hole())) {
      this.hole.set(box);
    }

    const pending = !!target && !element && performance.now() - state.startedAt < TARGET_WAIT_MS;
    if (pending !== this.pending()) {
      this.pending.set(pending);
    }
  }
}

/**
 * (Re-)shows the popover so it becomes the topmost element of the top layer
 * (the most recently shown popover is on top).
 */
function raiseToTop(element: HTMLElement): void {
  if (typeof element.showPopover !== 'function') {
    return; // No popover support: z-index fallback.
  }
  try {
    if (element.matches(':popover-open')) {
      element.hidePopover();
    }
    element.showPopover();
  } catch {
    // Element not connected yet / popover state race – the next raise will fix it.
  }
}

/** First element with the given `data-tour` marker that is actually rendered (desktop and mobile layouts both exist in the DOM). */
function findVisibleTarget(name: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const candidate of Array.from(candidates)) {
    const rect = candidate.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return candidate;
    }
  }
  return null;
}

function paddedBox(rect: DOMRect, vw: number, vh: number): Box {
  const left = Math.max(rect.left - HOLE_PADDING, 0);
  const top = Math.max(rect.top - HOLE_PADDING, 0);
  const right = Math.min(rect.right + HOLE_PADDING, vw);
  const bottom = Math.min(rect.bottom + HOLE_PADDING, vh);
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) {
    return a === b;
  }
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
