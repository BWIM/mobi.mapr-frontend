import { Component } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { MenuItem } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';
import { SpeedDialModule } from 'primeng/speeddial';

interface InfoComponent {
  name: string;
  icon: string;
  url?: string;
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
export class CreditsComponent {
  showCreditsDialog = false;
  showHelpDialog = false;
  isDarkMode = false;

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
      icon: this.isDarkMode ? 'pi pi-sun' : 'pi pi-moon',
      command: () => {
        this.toggleTheme();
      },
      tooltip: this.isDarkMode ? 'Light Mode' : 'Dark Mode'
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
    const themeItem = this.items[2];
    themeItem.icon = this.isDarkMode ? 'pi pi-sun' : 'pi pi-moon';
    themeItem.tooltip = this.isDarkMode ? 'Light Mode' : 'Dark Mode';
  }
}
