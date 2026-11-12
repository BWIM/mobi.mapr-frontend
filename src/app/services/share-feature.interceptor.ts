import { HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ShareAccessService, shareForbiddenFeature } from './share-access.service';

/**
 * The backend answers 403 `{error, feature}` when a share key disables a feature (export,
 * analyze, places, stats). Switch that feature off in the UI, then pass the error on so the
 * caller can stop its loading state.
 */
export const shareFeatureInterceptor: HttpInterceptorFn = (req, next) => {
  // Resolved lazily: the service is only needed for the rare 403 and depends on HttpClient users.
  const injector = inject(Injector);
  return next(req).pipe(
    catchError((error) => {
      if (shareForbiddenFeature(error)) {
        injector.get(ShareAccessService).handleForbidden(error);
      }
      return throwError(() => error);
    })
  );
};
