import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { SessionService } from './services/session.service';
import { LanguageService } from './services/language.service';
import { RuntimeConfigService } from './services/runtime-config.service';
import { VisualViewportService } from './services/visual-viewport.service';
import { environment } from '../environments/environment';
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
export class AppComponent {
  title = 'mobi.mapr-frontend-2.0';
  isLoggedIn: boolean = false;
  buildDate: string;

  constructor(
    private languageService: LanguageService,
    private authService: AuthService,
    private runtimeConfig: RuntimeConfigService,
    private router: Router,
    private sessionService: SessionService, // Initialize SessionService early to ensure session_id is generated
    visualViewportService: VisualViewportService,
  ) {
    visualViewportService.init();
    // Format build date for display
    const buildDateObj = new Date(environment.buildDate);
    this.buildDate = buildDateObj.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    
    // LanguageService initializes language on construction
    this.isLoggedIn = this.authService.isLoggedIn();

    // Ensure light theme is applied by default
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');

    if (this.runtimeConfig.maintenanceMode && !this.router.url.startsWith('/maintenance')) {
      this.router.navigate(['/maintenance']);
    }
  }
}
