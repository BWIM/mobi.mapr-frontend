import { Component, inject, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { ProjectsService } from '../../services/project.service';
import { FilterConfigService } from '../../services/filter-config.service';
import { DashboardSessionService } from '../../services/dashboard-session.service';
import { SharedModule } from '../../shared/shared.module';
import { InfoOverlayComponent } from '../../shared/info-overlay/info-overlay.component';
import { InfoDialogComponent } from '../../shared/info-overlay/info-dialog.component';
import { LegendInfoComponent } from '../../shared/legend-info/legend-info.component';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChartModule } from 'primeng/chart';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-left',
  imports: [SharedModule, InfoOverlayComponent, TranslateModule, ChartModule],
  templateUrl: './left.component.html',
  styleUrl: './left.component.css',
})
export class LeftComponent implements OnInit, OnDestroy {
  private projectService = inject(ProjectsService);
  private filterConfigService = inject(FilterConfigService);
  private dashboardSessionService = inject(DashboardSessionService);
  private dialog = inject(MatDialog);
  private translate = inject(TranslateService);
  private languageSubscription?: Subscription;
  private currentLang = signal<string>(this.translate.currentLang || 'de');

  // Use the project signal directly - it will reactively update when the project loads
  project = this.projectService.project;
  isLoading = this.projectService.isLoading;

  // Check if user is only authenticated via share_key (not logged in)
  isShareKeyOnly = computed(() => {
    return this.dashboardSessionService.accessMethod() === 'share_key';
  });

  // Quality graph data
  qualityChartData: any;
  qualityChartOptions: any;
  
  // Personas pie chart data
  personasChartData: any;
  personasChartOptions: any;
  
  // Admin level options - reactive to language changes
  adminLevelOptions = computed(() => {
    const lang = this.currentLang(); // Track language changes
    return [
      { value: null as 'state' | 'county' | 'municipality' | 'hexagon' | null, label: this.translate.instant('left.adminLevel.automatic') },
      { value: 'hexagon' as const, label: this.translate.instant('left.adminLevel.hexagon') },
      { value: 'municipality' as const, label: this.translate.instant('left.adminLevel.municipality') },
      { value: 'county' as const, label: this.translate.instant('left.adminLevel.county') },
      { value: 'state' as const, label: this.translate.instant('left.adminLevel.state') }
    ];
  });
  
  // Expose filter config service signals for template
  // isExpanded = this.filterConfigService.isExpanded;
  isExpanded = signal<boolean>(true); // Default to true for now
  modeOptions = this.filterConfigService.modeOptions;
  selectedModes = this.filterConfigService.selectedModes;
  selectedBewertung = this.filterConfigService.selectedBewertung;
  selectedAdminLevel = this.filterConfigService.selectedAdminLevel;
  selectedActivities = this.filterConfigService.selectedActivities;
  selectedPersonas = this.filterConfigService.selectedPersonas;
  selectedRegioStars = this.filterConfigService.selectedRegioStars;
  selectedStates = this.filterConfigService.selectedStates;
  allActivities = this.filterConfigService.allActivities;
  allPersonas = this.filterConfigService.allPersonas;
  allRegioStars = this.filterConfigService.allRegioStars;
  allStates = this.filterConfigService.allStates;
  hasCategories = this.filterConfigService.hasCategories;

  constructor() {
    // Initialize project if not already initialized
    if (!this.projectService.isInitialized()) {
      this.projectService.initializeProject();
    }
  }

  ngOnInit() {
    this.initializeQualityChart();
    this.initializePersonasChart();
    
    // Subscribe to language changes to update chart labels and admin level options
    this.languageSubscription = this.translate.onLangChange.subscribe((event) => {
      this.currentLang.set(event.lang);
      this.initializePersonasChart();
    });
  }

  ngOnDestroy() {
    if (this.languageSubscription) {
      this.languageSubscription.unsubscribe();
    }
  }

  private getPrimaryColor(): string {
    // Get the primary color from CSS variable
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      const primaryColor = getComputedStyle(root).getPropertyValue('--primary-color').trim();
      return primaryColor || '#482683'; // Fallback to default primary color
    }
    return '#482683';
  }

  private initializeQualityChart(): void {
    // Define the 18 grade levels from A+ to F-
    const gradeLevels = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E+', 'E', 'E-', 'F+', 'F', 'F-'];

    // Define grade ranges and their corresponding colors
    const gradeRanges = [
      { name: 'A', min: 0, max: 0.35, color: '#32612d' },      // Dark Green
      { name: 'B', min: 0.35, max: 0.51, color: '#3cb043' },   // Light Green
      { name: 'C', min: 0.51, max: 0.72, color: '#eed202' },   // Yellow
      { name: 'D', min: 0.72, max: 1.0, color: '#ed7014' },    // Orange
      { name: 'E', min: 1.0, max: 1.41, color: '#c21807' },    // Red
      { name: 'F', min: 1.41, max: 2.0, color: '#9656a2' }     // Purple
    ];

    // Generate exponential function data: h(x) = 0.2511169 * 1.122178^x for x = 1 to 18
    const exponentialData: number[] = [];
    const xValues: number[] = [];
    for (let x = 1; x <= 18; x++) {
      const y = 0.2511169 * Math.pow(1.122178, x);
      exponentialData.push(y);
      xValues.push(x);
    }

    // Create datasets for the chart - only the base exponential line with colored segments
    const datasets: any[] = [];

    // Create colored line segments for each grade range
    gradeRanges.forEach((grade, index) => {
      const segmentData: Array<{ x: number; y: number | null }> = [];

      // Find the range of x-values that should be included for this grade
      let startX = -1;
      let endX = -1;

      // Find the first x where y >= grade.min
      if (grade.name === 'F') {
        // For the last grade (F), start from where E ends
        for (let x = 1; x <= 18; x++) {
          const y = 0.2511169 * Math.pow(1.122178, x);
          if (y >= grade.min) {
            startX = x;
            break;
          }
        }
      } else if (grade.name === 'A') {
        // For the first grade (A), start from x=1
        startX = 1;
      } else {
        for (let x = 1; x <= 18; x++) {
          const y = 0.2511169 * Math.pow(1.122178, x);
          if (y >= grade.min) {
            startX = x;
            break;
          }
        }
      }

      // Find the last x where y < grade.max (or include all remaining for last grade)
      if (grade.name === 'F') {
        // For the last grade (F), include all remaining points
        endX = 18;
      } else {
        for (let x = startX; x <= 18; x++) {
          const y = 0.2511169 * Math.pow(1.122178, x);
          if (y >= grade.max) {
            endX = x; // Include this point to connect to next segment
            break;
          }
        }
        if (endX === -1) endX = 18; // Fallback
      }

      // Create data points for this segment
      for (let x = 1; x <= 18; x++) {
        if (x >= startX && x <= endX) {
          const y = 0.2511169 * Math.pow(1.122178, x);
          segmentData.push({ x: x, y: y });
        } else {
          segmentData.push({ x: x, y: null });
        }
      }

      datasets.push({
        type: 'line',
        label: '', // Hide grade line labels
        borderColor: grade.color,
        borderWidth: 3,
        fill: false,
        tension: 0.4,
        data: segmentData,
        pointRadius: 0,
        pointHoverRadius: 0,
        spanGaps: false
      });
    });

    this.qualityChartData = {
      datasets: datasets.reverse()
    };

    const primaryColor = this.getPrimaryColor();
    
    this.qualityChartOptions = {
      maintainAspectRatio: false,
      aspectRatio: 0.6,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: false
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0.5,
          max: 18.5,
          ticks: {
            color: primaryColor,
            stepSize: 1,
            callback: function (value: number) {
              const gradeIndex = Math.round(value) - 1;
              return gradeIndex >= 0 && gradeIndex < gradeLevels.length ? gradeLevels[gradeIndex] : '';
            }
          },
          grid: {
            color: '#ebedef'
          },
          title: {
            display: true,
            text: 'Quality Grade',
            color: primaryColor,
            font: {
              size: 12,
              weight: 'bold'
            }
          }
        },
        y: {
          min: 0,
          max: 2,
          ticks: {
            display: true,
            color: primaryColor,
            stepSize: 0.2,
            callback: function (value: number) {
              return (value * 100).toFixed(0) + '%';
            }
          },
          grid: {
            color: '#ebedef'
          },
          title: {
            display: true,
            text: 'Relative Time',
            color: primaryColor,
            font: {
              size: 12,
              weight: 'bold'
            }
          }
        }
      },
      interaction: {
        mode: 'point',
        intersect: true
      }
    };
  }

  toggleSidebar() {
    this.filterConfigService.toggleSidebar();
  }

  setSidebarExpanded(expanded: boolean) {
    this.filterConfigService.setSidebarExpanded(expanded);
  }

  toggleVerkehrsmittel(modeId: number) {
    // Find the mode option to check if it's pedestrian or car
    const modeOption = this.modeOptions().find(option => option.id === modeId);
    
    // Prevent deselecting pedestrian mode if it's currently selected
    if (modeOption && modeOption.name.toLowerCase() === 'pedestrian' && this.isSelected(modeId)) {
      return; // Don't allow deselecting pedestrian mode
    }
    
    // Prevent toggling car mode if it's disabled (persona cannot use car)
    if (this.isModeDisabled(modeId)) {
      return; // Don't allow toggling car mode when disabled
    }
    
    this.filterConfigService.toggleMode(modeId);
  }

  isSelected(modeId: number): boolean {
    return this.filterConfigService.isModeSelected(modeId);
  }

  isPedestrianMode(modeId: number): boolean {
    const modeOption = this.modeOptions().find(option => option.id === modeId);
    return modeOption?.name.toLowerCase() === 'pedestrian';
  }

  isCarMode(modeId: number): boolean {
    const modeOption = this.modeOptions().find(option => option.id === modeId);
    return modeOption?.name.toLowerCase() === 'car';
  }

  isModeDisabled(modeId: number): boolean {
    return this.filterConfigService.isModeDisabled(modeId);
  }

  getModeTooltip(option: { id: number; display_name: string }): string {
    if (this.isPedestrianMode(option.id) && this.isSelected(option.id)) {
      const cannotDisable = this.translate.instant('left.transportModes.cannotDisable');
      return `${option.display_name} - ${cannotDisable}`;
    }
    if (this.isCarMode(option.id) && this.isModeDisabled(option.id)) {
      const cannotUseCar = this.translate.instant('left.transportModes.cannotUseCar');
      return `${option.display_name} - ${cannotUseCar}`;
    }
    return option.display_name;
  }

  selectMobilitatsbewertung(bewertung: 'qualitaet' | 'zeit') {
    this.filterConfigService.setBewertung(bewertung);
  }

  isMobilitatsbewertungSelected(bewertung: 'qualitaet' | 'zeit'): boolean {
    return this.filterConfigService.isBewertungSelected(bewertung);
  }

  selectAdminLevel(adminLevel: 'state' | 'county' | 'municipality' | 'hexagon' | null): void {
    this.filterConfigService.setAdminLevel(adminLevel);
  }

  isAdminLevelSelected(adminLevel: 'state' | 'county' | 'municipality' | 'hexagon' | null): boolean {
    return this.selectedAdminLevel() === adminLevel;
  }

  openFilterDialog() {
    // Prevent opening filter dialog if user is only authenticated via share key
    if (this.isShareKeyOnly()) {
      return;
    }
    this.filterConfigService.openFilterDialog();
  }

  resetFilters() {
    // Prevent resetting filters if user is only authenticated via share key
    if (this.isShareKeyOnly()) {
      return;
    }
    this.filterConfigService.resetAdvancedFilters();
  }

  openDialog() {
    this.dialog.open(InfoDialogComponent, {
      width: '80vw',
      height: '80vh',
      maxWidth: '80vw',
      maxHeight: '80vh',
    });
  }

  openLegendInfoDialog(): void {
    this.dialog.open(InfoDialogComponent, {
      width: '80vw',
      height: '80vh',
      maxWidth: '80vw',
      maxHeight: '80vh',
      panelClass: 'info-dialog-panel',
      data: { content: LegendInfoComponent }
    });
  }

  getSelectedPersonaName(): string {
    const selectedPersonaId = this.selectedPersonas();
    if (selectedPersonaId === null) {
      return '';
    }
    const persona = this.allPersonas().find(p => p.id === selectedPersonaId);
    return persona ? (persona.display_name || persona.name) : '';
  }

  getFormattedCreatedDate(): string {
    const projectData = this.project();
    if (!projectData?.created) {
      return '';
    }
    const createdDate = new Date(projectData.created);
    const day = String(createdDate.getDate()).padStart(2, '0');
    const month = String(createdDate.getMonth() + 1).padStart(2, '0');
    const year = createdDate.getFullYear();
    return `${day}.${month}.${year}`;
  }

  private initializePersonasChart(): void {
    // 12 persona groups with specific percentages from MiD study
    const labels = [
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group1'),
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group2'),
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group3'),
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group4'),
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group5'),
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group6'),
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group7'),
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group8'),
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group9'),
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group10'),
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group11'),
      this.translate.instant('left.activeFilters.infoTabs.personasContent.personGroups.group12')
    ];

    // Specific percentages from MiD study
    const data = [
      32, // Erwerbstätige/r mit verfügbarem Pkw
      15, // Erwerbstätige/r ohne verfügbaren Pkw
      15, // Nicht-Erwerbstätige/r mit verfügbarem Pkw
      14, // Nicht-Erwerbstätige/r ohne verfügbaren Pkw
      1,  // Student/in mit verfügbarem Pkw
      1,  // Student/in ohne verfügbaren Pkw
      1,  // Auszubildende/r mit verfügbarem Pkw
      1,  // Auszubildende/r ohne verfügbaren Pkw
      7,  // Kind 0-6 Jahre
      4,  // Schüler/in 7-10 Jahre
      3,  // Schüler/in 11-21 Jahre mit verfügbarem Pkw
      3   // Schüler/in 11-21 Jahre ohne verfügbaren Pkw
    ];

    // Color palette - using variations of primary color and complementary colors
    const colors = [
      '#482683', // Primary color
      '#6B4C93', // Lighter purple
      '#8E6BA8', // Even lighter purple
      '#B18FC2', // Light purple
      '#3A5F8F', // Blue-purple
      '#4A7BA7', // Lighter blue-purple
      '#5C97BF', // Light blue-purple
      '#6EB3D7', // Very light blue-purple
      '#2D4A6B', // Dark blue
      '#3D6B8F', // Medium blue
      '#4D8CB3', // Light blue
      '#5DADD7'  // Very light blue
    ];

    // Create array of objects with all data, then sort by weight (descending)
    const chartItems = labels.map((label, index) => ({
      label,
      data: data[index],
      color: colors[index]
    }));

    // Sort by weight (data) in descending order
    chartItems.sort((a, b) => b.data - a.data);

    // Extract sorted arrays
    const sortedLabels = chartItems.map(item => item.label);
    const sortedData = chartItems.map(item => item.data);
    const sortedColors = chartItems.map(item => item.color);

    // Create new object reference to ensure change detection works
    this.personasChartData = {
      labels: [...sortedLabels], // Create new array with sorted labels
      datasets: [
        {
          data: [...sortedData], // Create new array with sorted data
          backgroundColor: [...sortedColors], // Create new array with sorted colors
          borderColor: 'var(--background-color)',
          borderWidth: 2
        }
      ]
    };

    this.personasChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            color: 'var(--primary-color)',
            font: {
              size: 11
            },
            padding: 8,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const label = context.label || '';
              const value = context.parsed || 0;
              return `${label}: ${value.toFixed(1)}%`;
            }
          }
        }
      }
    };
  }

}
