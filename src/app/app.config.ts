import { ApplicationConfig, provideAppInitializer, inject, provideZoneChangeDetection } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { RuntimeConfigService } from './services/runtime-config.service';
import { AuthInterceptor } from './auth/auth.interceptor';
import { shareFeatureInterceptor } from './services/share-feature.interceptor';
import { routes } from './app.routes';

// AoT requires an exported function for factories
export function HttpLoaderFactory(http: HttpClient) {
    return new TranslateHttpLoader(http, '/assets/i18n/', '.json');
}

export const appConfig: ApplicationConfig = {
    providers: [
        provideAppInitializer(() => {
            const config = inject(RuntimeConfigService);
            return firstValueFrom(config.load());
        }),
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideRouter(routes),
        provideAnimationsAsync(),
        provideHttpClient(withXhr(),
            withInterceptors([AuthInterceptor, shareFeatureInterceptor])
        ),
        // MatDialog is providedIn: 'root' and needs no module import.
        provideTranslateService({
            defaultLanguage: 'de',
            loader: {
                provide: TranslateLoader,
                useFactory: HttpLoaderFactory,
                deps: [HttpClient]
            }
        }),
    ]
};
