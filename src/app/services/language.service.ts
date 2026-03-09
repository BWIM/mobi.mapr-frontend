import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';

export interface Language {
  code: string;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private translate = inject(TranslateService);
  private readonly LANGUAGE_KEY = 'mobi.mapr.language';
  private readonly DEFAULT_LANGUAGE = 'de';

  readonly availableLanguages: Language[] = [
    { code: 'de', name: 'Deutsch' },
    { code: 'en', name: 'English' }
  ];

  constructor() {
    this.initializeLanguage();
  }

  /**
   * Initialize language from localStorage or use default
   */
  private initializeLanguage(): void {
    const savedLang = this.getSavedLanguage();
    const languageToUse = savedLang || this.DEFAULT_LANGUAGE;
    
    this.translate.setDefaultLang(this.DEFAULT_LANGUAGE);
    this.translate.use(languageToUse);
  }

  /**
   * Get the current language code
   */
  getCurrentLanguage(): string {
    return this.translate.currentLang || this.DEFAULT_LANGUAGE;
  }

  /**
   * Get saved language from localStorage
   */
  getSavedLanguage(): string | null {
    return localStorage.getItem(this.LANGUAGE_KEY);
  }

  /**
   * Set the language and persist to localStorage
   */
  setLanguage(langCode: string): void {
    if (this.isLanguageAvailable(langCode)) {
      this.translate.use(langCode);
      localStorage.setItem(this.LANGUAGE_KEY, langCode);
    } else {
      console.warn(`Language ${langCode} is not available. Using default language.`);
      this.translate.use(this.DEFAULT_LANGUAGE);
    }
  }

  /**
   * Check if a language code is available
   */
  isLanguageAvailable(langCode: string): boolean {
    return this.availableLanguages.some(lang => lang.code === langCode);
  }

  /**
   * Get language name by code
   */
  getLanguageName(langCode: string): string {
    const language = this.availableLanguages.find(lang => lang.code === langCode);
    return language?.name || langCode;
  }

  /**
   * Observable for language changes
   */
  onLanguageChange(): Observable<{ lang: string }> {
    return this.translate.onLangChange;
  }

  /**
   * Get translation for a key (synchronous)
   */
  instant(key: string | string[], interpolateParams?: Record<string, unknown>): string {
    return this.translate.instant(key, interpolateParams);
  }

  /**
   * Get translation for a key (asynchronous Observable)
   */
  get(key: string | string[], interpolateParams?: Record<string, unknown>): Observable<string> {
    return this.translate.get(key, interpolateParams);
  }
}
