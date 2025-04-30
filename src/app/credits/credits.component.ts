import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { MenuItem } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';
import { SpeedDialModule } from 'primeng/speeddial';
import { TranslateService } from '@ngx-translate/core';

interface InfoComponent {
  name: string;
  icon: string;
  url?: string;
}

interface Shortcut {
  key: string;
  description: string;
}

@Component({
  selector: 'app-credits',
  standalone: true,
  imports: [
    SharedModule,
    DialogModule,
    CardModule,
    ButtonModule,
    AccordionModule,
    SpeedDialModule
  ],
  templateUrl: './credits.component.html',
  styleUrl: './credits.component.css'
})
export class CreditsComponent implements OnInit {
  showCreditsDialog = false;
  showHelpDialog = false;
  showLanguageDialog = false;
  isDarkMode = false;
  currentLang = 'de';

  private readonly LANGUAGE_KEY = 'mobi.mapr.language';

  languages = [
    { code: 'de', name: 'Deutsch', icon: 'pi pi-check' },
    { code: 'de-bw', name: 'Badisch', icon: 'pi pi-check' },
    { code: 'de-sw', name: 'Schwäbisch', icon: 'pi pi-check' },
    { code: 'en', name: 'English', icon: 'pi pi-check' }
  ];

  shortcuts: Shortcut[] = [];

  showShortcutsDialog = false;

  constructor(private translate: TranslateService) {}

  ngOnInit() {
    // Load saved language preference
    const savedLang = localStorage.getItem(this.LANGUAGE_KEY);
    if (savedLang) {
      this.currentLang = savedLang;
      this.translate.use(savedLang);
    }

    this.shortcuts = [
      { key: 'C', description: this.translate.instant('CREDITS.SHORTCUTS.CENTER_MAP') },
      { key: 'F', description: this.translate.instant('CREDITS.SHORTCUTS.FREEZE_MAP') },
      { key: 'S', description: this.translate.instant('CREDITS.SHORTCUTS.SHOW_STATISTICS') },
      { key: 'H', description: this.translate.instant('CREDITS.SHORTCUTS.EXPORT_PDF_PORTRAIT') },
      { key: 'Q', description: this.translate.instant('CREDITS.SHORTCUTS.EXPORT_PDF_LANDSCAPE') },
      { key: 'T', description: this.translate.instant('CREDITS.SHORTCUTS.SHARE') }
  
    ];
  }

  visualComponents: InfoComponent[] = [
    { name: 'OpenStreetMap', icon: 'pi pi-map', url: 'https://www.openstreetmap.org' },
    { name: 'Angular', icon: 'pi pi-code', url: 'https://angular.io' },
    { name: 'PrimeNG', icon: 'pi pi-desktop', url: 'https://primeng.org' },
    { name: 'Carto', icon: 'pi pi-map-marker', url: 'https://carto.com' }
  ];

  dataComponents: InfoComponent[] = [
    { name: 'NVBW', icon: 'pi pi-database', url: 'https://www.nvbw.de' },
    { name: 'DELFI', icon: 'pi pi-database', url: 'https://www.delfi.de' },
    { name: 'DESTATIS', icon: 'pi pi-chart-bar', url: 'https://www.destatis.de' },
    { name: 'MID', icon: 'pi pi-car', url: 'https://www.mobilitaet-in-deutschland.de' },
    { name: 'OpenStreetMap', icon: 'pi pi-map', url: 'https://www.openstreetmap.org' },
    { name: 'OpenDataSoft', icon: 'pi pi-database', url: 'https://www.opendatasoft.com' },
    { name: 'GeoJsonUtilities', icon: 'pi pi-map-marker', url: 'https://geodata.bw-im.de' }
  ];

  backendComponents: InfoComponent[] = [
    { name: 'Django', icon: 'pi pi-server', url: 'https://www.djangoproject.com' },
    { name: 'PostGIS', icon: 'pi pi-database', url: 'https://postgis.net' }
  ];

  routingComponents: InfoComponent[] = [
    { name: 'Valhalla', icon: 'pi pi-directions', url: 'https://valhalla.readthedocs.io' },
    { name: 'MOTIS', icon: 'pi pi-directions', url: 'https://motis-project.de' },
    { name: 'OpenRouteService', icon: 'pi pi-directions', url: 'https://openrouteservice.org' }
  ];

  items: MenuItem[] = [
    {
      icon: 'pi pi-info-circle',
      command: () => {
        this.showCredits();
      },
      tooltip: 'Credits anzeigen'
    },
    {
      icon: 'pi pi-question-circle',
      command: () => {
        this.showHelp();
      },
      tooltip: 'Hilfe'
    },
    {
      icon: 'pi pi-globe',
      command: () => {
        this.showLanguageDialog = true;
      },
      tooltip: 'Sprache ändern'
    },
    {
      icon: this.isDarkMode ? 'pi pi-sun' : 'pi pi-moon',
      command: () => {
        this.toggleTheme();
      },
      tooltip: this.isDarkMode ? 'Light Mode' : 'Dark Mode'
    },
    {
      icon: 'pi pi-key',
      command: () => {
        this.showShortcuts();
      },
      tooltip: 'Tastenkürzel'
    }
  ];

  showCredits() {
    this.showCreditsDialog = true;
  }

  showHelp() {
    this.showHelpDialog = true;
  }

  openLink(url: string) {
    window.open(url, '_blank');
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    document.documentElement.classList.toggle('dark');
    // Update the icon in the menu
    const themeItem = this.items[3];
    themeItem.icon = this.isDarkMode ? 'pi pi-sun' : 'pi pi-moon';
    themeItem.tooltip = this.isDarkMode ? 'Light Mode' : 'Dark Mode';
  }

  switchLanguage(lang: string) {
    this.currentLang = lang;
    this.translate.use(lang);
    // Save language preference
    localStorage.setItem(this.LANGUAGE_KEY, lang);
    this.showLanguageDialog = false;
  }

  showShortcuts() {
    this.showShortcutsDialog = true;
  }
}
