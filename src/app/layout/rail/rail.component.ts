import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-rail',
  imports: [SharedModule, TranslateModule],
  templateUrl: './rail.component.html',
  styleUrl: './rail.component.css',
})
export class RailComponent implements OnInit {
  private translate = inject(TranslateService);
  private router = inject(Router);
  private authService = inject(AuthService);
  private languageService = inject(LanguageService);

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
}
