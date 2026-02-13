import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-rail',
  imports: [SharedModule],
  templateUrl: './rail.component.html',
  styleUrl: './rail.component.css',
})
export class RailComponent implements OnInit {
  currentLang: string = 'de';
  availableLangs = [
    { code: 'de', name: 'DE' },
    { code: 'en', name: 'EN' }
  ];

  constructor(private translate: TranslateService) {
    // Load saved language preference or default to German
    const savedLang = localStorage.getItem('language') || 'de';
    this.currentLang = savedLang;
    this.translate.use(savedLang);
  }

  ngOnInit(): void {
    // Subscribe to language changes to keep currentLang in sync
    this.translate.onLangChange.subscribe(event => {
      this.currentLang = event.lang;
    });
  }

  switchLanguage(lang: string): void {
    this.currentLang = lang;
    this.translate.use(lang);
    localStorage.setItem('language', lang);
  }
}
