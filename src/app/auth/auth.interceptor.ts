import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, take, filter } from 'rxjs/operators';
import { throwError, Observable, BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';
import { SessionService } from '../services/session.service';

let isRefreshing = false;
let refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

function isPublicRoute(router: Router): boolean {
  return router.routerState.snapshot.root.firstChild?.data?.['public'] === true;
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

  if (req.url.includes('/token/') || isPublicRoute(router)) {
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
        if (!isRefreshing) {
          isRefreshing = true;
          refreshTokenSubject.next(null);

          return authService.refreshToken().pipe(
            switchMap((token) => {
              isRefreshing = false;
              refreshTokenSubject.next(token);
              const newHeaders = authService.getAuthorizationHeaders();
              return next(req.clone({ headers: newHeaders, url }));
            }),
            catchError((refreshError) => {
              isRefreshing = false;
              refreshTokenSubject.next(null);
              authService.logout();
              router.navigate(['/login']);
              return throwError(() => refreshError);
            })
          );
        } else {
          return refreshTokenSubject.pipe(
            filter(token => token !== null),
            take(1),
            switchMap(() => {
              const newHeaders = authService.getAuthorizationHeaders();
              return next(req.clone({ headers: newHeaders, url }));
            })
          );
        }
      }
      return throwError(() => error);
    })
  );
}; 