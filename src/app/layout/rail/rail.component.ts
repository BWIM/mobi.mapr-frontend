import { Component, OnInit, inject, signal, ViewChild, TemplateRef } from '@angular/core';
import { Router } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import { LanguageService } from '../../services/language.service';
import { MatDialog } from '@angular/material/dialog';
import { InfoDialogComponent } from '../../shared/info-overlay/info-dialog.component';
import { CreditsDialogComponent } from './credits-dialog/credits-dialog.component';
import { FeedbackDialogComponent } from './feedback-dialog/feedback-dialog.component';

@Component({
  selector: 'app-rail',
  imports: [SharedModule, TranslateModule],
  templateUrl: './rail.component.html',
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

  currentLang = signal<string>('de');
  isLoggedIn = signal<boolean>(false);

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

  openMailDialog(): void {
    this.dialog.open(InfoDialogComponent, {
      width: '80vw',
      height: '80vh',
      maxWidth: '80vw',
      maxHeight: '80vh',
      panelClass: 'info-dialog-panel',
      data: { content: this.mailContentTemplate }
    });
  }

  openCredits() {
    this.dialog.open(CreditsDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh'
    });
  }

  openFeedbackDialog() {
    this.dialog.open(FeedbackDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      maxHeight: '90vh'
    });
  }
}
