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
import Chart from 'chart.js/auto';
import type { ActiveElement, ChartType, Plugin } from 'chart.js';

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

  readonly dataSelect = output<ChartDataSelectEvent>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  chart?: Chart;

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
    this.chart?.destroy();

    const options = { ...(this.options() ?? {}), responsive: true };
    if (this.width() || this.height()) {
      options.maintainAspectRatio = false;
    }

    this.chart = new Chart(this.canvas().nativeElement, {
      type: this.type(),
      data: this.data() ?? { datasets: [] },
      options,
      plugins: this.plugins(),
    });
  }

  onCanvasClick(event: MouseEvent): void {
    if (!this.chart) return;
    const elements = this.chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      this.dataSelect.emit({ originalEvent: event, element: elements[0], dataset: elements });
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = undefined;
  }
}
