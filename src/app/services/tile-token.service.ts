import { DestroyRef, Injectable, NgZone, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';

interface TileTokenResponse {
  tt: string;
  /** Lifetime in seconds (backend: 3600). */
  expires_in: number;
}

interface TileToken {
  projectId: number;
  value: string;
  /** Epoch ms after which the backend rejects the token. */
  expiresAt: number;
}

/** Renew this long before expiry so tiles requested meanwhile never carry a stale token. */
export const TILE_TOKEN_RENEW_MARGIN_MS = 5 * 60 * 1000;

/**
 * Short-lived tile tokens (`?tt=`) for logged-in users (backend B-16b).
 *
 * Tile URLs end up in proxy logs and Referer headers, so they carry a signed one-hour token
 * for one project instead of the access JWT. The token is fetched before a project's tiles
 * load, renewed shortly before it expires, and dropped on logout. Share viewers use their
 * share key instead and never need one.
 */
@Injectable({ providedIn: 'root' })
export class TileTokenService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private zone = inject(NgZone);

  private token: TileToken | null = null;
  private pending: { projectId: number; promise: Promise<string | null> } | null = null;
  private renewTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Emits after a token was obtained while the previous one had already expired
   * (e.g. a sleeping laptop or a failed renewal), so tiles that failed meanwhile can be reloaded.
   */
  readonly renewedAfterExpiry = new Subject<void>();

  constructor() {
    this.authService.currentUser$.subscribe((user) => {
      if (!user) {
        this.clear();
      }
    });

    // Background tabs may run the renew timer late; catch up when the tab is shown again.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.token && this.needsRenewal(this.token)) {
        void this.ensure(this.token.projectId);
      }
    };
    this.zone.runOutsideAngular(() => document.addEventListener('visibilitychange', onVisibilityChange));
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      this.clear();
    });
  }

  /** The current token for this project, or null (none yet, other project, or expired). */
  current(projectId: number): string | null {
    const token = this.token;
    if (!token || token.projectId !== projectId || Date.now() >= token.expiresAt) {
      return null;
    }
    return token.value;
  }

  /** Returns a token for the project, fetching or renewing it first when needed. */
  ensure(projectId: number): Promise<string | null> {
    if (this.token && this.token.projectId === projectId && !this.needsRenewal(this.token)) {
      return Promise.resolve(this.token.value);
    }
    if (this.pending?.projectId === projectId) {
      return this.pending.promise;
    }
    const promise = this.fetch(projectId).finally(() => {
      if (this.pending?.promise === promise) {
        this.pending = null;
      }
    });
    this.pending = { projectId, promise };
    return promise;
  }

  clear(): void {
    this.token = null;
    this.pending = null;
    this.clearRenewTimer();
  }

  private needsRenewal(token: TileToken): boolean {
    return Date.now() >= token.expiresAt - TILE_TOKEN_RENEW_MARGIN_MS;
  }

  private async fetch(projectId: number): Promise<string | null> {
    const previous = this.token;
    try {
      const response = await firstValueFrom(
        this.http.post<TileTokenResponse>(`${environment.apiUrl}/tiles/token/`, { project_id: projectId })
      );
      if (!this.authService.isLoggedIn()) {
        return null;
      }
      this.token = {
        projectId,
        value: response.tt,
        expiresAt: Date.now() + response.expires_in * 1000,
      };
      this.scheduleRenewal(this.token);
      if (previous && previous.projectId === projectId && Date.now() >= previous.expiresAt) {
        this.renewedAfterExpiry.next();
      }
      return response.tt;
    } catch (error) {
      console.warn('Could not get a tile token:', error);
      return null;
    }
  }

  private scheduleRenewal(token: TileToken): void {
    this.clearRenewTimer();
    const delay = Math.max(0, token.expiresAt - TILE_TOKEN_RENEW_MARGIN_MS - Date.now());
    // Outside the zone: an hour-long pending timer would otherwise keep the app "unstable".
    this.zone.runOutsideAngular(() => {
      this.renewTimer = setTimeout(() => {
        this.renewTimer = null;
        if (this.token === token) {
          void this.ensure(token.projectId);
        }
      }, delay);
    });
  }

  private clearRenewTimer(): void {
    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }
  }
}
