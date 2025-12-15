import { Component, OnDestroy } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { TranslateService } from '@ngx-translate/core';
import { SharedModule } from './shared/shared.module';
import { ProjectWizardComponent } from './projects/project-wizard/project-wizard.component';
import { AnalyzeComponent } from './analyze/analyze.component';
import { CreditsComponent } from './credits/credits.component';
import { AuthService } from './auth/auth.service';
import { StatisticsComponent } from './statistics/statistics.component';
import { KeyboardShortcutsService, ShortcutAction } from './map-v2/keyboard-shortcuts.service';
import { Subscription } from 'rxjs';
import { HostListener } from '@angular/core';
import { ExportMapComponent } from './map-v2/export-map/export-map.component';
import { HealthService } from './services/health.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    MenubarModule,
    ButtonModule,
    SharedModule,
    ProjectWizardComponent,
    AnalyzeComponent,
    CreditsComponent,
    StatisticsComponent,
    ExportMapComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {
  title = 'mobi.mapr-frontend-2.0';
  isLoggedIn: boolean = false;
  private subscriptions: Subscription[] = [];

  constructor(
    private translate: TranslateService,
    private authService: AuthService,
    private keyboardShortcutsService: KeyboardShortcutsService,
    private healthService: HealthService,
    private router: Router
  ) {
    translate.setDefaultLang('de');
    translate.use('de');
    this.isLoggedIn = this.authService.isLoggedIn();

    // Ensure light theme is applied by default
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');

    // Subscribe to keyboard shortcuts
    this.subscriptions.push(
      this.keyboardShortcutsService.getShortcutStream().subscribe(action => {
        switch (action) {
          case ShortcutAction.SHOW_STATISTICS:
            // Statistics visibility is handled by the service
            break;
          case ShortcutAction.EXPORT_PDF_PORTRAIT:
          case ShortcutAction.EXPORT_PDF_LANDSCAPE:
            // These actions are now handled by the export map component
            break;
          case ShortcutAction.CREATE_SHARE:
            // These actions are handled by their respective services
            break;
        }
      }),
      this.healthService.checkHealth().subscribe(health => {
        if (health.status !== 'healthy') {
          console.warn('Health check failed, navigating to maintenance page');
          this.router.navigate(['/maintenance']);
        }
      })
    );
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    this.keyboardShortcutsService.handleKeyboardEvent(event);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}
