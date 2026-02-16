import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-rail',
  imports: [SharedModule],
  templateUrl: './rail.component.html',
  styleUrl: './rail.component.css',
})
export class RailComponent implements OnInit {
  private translate = inject(TranslateService);
  private router = inject(Router);
  private authService = inject(AuthService);

  currentLang = signal<string>('de');
  isLoggedIn = signal<boolean>(false);

  availableLangs = [
    { code: 'de', name: 'DE' },
    { code: 'en', name: 'EN' }
  ];

  constructor() {
    // Load saved language preference or default to German
    const savedLang = localStorage.getItem('language') || 'de';
    this.currentLang.set(savedLang);
    this.translate.use(savedLang);
    
    // Initialize authentication state
    this.isLoggedIn.set(this.authService.isLoggedIn());
  }

  ngOnInit(): void {
    // Subscribe to language changes to keep currentLang in sync
    this.translate.onLangChange.subscribe(event => {
      this.currentLang.set(event.lang);
    });

    // Subscribe to authentication state changes
    this.authService.currentUser$.subscribe(user => {
      this.isLoggedIn.set(!!user);
    });
  }

  switchLanguage(lang: string): void {
    this.currentLang.set(lang);
    this.translate.use(lang);
    localStorage.setItem('language', lang);
  }

  navigateToUsersArea(): void {
    this.router.navigate(['/users-area']);
  }
}
