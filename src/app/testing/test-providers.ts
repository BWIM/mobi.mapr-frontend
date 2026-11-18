import { EnvironmentProviders, Provider } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

/**
 * App-wide providers for component specs, mirroring app.config.ts with test doubles:
 * translations without a loader (keys render as-is), an empty router, and HttpClient
 * backed by HttpTestingController so no spec talks to a real server.
 */
export function testProviders(): Array<Provider | EnvironmentProviders> {
  return [
    provideTranslateService(),
    provideRouter([]),
    provideHttpClient(),
    provideHttpClientTesting(),
  ];
}
