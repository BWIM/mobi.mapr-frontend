import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '../shared.module';
import {
  CompositionNode,
  CompositionWeightedChild,
  sortCompositionChildren,
  sortWeightedChildren,
  weightedChildrenTotal,
} from '../../interfaces/composition';

export interface CompositionActivityMeta {
  color?: string;
  weight?: number;
  relevance?: number;
  enabled?: boolean;
  /** Display name used to toggle map layers */
  name?: string;
  score?: number;
  index?: number;
  /** Preformatted metric, e.g. "4.2 min" or "B-" */
  metricLabel?: string;
  metricColor?: string;
  role_hint?: 'primary' | 'substitute';
}

export interface CompositionFormattedMetric {
  label: string;
  color: string;
}

@Component({
  selector: 'app-category-composition-panel',
  standalone: true,
  imports: [CommonModule, TranslateModule, SharedModule, CategoryCompositionPanelComponent],
  templateUrl: './category-composition-panel.component.html',
  styleUrl: './category-composition-panel.component.css',
})
export class CategoryCompositionPanelComponent {
  @Input() node: CompositionNode | null = null;
  @Input() showHeader = true;
  @Input() collapsible = false;
  @Input() expanded = true;
  @Input() activityMeta: Record<number, CompositionActivityMeta> = {};
  @Input() depth = 0;
  /** When true, atom rows toggle map layers. */
  @Input() interactive = false;
  /** Overall category result (e.g. combined SUBST score). */
  @Input() overallMetricLabel: string | null = null;
  @Input() overallMetricColor: string | null = null;
  /** Optional share % shown in brackets after the atom / group name. */
  @Input() shareLabel: number | null = null;
  /** Activity display name currently highlighted (from map or panel hover). */
  @Input() highlightedActivityName: string | null = null;
  /** Formats backend-provided score/index for AND / OR / SUBST headers. */
  @Input() formatMetric:
    | ((score: number, index: number) => CompositionFormattedMetric)
    | null = null;

  @Output() toggleActivity = new EventEmitter<string>();
  /** Emits activity display name on hover, or null on leave. */
  @Output() hoverActivity = new EventEmitter<string | null>();

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  sharePercent(weight: number, children: CompositionWeightedChild[]): number {
    const total = weightedChildrenTotal(children);
    return total > 0 ? (weight / total) * 100 : 0;
  }

  /** AND children / SUBST substitutes: weight desc, then A–Z. */
  sortedWeightedChildren(children: CompositionWeightedChild[]): CompositionWeightedChild[] {
    return sortWeightedChildren(children);
  }

  /** OR children: A–Z (no per-child weights). */
  sortedOrChildren(children: CompositionNode[]): CompositionNode[] {
    return sortCompositionChildren(children);
  }

  metaFor(activityId: number): CompositionActivityMeta | undefined {
    return this.activityMeta[activityId];
  }

  isHighlighted(activityId: number): boolean {
    if (!this.highlightedActivityName) {
      return false;
    }
    return this.metaFor(activityId)?.name === this.highlightedActivityName;
  }

  /** Backend-annotated metric for the current AND / OR / SUBST node header. */
  groupMetric(): CompositionFormattedMetric | null {
    if (!this.node || this.node.op === 'atom' || !this.formatMetric) {
      return null;
    }
    const metrics = this.node.activityScore;
    if (!metrics) {
      return null;
    }
    return this.formatMetric(Number(metrics.score ?? 0), Number(metrics.index ?? 0));
  }

  onAtomClick(activityId: number, event: Event): void {
    if (!this.interactive) {
      return;
    }
    event.stopPropagation();
    const meta = this.metaFor(activityId);
    const name = meta?.name;
    if (name) {
      this.toggleActivity.emit(name);
    }
  }

  onAtomHover(activityId: number, hovering: boolean): void {
    if (!this.interactive) {
      return;
    }
    if (!hovering) {
      this.hoverActivity.emit(null);
      return;
    }
    const name = this.metaFor(activityId)?.name ?? null;
    this.hoverActivity.emit(name);
  }

  /** Forward nested toggles to the root listener. */
  onChildToggle(name: string): void {
    this.toggleActivity.emit(name);
  }

  onChildHover(name: string | null): void {
    this.hoverActivity.emit(name);
  }
}
