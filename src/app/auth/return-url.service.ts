import { Injectable, inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';

export const RETURN_URL_PARAM = 'returnUrl';
const STORAGE_KEY = 'mapr.returnUrl';
const EXCLUDED_PREFIXES = ['/login', '/landing', '/maintenance', '/invalid-share-key'];

/**
 * Accepts only in-app paths (no scheme, no protocol-relative or backslash tricks), so a crafted
 * link cannot redirect to another site after login.
 */
export function sanitizeReturnUrl(url: unknown): string | null {
  if (typeof url !== 'string') {
    return null;
  }
  const trimmed = url.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return null;
  }
  if (/[\u0000-\u001f]/.test(trimmed)) {
    return null;
  }
  const path = trimmed.split(/[?#]/)[0];
  if (path === '/' || EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return null;
  }
  return trimmed;
}

/**
 * Remembers where a user wanted to go before being sent to the login page, and brings them
 * back afterwards. The URL travels as `?returnUrl=` and is also kept in sessionStorage
 * (so it survives a reload of the login page).
 */
@Injectable({
  providedIn: 'root',
})
export class ReturnUrlService {
  private router = inject(Router);

  /** Login page URL that brings the user back to `returnUrl` afterwards. */
  loginUrlTree(returnUrl: string = this.router.url): UrlTree {
    const safe = sanitizeReturnUrl(returnUrl);
    this.remember(safe);
    return this.router.createUrlTree(['/login'], safe ? { queryParams: { [RETURN_URL_PARAM]: safe } } : {});
  }

  /** Navigates to the login page, remembering `returnUrl`. */
  redirectToLogin(returnUrl: string = this.router.url): Promise<boolean> {
    return this.router.navigateByUrl(this.loginUrlTree(returnUrl));
  }

  /** Returns the remembered URL (query param wins over storage) and forgets it. */
  consume(fromQueryParam?: string | null): string | null {
    const stored = this.read();
    this.remember(null);
    return sanitizeReturnUrl(fromQueryParam) ?? sanitizeReturnUrl(stored);
  }

  private remember(url: string | null): void {
    try {
      if (url) {
        sessionStorage.setItem(STORAGE_KEY, url);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage unavailable (private mode etc.) — the query param still carries the URL.
    }
  }

  private read(): string | null {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
