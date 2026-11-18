import { Component, OnInit, inject, signal, ViewChild, TemplateRef, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import { LanguageService } from '../../services/language.service';
import { MatDialog } from '@angular/material/dialog';
import { openInfoDialog } from '../../shared/info-overlay/open-info-dialog';
import { openCreditsDialog } from './credits-dialog/open-credits-dialog';
import { ProjectNavigationService } from '../../services/project-navigation.service';
import { TutorialService } from '../../tutorial/tutorial.service';

@Component({
  selector: 'app-rail',
  imports: [SharedModule, TranslateModule],
  templateUrl: './rail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './rail.component.css',
})
export class RailComponent implements OnInit {
  @ViewChild('mailContentTemplate') mailContentTemplate!: TemplateRef<any>;
  @ViewChild('questionMarkContentTemplate') questionMarkContentTemplate!: TemplateRef<any>;

  private translate = inject(TranslateService);
  private router = inject(Router);
  private authService = inject(AuthService);
  private languageService = inject(LanguageService);
  private dialog = inject(MatDialog);
  private projectNavigation = inject(ProjectNavigationService);
  private tutorial = inject(TutorialService);

  currentLang = signal<string>('de');
  isLoggedIn = signal<boolean>(false);
  hasGroup = this.projectNavigation.hasGroup;

  availableLangs = this.languageService.availableLanguages.map(lang => ({
    code: lang.code,
    name: lang.code.toUpperCase()
  }));

  constructor() {
    // Initialize language from LanguageService
    this.currentLang.set(this.languageService.getCurrentLanguage());
    
    // Initialize authentication state
    this.isLoggedIn.set(this.authService.isLoggedIn());
  }

  ngOnInit(): void {
    // Subscribe to language changes to keep currentLang in sync
    this.languageService.onLanguageChange().subscribe(event => {
      this.currentLang.set(event.lang);
    });

    // Subscribe to authentication state changes
    this.authService.currentUser$.subscribe(user => {
      this.isLoggedIn.set(!!user);
    });
  }

  switchLanguage(lang: string): void {
    this.languageService.setLanguage(lang);
    this.currentLang.set(lang);
  }

  navigateToUsersArea(): void {
    this.router.navigate(['/users-area']);
  }

  openGroupOverview(): void {
    this.projectNavigation.openGroupOverview();
  }

  openMailDialog(): void {
    void openInfoDialog(this.dialog, this.mailContentTemplate);
  }

  openCredits() {
    void openCreditsDialog(this.dialog);
  }

  async openFeedbackDialog() {
    const { FeedbackDialogComponent } = await import('./feedback-dialog/feedback-dialog.component');
    this.dialog.open(FeedbackDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      maxHeight: '90vh'
    });
  }

  startTutorial(): void {
    this.tutorial.start();
  }
}
