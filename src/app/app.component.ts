import { Component, OnDestroy } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { HealthService } from './services/health.service';
// Archived components - to be migrated back
// import { ProjectWizardComponent } from './_archive/legacy/project-wizard/project-wizard.component';
// import { AnalyzeComponent } from './_archive/components/analyze/analyze.component';
// import { CreditsComponent } from './_archive/components/credits/credits.component';
// import { StatisticsComponent } from './_archive/components/statistics/statistics.component';
// import { ExportMapComponent } from './_archive/features/map-v2/export-map/export-map.component';
// import { KeyboardShortcutsService, ShortcutAction } from './_archive/features/map-v2/keyboard-shortcuts.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    // Archived components removed
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
    // private keyboardShortcutsService: KeyboardShortcutsService, // Archived
    private healthService: HealthService,
    private router: Router
  ) {
    translate.setDefaultLang('de');
    translate.use('de');
    this.isLoggedIn = this.authService.isLoggedIn();

    // Ensure light theme is applied by default
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');

    // Subscribe to health check
    this.subscriptions.push(
      this.healthService.checkHealth().subscribe(health => {
        if (health.status !== 'healthy') {
          console.warn('Health check failed, navigating to maintenance page');
          this.router.navigate(['/maintenance']);
        }
      })
    );

    // Keyboard shortcuts - to be re-enabled when map component is migrated
    // this.subscriptions.push(
    //   this.keyboardShortcutsService.getShortcutStream().subscribe(action => {
    //     // Handle shortcuts
    //   })
    // );
  }

  // @HostListener('window:keydown', ['$event'])
  // handleKeyboardEvent(event: KeyboardEvent) {
  //   this.keyboardShortcutsService.handleKeyboardEvent(event);
  // }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}
