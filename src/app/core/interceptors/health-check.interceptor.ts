import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap } from 'rxjs/operators';
import { throwError, of } from 'rxjs';
import { Router } from '@angular/router';
import { HealthCheckService } from '../../services/health-check.service';

export const HealthCheckInterceptor: HttpInterceptorFn = (
    req: HttpRequest<unknown>,
    next: HttpHandlerFn
) => {
    const router = inject(Router);
    const healthCheckService = inject(HealthCheckService);

    // Skip health check for the health endpoint itself to avoid infinite loops
    if (req.url.includes('/health')) {
        return next(req);
    }

    // Skip health check for public routes, share routes, and assets
    const isPublicRoute = router.routerState.snapshot.root.firstChild?.data?.['public'] === true;
    const isShareRoute = router.routerState.snapshot.url.includes('/share/');
    const isPublicAsset = req.url.includes('/assets/') || req.url.includes('/favicon.ico');

    if (isPublicRoute || isShareRoute || isPublicAsset) {
        return next(req);
    }

    // Check health before making the request
    return healthCheckService.isHealthy().pipe(
        switchMap(isHealthy => {
            if (!isHealthy) {
                // Health check failed, redirect to rate limit page
                // Only navigate if not already on a public/rate-limit route
                const currentUrl = router.url;
                if (!currentUrl.includes('/rate-limit-exceeded') && !currentUrl.includes('/share/')) {
                    router.navigate(['/rate-limit-exceeded']);
                }
                return throwError(() => new Error('Health check failed'));
            }
            // Health check passed, proceed with the original request
            return next(req);
        }),
        catchError((error: HttpErrorResponse) => {
            // If health check itself fails, redirect to rate limit page
            console.error('Health check failed:', error);
            const currentUrl = router.url;
            if (!currentUrl.includes('/rate-limit-exceeded') && !currentUrl.includes('/share/')) {
                router.navigate(['/rate-limit-exceeded']);
            }
            return throwError(() => error);
        })
    );
};
