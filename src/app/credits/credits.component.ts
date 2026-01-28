import { Component, OnInit, HostListener } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { MenuItem } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';
import { SpeedDialModule } from 'primeng/speeddial';
import { TooltipModule } from 'primeng/tooltip';
import { PanelModule } from 'primeng/panel';
import { DividerModule } from 'primeng/divider';
import { ChipModule } from 'primeng/chip';
import { TagModule } from 'primeng/tag';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';
import { ShareService } from '../share/share.service';
import { CreditsService } from './credits.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { LegendService } from '../legend/legend.service';
import { StatisticsService } from '../statistics/statistics.service';
import { AnalyzeService } from '../analyze/analyze.service';

interface InfoComponent {
  name: string;
  icon: string;
  url?: string;
  license?: string;
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
    SpeedDialModule,
    TooltipModule,
    PanelModule,
    DividerModule,
    ChipModule,
    TagModule
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
  isMobile = false;

  private readonly LANGUAGE_KEY = 'mobi.mapr.language';

  languages = [
    { code: 'de', name: 'Deutsch', icon: 'pi pi-check' },
    { code: 'de-bw', name: 'Badisch', icon: 'pi pi-check' },
    { code: 'de-sw', name: 'Schwäbisch', icon: 'pi pi-check' },
    { code: 'en', name: 'English', icon: 'pi pi-check' }
  ];

  shortcuts: Shortcut[] = [
    { key: 'C', description: '' },
    { key: 'F', description: '' },
    { key: 'S', description: '' },
    { key: 'H', description: '' },
    { key: 'Q', description: '' },
    { key: 'T', description: '' },
    { key: 'Z', description: '' }
  ];

  showShortcutsDialog = false;

  constructor(
    private translate: TranslateService,
    private authService: AuthService,
    private router: Router,
    private shareService: ShareService,
    private creditsService: CreditsService,
    private dashboardService: DashboardService,
    private legendService: LegendService,
    private statisticsService: StatisticsService,
    private analyzeService: AnalyzeService
  ) { }

  ngOnInit() {
    // Detect mobile device
    this.checkMobile();

    // Load saved language preference
    const savedLang = localStorage.getItem(this.LANGUAGE_KEY);
    if (savedLang) {
      this.currentLang = savedLang;
      this.translate.use(savedLang);
    }

    // Subscribe to language changes to update translations
    this.translate.onLangChange.subscribe(() => {
      this.updateShortcutTranslations();
      this.updateItems();
    });

    // Initial translation update
    this.updateShortcutTranslations();
    this.updateItems();

    this.creditsService.isExpanded$.subscribe((isExpanded: boolean) => {
      this.showCreditsDialog = isExpanded;
    });

    this.creditsService.isExpanded$.subscribe((isExpanded: boolean) => {
      this.showCreditsDialog = isExpanded;
    });
  }

  private updateShortcutTranslations() {
    this.shortcuts = [
      { key: 'Z', description: this.translate.instant('CREDITS.SHORTCUTS.CENTER_MAP') },
      { key: 'F', description: this.translate.instant('CREDITS.SHORTCUTS.FREEZE_MAP') },
      // { key: 'E', description: this.translate.instant('CREDITS.SHORTCUTS.EXPORT_PDF_PORTRAIT') },
      { key: 'H', description: this.translate.instant('CREDITS.SHORTCUTS.TOGGLE_HEXAGON_VIEW') },
      { key: 'S', description: this.translate.instant('CREDITS.SHORTCUTS.SHOW_STATISTICS') }
    ];
  }

  private updateItems() {
    this.items = [];
    if (!this.shareService.getIsShare()) {
      this.items.push(
        {
          icon: 'pi pi-sign-out',
          label: this.translate.instant('CREDITS.LOGOUT'),
          command: () => {
            this.logout();
          }
        });
    }
    this.items.push(
      {
        icon: 'pi pi-info-circle',
        label: this.translate.instant('CREDITS.SHOW_CREDITS'),
        command: () => {
          this.showCredits();
        }
      },
      {
        icon: 'pi pi-question-circle',
        label: this.translate.instant('CREDITS.SHOW_HELP'),
        command: () => {
          this.showHelp();
        }
      },
      {
        icon: 'pi pi-globe',
        label: this.translate.instant('CREDITS.CHANGE_LANGUAGE'),
        command: () => {
          this.showLanguageDialog = true;
        }
      },
      {
        icon: 'pi pi-key',
        label: this.translate.instant('CREDITS.SHOW_SHORTCUTS'),
        command: () => {
          this.showShortcuts();
        }
      },
      // {
      //   icon: 'pi pi-book',
      //   label: this.translate.instant('CREDITS.TOGGLE_TUTORIAL'),
      //   command: () => {
      //     this.startTutorial();
      //   }
      // }
    );
  }

  visualComponents: InfoComponent[] = [
    { name: 'OpenStreetMap', icon: 'pi pi-map', url: 'https://www.openstreetmap.org' },
    { name: 'Angular', icon: 'pi pi-code', url: 'https://angular.io' },
    { name: 'PrimeNG', icon: 'pi pi-desktop', url: 'https://primeng.org' },
    { name: 'Carto', icon: 'pi pi-map-marker', url: 'https://carto.com' },
    { name: 'MapLibre', icon: 'pi pi-map-marker', url: 'https://maplibre.org' },
    { name: 'Nominatim', icon: 'pi pi-map-marker', url: 'https://nominatim.org' },
    { name: 'Flaticon', icon: 'pi pi-map-marker', url: 'https://www.flaticon.com' }
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
    { name: 'PostGIS', icon: 'pi pi-database', url: 'https://postgis.net' },
    { name: 'pgBouncer', icon: 'pi pi-database', url: 'https://pgbouncer.org' }
  ];

  routingComponents: InfoComponent[] = [
    { name: 'Valhalla', icon: 'pi pi-directions', url: 'https://valhalla.readthedocs.io' },
    { name: 'MOTIS', icon: 'pi pi-directions', url: 'https://motis-project.de' },
    { name: 'OpenRouteService', icon: 'pi pi-directions', url: 'https://openrouteservice.org' }
  ];

  citiesComponents: InfoComponent[] = [
    { name: 'Karlsruhe', icon: 'pi pi-building', url: 'https://transparenz.karlsruhe.de/dataset/stadtteile', license: 'CC Zero' },
    { name: 'Mannheim', icon: 'pi pi-building', url: 'https://mannheim.opendatasoft.com/pages/info/', license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Stuttgart', icon: 'pi pi-building', url: 'https://opendata.stuttgart.de/dataset/kleinraumige-gliederung', license:'cc by 4.0' },
    { name: 'München', icon: 'pi pi-building', url: 'https://opendata.muenchen.de/ne/dataset/vablock_viertel_opendata', license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Nürnberg', icon: 'pi pi-building', url: 'https://wiki.openstreetmap.org/wiki/N%C3%BCrnberg/Stadtteile', license: "cc by 4.0" },
    { name: 'Berlin', icon: 'pi pi-building', url: 'https://gdi.berlin.de/geonetwork/srv/ger/catalog.search#/metadata/1cc18674-2a0c-36e3-aba3-f34a54c0d844', license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Bremen', icon: 'pi pi-building', url: 'https://metaver.de/trefferanzeige?cmd=doShowDocument&docuuid=D9F32B22-C647-42FD-9E95-1344AC57BC46' , license: 'cc by 4.0' },
    { name: 'Hamburg', icon: 'pi pi-building', url: 'https://metaver.de/trefferanzeige?cmd=doShowDocument&docuuid=F35EAC11-C236-429F-B1BF-751C0C18E8B7' , license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Köln', icon: 'pi pi-building', url: 'https://www.offenedaten-koeln.de/dataset/stadtteile-k%C3%B6ln' , license: 'Datenlizenz Deutschland – Zero – Version 2.0' },
    { name: 'Duisburg', icon: 'pi pi-building', url: 'https://opendata-duisburg.de/dataset/ortsteile' , license: 'CC BY 3.0 DE' },
    { name: 'Münster', icon: 'pi pi-building', url: 'https://opendata.stadt-muenster.de/dataset/geokoordinaten-der-stadtteil-grenzen-geometriedaten-der-kleinr%C3%A4umigen-gebietsgliederung-5' , license: 'dl-by-de/2.0' },
    { name: 'Düsseldorf', icon: 'pi pi-building', url: 'https://open.nrw/dataset/stadtteilgrenzen-dusseldorf-2025-d' , license: 'Datenlizenz Deutschland – Zero – Version 2.0' },
    { name: 'Essen', icon: 'pi pi-building', url: 'https://opendata.essen.de/dataset/verwaltungsgrenzen-der-stadt-essen' , license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Bochum', icon: 'pi pi-building', url: 'https://bochum.opendata.ruhr/dataset/bochum-stadtgebiet_stadtbezirke' , license: '?' },
    { name: 'Dresden', icon: 'pi pi-building', url: 'https://opendata.dresden.de/informationsportal/#app/mainpage' , license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Leipzig', icon: 'pi pi-building', url: 'https://opendata.leipzig.de/de/dataset/geodaten-stadtbezirke-leipzig/resource/81a423d8-1a2b-4f84-b9f1-0d8b9533d5a8' , license: '	Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Wuppertal', icon: 'pi pi-building', url: 'https://www.offenedaten-wuppertal.de/dataset/stadtbezirke-wuppertal' , license: 'cc-by/4.0' },
    { name: 'Bonn', icon: 'pi pi-building', url: 'https://opendata.bonn.de/dataset/fl%C3%A4chen-der-stadtbezirke' , license: 'cc zero' },
    { name: 'Bielefeld', icon: 'pi pi-building', url: 'https://open-data.bielefeld.de/dataset/stadtbezirke' , license: 'cc by 4.0' },
    { name: 'Augsburg', icon: 'pi pi-building', url: 'https://geodaten.augsburg.de/portal/apps/experiencebuilder/experience/?id=99fbbe168804490eab9cc1cebb959e9e&page=Gebietseinteilungen' , license: 'cc by 4.0' },
    { name: 'Frankfurt', icon: 'pi pi-building', url: 'https://offenedaten.frankfurt.de/#app/startpage' , license: 'Datenlizenz Deutschland Namensnennung 2.0' }
  ];

  items: MenuItem[] = [];

  showCredits() {
    this.closeAllSidebars();
    this.creditsService.showCredits();
  }

  private closeAllSidebars() {
    // Close dashboard right sidebar
    this.dashboardService.setRightSidebarExpanded(false);
    this.dashboardService.setLeftSidebarExpanded(false);

    // Close share right sidebar
    this.shareService.toggleRightSidebarExpanded();
    if (this.shareService.getIsShare()) {
      // If it was open, close it again to ensure it's closed
      this.shareService.toggleRightSidebarExpanded();
    }

    // Close legend
    if (this.legendService.getIsExpanded()) {
      this.legendService.toggleExpand();
    }

    // Close statistics
    this.statisticsService.visible = false;

    // Close analyze
    this.analyzeService.hide();
  }

  showHelp() {
    this.router.navigate(['/landing'], { queryParams: { redirect: 'false' } });
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

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
  }

  private checkMobile() {
    this.isMobile = window.innerWidth <= 768;
  }
}
