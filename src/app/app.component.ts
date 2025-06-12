import { Component, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MenubarModule, ButtonModule, SharedModule, ProjectWizardComponent, AnalyzeComponent, CreditsComponent, StatisticsComponent],
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
    private keyboardShortcutsService: KeyboardShortcutsService
  ) {
    translate.setDefaultLang('de');
    translate.use('de');
    this.isLoggedIn = this.authService.isLoggedIn();
    
    // Subscribe to keyboard shortcuts
    this.subscriptions.push(
      this.keyboardShortcutsService.getShortcutStream().subscribe(action => {
        switch(action) {
          case ShortcutAction.SHOW_STATISTICS:
            // Statistics visibility is handled by the service
            break;
          case ShortcutAction.EXPORT_PDF_PORTRAIT:
          case ShortcutAction.EXPORT_PDF_LANDSCAPE:
          case ShortcutAction.CREATE_SHARE:
            // These actions are handled by their respective services
            break;
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
