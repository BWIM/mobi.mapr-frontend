import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { provideRouter } from '@angular/router';
import Material from '@primeng/themes/material';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes),provideAnimationsAsync(),
    providePrimeNG({
        theme: {
            preset: Material,
            options: {
                prefix: 'p',
                darkModeSelector: '[data-theme="dark"]',
                cssLayer: false,
                ripple: true,
                inputStyle: 'filled',
                buttonScale: 1,
                roundness: 4
            }
        },
        ripple: true
    })]
};
