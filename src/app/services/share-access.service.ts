import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DashboardSessionService } from './dashboard-session.service';
import { ProjectsService } from './project.service';
import { SHARE_FEATURES, ShareFeature, ShareInfo } from '../interfaces/share';

/** Reads the backend's 403 `{error, feature}` body for a feature the share disables. */
export function shareForbiddenFeature(error: unknown): ShareFeature | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 403) {
    return null;
  }
  const feature = (error.error as { feature?: unknown } | null)?.feature;
  return typeof feature === 'string' && (SHARE_FEATURES as readonly string[]).includes(feature)
    ? (feature as ShareFeature)
    : null;
}

/**
 * What the current share key allows. Logged-in users (no share key) may use everything.
 *
 * The `share` block arrives with the project; it is kept while switching to a sibling project
 * (same key, same rights) so features do not flicker on in between.
 */
@Injectable({
  providedIn: 'root',
})
export class ShareAccessService {
  private session = inject(DashboardSessionService);
  private projectsService = inject(ProjectsService);

  readonly isShareViewer = computed(() => this.session.accessMethod() === 'share_key');

  private readonly shareState = linkedSignal<
    { key: string | null; share: ShareInfo | undefined },
    { key: string | null; share: ShareInfo | null }
  >({
    source: () => ({
      key: this.isShareViewer() ? this.session.shareKey() : null,
      share: this.projectsService.project()?.share,
    }),
    computation: (source, previous) => {
      if (!source.key) {
        return { key: null, share: null };
      }
      if (source.share) {
        return { key: source.key, share: source.share };
      }
      const kept = previous?.value.key === source.key ? previous.value.share : null;
      return { key: source.key, share: kept };
    },
  });

  /** Features the backend refused with a 403 although the share block allowed them. */
  private readonly denied = linkedSignal<string | null, ReadonlySet<ShareFeature>>({
    source: () => this.session.shareKey(),
    computation: () => new Set<ShareFeature>(),
  });

  /** Share settings of the current key; null for logged-in users. */
  readonly share = computed(() => this.shareState().share);

  readonly canCompare = computed(() => this.allows('compare'));
  readonly canUseDifference = computed(() => this.allows('compare') && this.allows('difference'));
  readonly canAnalyze = computed(() => this.allows('analyze'));
  readonly canUsePlaces = computed(() => this.allows('places'));
  readonly canUseStats = computed(() => this.allows('stats'));
  readonly canExport = computed(() => this.allows('export'));
  /** Share viewers may change state / RegioStar filters only when the share allows it. */
  readonly canEditAdvancedFilters = computed(() => !this.isShareViewer() || this.allows('filters'));

  /** True unless a share key disables the feature. Reactive when read inside a computed/effect. */
  allows(feature: ShareFeature): boolean {
    if (!this.isShareViewer()) {
      return true;
    }
    if (this.denied().has(feature)) {
      return false;
    }
    return this.share()?.features?.[feature] !== false;
  }

  /**
   * Handles a 403 for a feature the share disables: the feature is switched off in the UI.
   * Returns the feature, or null when the error is something else.
   */
  handleForbidden(error: unknown): ShareFeature | null {
    const feature = shareForbiddenFeature(error);
    if (feature && this.isShareViewer() && !this.denied().has(feature)) {
      this.denied.update((set) => new Set([...set, feature]));
    }
    return feature;
  }
}
