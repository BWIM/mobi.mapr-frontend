import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, take, filter, retry } from 'rxjs/operators';
import { throwError, Observable, BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';
import { SessionService } from '../services/session.service';
import { ReturnUrlService } from './return-url.service';
import { environment } from '../../environments/environment';

let isRefreshing = false;
let refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

function isPublicRoute(router: Router): boolean {
  return router.routerState.snapshot.root.firstChild?.data?.['public'] === true;
}

function isShareRoute(router: Router): boolean {
  const url = router.routerState.snapshot.url;
  return url.startsWith('/share/');
}

function isPublicAsset(url: string): boolean {
  const publicAssetPatterns = [
    '/assets/i18n/',     // Allow language files
    '/assets/images/'    // Allow public images
  ];

  return publicAssetPatterns.some(pattern => url.includes(pattern));
}

/**
 * Login and token refresh must go out without the (possibly expired) access token.
 * Matched exactly: other endpoints ending in /token/ (e.g. tiles/token/) do need it.
 */
function isAuthTokenEndpoint(url: string): boolean {
  const path = url.split('?')[0];
  return path === `${environment.apiUrl}/token/` || path === `${environment.apiUrl}/token/refresh/`;
}

function addSessionParameters(url: string, sessionService: SessionService): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${sessionService.getRequestParameters()}`;
}

export const AuthInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const sessionService = inject(SessionService);
  const returnUrlService = inject(ReturnUrlService);

  // Check if it's a token request, feedback request, public route, share route or explicitly allowed public asset
  if (isAuthTokenEndpoint(req.url) || req.url.includes('/feedback') || isPublicRoute(router) || isShareRoute(router) || isPublicAsset(req.url)) {
    const url = addSessionParameters(req.url, sessionService);
    return next(req.clone({ url }));
  }

  const headers = authService.getAuthorizationHeaders();
  const url = addSessionParameters(req.url, sessionService);

  const authReq = req.clone({
    headers,
    url
  });

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        authService.logout();
        // Keep the current page so the user returns to the same view after logging in again.
        void returnUrlService.redirectToLogin(router.url);
        return throwError(() => error);
      }
      if (error.status === 503) {
        router.navigate(['/maintenance']);
        return throwError(() => error);
      }
      return throwError(() => error);
    })
  );
};