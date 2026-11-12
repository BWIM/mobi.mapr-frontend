import { Component, computed, inject, signal, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';
import { Clipboard } from '@angular/cdk/clipboard';
import { TranslateService } from '@ngx-translate/core';
import { SharedModule } from '../shared.module';
import { DashboardSessionService } from '../../services/dashboard-session.service';
import { ProjectsService } from '../../services/project.service';
import { URL_PARAM } from '../../url-state/url-params';

export type ShareMode = 'view' | 'project';

/** How long the "copied" confirmation stays visible. */
const COPIED_FEEDBACK_MS = 2000;

/**
 * Lets the user share either the exact current dashboard view (the full deeplink from the URL)
 * or just the project itself (only the project access params, so it opens with default settings).
 */
@Component({
  selector: 'app-share-dialog',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './share-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareDialogComponent {
  private dialogRef = inject(MatDialogRef<ShareDialogComponent>);
  private router = inject(Router);
  private clipboard = inject(Clipboard);
  private translate = inject(TranslateService);
  private session = inject(DashboardSessionService);
  private projectsService = inject(ProjectsService);
  private destroyRef = inject(DestroyRef);

  readonly mode = signal<ShareMode>('view');
  readonly copied = signal(false);
  readonly projectName = computed(() => this.projectsService.project()?.display_name ?? '');
  /** Project-id links only work for recipients who can log in and access the project. */
  readonly requiresLogin = computed(() => this.session.isAuthenticated() && !this.session.shareKey());
  readonly canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  /** Snapshot of the URL when the dialog opened; the view cannot change while the dialog is open. */
  private readonly viewUrl = this.buildViewUrl();
  private readonly projectUrl = this.buildProjectUrl();

  readonly link = computed(() => (this.mode() === 'view' ? this.viewUrl : this.projectUrl));

  private copiedTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearCopiedTimeout());
  }

  setMode(mode: ShareMode): void {
    this.mode.set(mode);
    this.copied.set(false);
  }

  copy(): void {
    if (!this.clipboard.copy(this.link())) {
      return;
    }
    this.copied.set(true);
    this.clearCopiedTimeout();
    this.copiedTimeout = setTimeout(() => this.copied.set(false), COPIED_FEEDBACK_MS);
  }

  async shareNative(): Promise<void> {
    const title = this.projectName() || 'mobi.mapr';
    try {
      await navigator.share({
        title,
        text: this.translate.instant(
          this.mode() === 'view' ? 'share.nativeTextView' : 'share.nativeTextProject',
          { project: title },
        ),
        url: this.link(),
      });
    } catch (error) {
      // AbortError means the user closed the share sheet; anything else falls back to copying.
      if ((error as DOMException)?.name !== 'AbortError') {
        this.copy();
      }
    }
  }

  selectInput(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

  close(): void {
    this.dialogRef.close();
  }

  private buildViewUrl(): string {
    return this.toAbsolute(this.router.url);
  }

  private buildProjectUrl(): string {
    const params = this.router.parseUrl(this.router.url).queryParams;
    const queryParams: Record<string, string> = {};
    for (const key of [URL_PARAM.projectId, URL_PARAM.shareKey]) {
      if (params[key]) {
        queryParams[key] = params[key];
      }
    }
    // Fall back to the session when the URL does not carry the access params (yet).
    if (!queryParams[URL_PARAM.projectId] && !queryParams[URL_PARAM.shareKey]) {
      // Share viewers keep their key next to the project they look at (maybe a sibling).
      const shareKey = this.session.shareKey();
      const projectId = this.session.projectId();
      if (shareKey) {
        queryParams[URL_PARAM.shareKey] = shareKey;
      }
      if (projectId) {
        queryParams[URL_PARAM.projectId] = projectId;
      }
    }
    return this.toAbsolute(this.router.serializeUrl(this.router.createUrlTree(['/dashboard'], { queryParams })));
  }

  private toAbsolute(path: string): string {
    // Respect <base href> so links work when the app is deployed under a sub path.
    const base = document.baseURI;
    return new URL(path.replace(/^\//, ''), base).toString();
  }

  private clearCopiedTimeout(): void {
    if (this.copiedTimeout !== null) {
      clearTimeout(this.copiedTimeout);
      this.copiedTimeout = null;
    }
  }
}
