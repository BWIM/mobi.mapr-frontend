import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterRenderEffect,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import type { ActiveElement, Chart, ChartType, Plugin } from 'chart.js';

/** Chart.js (with all controllers registered) is loaded on first use, outside the initial bundle. */
let chartModule: Promise<typeof import('chart.js/auto').default> | null = null;
function loadChart(): Promise<typeof import('chart.js/auto').default> {
  chartModule ??= import('chart.js/auto').then(m => m.default);
  return chartModule;
}

export interface ChartDataSelectEvent {
  originalEvent: MouseEvent;
  element: ActiveElement;
  dataset: ActiveElement[];
}

/**
 * Thin Angular wrapper around Chart.js (replacement for PrimeNG's p-chart).
 * The chart is recreated whenever type, data, options or plugins change.
 */
@Component({
  selector: 'app-chart',
  standalone: true,
  template: `
    <div style="position: relative" [style.width]="width()" [style.height]="height()">
      <canvas #canvas role="img" (click)="onCanvasClick($event)"></canvas>
    </div>
  `,
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartComponent implements OnDestroy {
  readonly type = input.required<ChartType>();
  readonly data = input<any>();
  readonly options = input<any>();
  readonly plugins = input<Plugin[]>([]);
  readonly width = input<string>();
  readonly height = input<string>();
  /**
   * Select the whole row/column under the pointer instead of requiring a hit on the bar itself.
   * Useful for bar charts with short bars and labels drawn next to them (e.g. on touch devices).
   */
  readonly selectByRow = input(false);

  readonly dataSelect = output<ChartDataSelectEvent>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  chart?: Chart;
  /** Bumped on every (re)init and on destroy so a stale async init does not create a chart. */
  private initToken = 0;

  constructor() {
    afterRenderEffect(() => {
      this.type();
      this.data();
      this.options();
      this.plugins();
      untracked(() => this.reinit());
    });
  }

  /** Re-renders the existing chart, e.g. after its data/options objects were mutated in place. */
  refresh(): void {
    this.chart?.update();
  }

  /** Destroys and recreates the chart, e.g. after its container was resized. */
  reinit(): void {
    const token = ++this.initToken;
    void loadChart().then(ChartCtor => {
      if (token !== this.initToken) {
        return;
      }
      this.createChart(ChartCtor);
    });
  }

  private createChart(ChartCtor: typeof import('chart.js/auto').default): void {
    this.chart?.destroy();

    const options = { ...(this.options() ?? {}), responsive: true };
    if (this.width() || this.height()) {
      options.maintainAspectRatio = false;
    }

    this.chart = new ChartCtor(this.canvas().nativeElement, {
      type: this.type(),
      data: this.data() ?? { datasets: [] },
      options,
      plugins: this.plugins(),
    });
  }

  onCanvasClick(event: MouseEvent): void {
    if (!this.chart) return;
    const elements = this.selectByRow()
      ? this.chart.getElementsAtEventForMode(
          event,
          'index',
          { intersect: false, axis: this.chart.options.indexAxis === 'y' ? 'y' : 'x' },
          false,
        )
      : this.chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      this.dataSelect.emit({ originalEvent: event, element: elements[0], dataset: elements });
    }
  }

  ngOnDestroy(): void {
    this.initToken++;
    this.chart?.destroy();
    this.chart = undefined;
  }
}
