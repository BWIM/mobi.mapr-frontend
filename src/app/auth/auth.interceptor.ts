import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';
import { SessionService } from '../services/session.service';

let isRefreshing = false;

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

  if (req.url.includes('/token/')) {
    return next(req);
  }

  const headers = authService.getAuthorizationHeaders();
  const url = addSessionParameters(req.url, sessionService);
  
  const authReq = req.clone({ 
    headers,
    url
  });

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isRefreshing) {
        isRefreshing = true;
        
        return authService.refreshToken().pipe(
          switchMap(() => {
            isRefreshing = false;
            const newHeaders = authService.getAuthorizationHeaders();
            const newAuthReq = req.clone({ 
              headers: newHeaders,
              url
            });
            return next(newAuthReq);
          }),
          catchError((refreshError) => {
            isRefreshing = false;
            authService.logout();
            router.navigate(['/login']);
            return throwError(() => refreshError);
          })
        );
      }
      return throwError(() => error);
    })
  );
}; 