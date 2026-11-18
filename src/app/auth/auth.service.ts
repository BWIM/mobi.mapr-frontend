import { Injectable, NgZone, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, throwError, map } from 'rxjs';
import { tap, catchError, finalize, share } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ReturnUrlService } from './return-url.service';

interface User {
  username: string;
  token?: string;
}

interface AuthResponse {
  access: string;
  refresh: string;
}

/** Refresh the access token this long before it expires. */
export const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** Retry delay after a refresh failed for a transient reason (network, 5xx). */
export const ACCESS_TOKEN_RETRY_DELAY_MS = 60 * 1000;

/** Expiry (`exp`, epoch ms) of a JWT, or null if the token cannot be decoded. */
export function getJwtExpiry(token: string | null | undefined): number | null {
  const payload = token?.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const exp = JSON.parse(atob(padded))?.exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Milliseconds until the access token should be refreshed (0 = now), or null when the
 * token carries no readable expiry.
 */
export function getRefreshDelay(token: string | null | undefined, now: number = Date.now()): number | null {
  const expiresAt = getJwtExpiry(token);
  if (expiresAt === null) {
    return null;
  }
  return Math.max(0, expiresAt - ACCESS_TOKEN_REFRESH_MARGIN_MS - now);
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private http = inject(HttpClient);
  private zone = inject(NgZone);
  private router = inject(Router);
  private returnUrlService = inject(ReturnUrlService);
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight: Observable<AuthResponse> | null = null;

  constructor() {
    // Restore a stored session. An access token that expired meanwhile is refreshed right away.
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      this.currentUserSubject.next(user);
      this.scheduleRefresh();
    }

    // Timers in background tabs (or on a sleeping device) can fire late: catch up when shown.
    this.zone.runOutsideAngular(() => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.refreshIfDue();
        }
      });
    });
  }

  login(username: string, password: string): Observable<User> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/token/`, { username, password })
      .pipe(
        map(response => {
          const user: User = {
            username: username,
            token: response.access
          };
          localStorage.setItem('currentUser', JSON.stringify(user));
          localStorage.setItem('refreshToken', response.refresh);
          this.currentUserSubject.next(user);
          this.scheduleRefresh();
          return user;
        }),
        catchError(error => {
          console.error('Login error:', error);
          return throwError(() => new Error('Anmeldung fehlgeschlagen'));
        })
      );
  }

  logout(): void {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('refreshToken');
    this.currentUserSubject.next(null);
    this.clearRefreshTimer();
  }

  /** Gets a new access token; concurrent callers share one request. */
  refreshToken(): Observable<AuthResponse> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    const refreshToken = localStorage.getItem('refreshToken');
    this.refreshInFlight = this.http.post<AuthResponse>(`${this.apiUrl}/token/refresh/`, { refresh: refreshToken })
      .pipe(
        tap(response => {
          const user = this.currentUserSubject.value;
          if (user) {
            user.token = response.access;
            localStorage.setItem('currentUser', JSON.stringify(user));
            this.currentUserSubject.next(user);
          }
          this.scheduleRefresh();
        }),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        share()
      );
    return this.refreshInFlight;
  }

  /** Refreshes now if the access token expires within the margin (or already has). */
  refreshIfDue(now: number = Date.now()): void {
    if (!this.isLoggedIn()) {
      return;
    }
    const delay = getRefreshDelay(this.currentUserSubject.value?.token, now);
    if (delay === 0) {
      this.runRefresh();
    }
  }

  /**
   * Schedules a single refresh shortly before the access token expires (the backend issues
   * long-lived access tokens, so this fires rarely). Without a readable `exp` the token is
   * left alone; an expired token then surfaces as a 401 and logs the user out.
   */
  private scheduleRefresh(): void {
    this.clearRefreshTimer();
    const delay = getRefreshDelay(this.currentUserSubject.value?.token);
    if (delay === null) {
      return;
    }
    this.setRefreshTimer(delay);
  }

  private setRefreshTimer(delay: number): void {
    this.clearRefreshTimer();
    // Outside the zone: a pending hours-long timer would keep the app from becoming stable.
    this.zone.runOutsideAngular(() => {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.runRefresh();
      }, delay);
    });
  }

  private runRefresh(): void {
    this.refreshToken().subscribe({
      error: (error: unknown) => this.onRefreshFailed(error),
    });
  }

  /** A rejected refresh token ends the session; transient errors are retried. */
  private onRefreshFailed(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 400 || status === 401) {
      this.zone.run(() => {
        this.logout();
        const isPublicRoute = this.router.routerState.snapshot.root.firstChild?.data?.['public'] === true;
        if (!isPublicRoute) {
          void this.returnUrlService.redirectToLogin(this.router.url);
        }
      });
      return;
    }
    console.warn('Access token refresh failed, retrying shortly:', error);
    this.setRefreshTimer(ACCESS_TOKEN_RETRY_DELAY_MS);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getAuthorizationHeaders(): HttpHeaders {
    const currentUser = this.currentUserSubject.value;
    if (currentUser && currentUser.token) {
      return new HttpHeaders({
        'Authorization': `Bearer ${currentUser.token}`
      });
    }
    return new HttpHeaders();
  }

  isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }
}
