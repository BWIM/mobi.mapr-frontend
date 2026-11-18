import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';
import { SessionService } from '../services/session.service';
import { ReturnUrlService } from './return-url.service';
import { environment } from '../../environments/environment';

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

/**
 * Absolute URLs on another origin than our backend (e.g. the geocoder). They must not get
 * the access token or session parameters: that would leak the JWT to a third party and
 * force a CORS preflight the other server may reject.
 */
function isThirdPartyUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  return !url.startsWith(environment.apiUrl) && !url.startsWith(environment.baseUrl);
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

  if (isThirdPartyUrl(req.url)) {
    return next(req);
  }

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