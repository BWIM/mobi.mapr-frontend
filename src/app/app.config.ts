import { ApplicationConfig, importProvidersFrom, provideAppInitializer, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RuntimeConfigService } from './services/runtime-config.service';
import { provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AuthInterceptor } from './auth/auth.interceptor';
import { routes } from './app.routes';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { RouterModule } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';

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
        provideHttpClient(
            withInterceptors([AuthInterceptor])
        ),
        importProvidersFrom(
            HttpClientModule,
            RouterModule.forRoot(routes),
            TranslateModule.forRoot({
                defaultLanguage: 'de',
                loader: {
                    provide: TranslateLoader,
                    useFactory: HttpLoaderFactory,
                    deps: [HttpClient]
                }
            }),
            MatDialogModule
        )
    ]
};
