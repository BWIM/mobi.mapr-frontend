import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, take, filter, retry } from 'rxjs/operators';
import { throwError, Observable, BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';
import { SessionService } from '../services/session.service';

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

  // Check if it's a token request, public route, share route or explicitly allowed public asset
  if (req.url.includes('/token/') || isPublicRoute(router) || isShareRoute(router) || isPublicAsset(req.url)) {
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
        router.navigate(['/login']);
        return throwError(() => error);
      }
      if (error.status === 429) {
        authService.setRateLimitExceeded(true);
        router.navigate(['/rate-limit-exceeded']);
        return throwError(() => error);
      }
      return throwError(() => error);
    })
  );
}; 