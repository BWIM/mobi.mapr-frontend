import { Component, OnDestroy, ChangeDetectorRef, AfterViewInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { Subscription, forkJoin } from 'rxjs';
import { AnalyzeService } from './analyze.service';
import { TranslateService } from '@ngx-translate/core';
import { Category, Activity, Place, Properties, Profile, Persona, DisplayNameItem, CategoryWithDisplayName, ActivityWithDisplayName, PersonaWithDisplayName, ProfileWithDisplayName } from './analyze.interface';
import { MapGeoJSONFeature } from 'maplibre-gl';
import { UIChart } from 'primeng/chart';
import { MessageService } from 'primeng/api';

import { default as OlMap } from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat, toLonLat } from 'ol/proj';
import Overlay from 'ol/Overlay';
import { Style, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style';
import { MultiPolygon } from 'ol/geom';
import { IndexService } from '../services/index.service';
import { MapV2Service } from '../map-v2/map-v2.service';

@Component({
  selector: 'app-analyze',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css'
})
export class AnalyzeComponent implements OnDestroy, AfterViewInit {
  visible: boolean = false;
  loading: boolean = false;
  isComparisonMode: boolean = false;
  activitiesLoading: boolean = false;
  personaLoading: boolean = false;
  profilesLoading: boolean = false;
  private subscriptions: Subscription[] = [];

  profiles: Profile[] = [];
  personas: Persona[] = [];
  categories: Category[] = [];

  // Display name lookup maps
  categoriesDisplayNames: Map<number, string> = new Map();
  activitiesDisplayNames: Map<number, string> = new Map();
  personasDisplayNames: Map<number, string> = new Map();
  profilesDisplayNames: Map<number, string> = new Map();

  feature: MapGeoJSONFeature | undefined;
  properties: Properties | undefined;
  averageType: 'mean' | 'median' = 'mean';
  populationArea: 'pop' | 'area' = 'pop';
  isScoreVisualization: boolean = false;
  currentScore: number = 0;
  currentScoreColor: string = '';
  sortBy: 'score' | 'weight' = 'weight';
  showPersona: boolean = true;
  activeTab: string = 'activities';
  personaChartZoomed: boolean = false;
  showSubactivitiesMap: boolean = false;
  hoveredSubactivityName: string = '';
  mapLoaded: boolean = false;

  // Subactivities pie chart properties
  showSubactivitiesPie: boolean = false;
  subactivitiesPieData: any;
  subactivitiesPieOptions: any;
  hoveredCategoryId: number | null = null;
  hoveredCategoryName: string = '';
  subactivitiesLoading: boolean = false;
  generateLabels: any;

  // Diagrammdaten
  personaChartData: any;
  activitiesChartData: any;
  profilesChartData: any;
  radarChartOptions: any;
  radarChartOptionsProfiles: any;
  barChartOptions: any;
  profilesBarChartOptions: any;
  subBarChartOptions: any;
  subactivitiesChartData: any;
  noPlaces: boolean = false;
  disablePlaces: boolean = false;
  profileLegendData: any[] = [];

  // Map properties
  private map?: OlMap;
  private overlay?: Overlay;
  private placesLayer?: VectorLayer<VectorSource>;
  private centerLayer?: VectorLayer<VectorSource>;
  private shapeLayer?: VectorLayer<VectorSource>;
  private tooltipElement?: HTMLElement;
  private tooltipOverlay?: Overlay;


  @ViewChild('activitiesChart') activitiesChart?: UIChart;
  @ViewChild('personaChart') personaChart?: UIChart;
  @ViewChild('profilesChart') profilesChart?: UIChart;
  @ViewChild('subactivitiesPieChart') subactivitiesPieChart?: UIChart;
  @ViewChild('dialogContainer') dialogContainer?: ElementRef;

  private resizeObserver?: ResizeObserver;
  private resizeTimeout?: any;

  getScore(): { score: number, color: string } {
    if (!this.properties) return { score: 0, color: '' };
    const mapType = `${this.populationArea}_${this.averageType}`;
    this.currentScore = this.properties[mapType] as number || 0;
    const color = `${this.populationArea}_${this.averageType}_color`;
    this.currentScoreColor = this.properties[color] as string || '';
    return { score: this.currentScore, color: this.currentScoreColor };
  }

  constructor(
    private analyzeService: AnalyzeService,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService,
    private indexService: IndexService,
    private mapService: MapV2Service,
    private translate: TranslateService
  ) {
    this.isScoreVisualization = this.mapService.getVisualizationType() === 'score';
    this.subscriptions.push(
      this.mapService.visualizationType$.subscribe(type => {
        this.isScoreVisualization = type === 'score';
      })
    );
    this.subscriptions.push(
      this.analyzeService.visible$.subscribe(
        visible => {
          this.visible = visible;
          if (visible) {
            const state = this.analyzeService.getCurrentState();
            if (state.feature) {
              this.feature = state.feature;
              this.properties = this.feature.properties as Properties;
            }
            // Check if we're in comparison mode (difference map)
            this.isComparisonMode = this.mapService.isDifferenceMap();
            if (this.isComparisonMode) {
              this.loading = false;
            } else if (state.projectId && state.mapType && state.feature) {
              this.loading = true;
              this.loadDisplayNamesAndData();
            } else {
              console.warn('Nicht alle erforderlichen Parameter sind verfügbar:', state);
            }
          }
        }
      ),
      // this.mapService.visualizationSettings$.subscribe(settings => {
      //   this.averageType = settings.averageType;
      //   this.populationArea = settings.populationArea;
      //   this.getScore();
      //   this.cdr.detectChanges();
      // })
    );
    this.getScore();

    this.generateLabels = function (chart: any) {
      return [
        {
          text: 'A',
          fillStyle: 'rgba(50, 97, 45, 0.2)',
          strokeStyle: '#32612d',
          fontColor: '#000000',
          lineWidth: 1,
          hidden: false,
          boxWidth: 30,
          boxHeight: 20,
          borderRadius: 4
        },
        {
          text: 'B',
          fillStyle: 'rgba(60, 176, 67, 0.2)',
          strokeStyle: '#3cb043',
          fontColor: '#000000',
          lineWidth: 1,
          hidden: false,
          boxWidth: 30,
          boxHeight: 20,
          borderRadius: 4
        },
        {
          text: 'C',
          fillStyle: 'rgba(238, 210, 2, 0.2)',
          strokeStyle: '#eed202',
          fontColor: '#000000',
          lineWidth: 1,
          hidden: false,
          boxWidth: 30,
          boxHeight: 20,
          borderRadius: 4
        },
        {
          text: 'D',
          fillStyle: 'rgba(237, 112, 20, 0.2)',
          strokeStyle: '#ed7014',
          fontColor: '#000000',
          lineWidth: 1,
          hidden: false,
          boxWidth: 30,
          boxHeight: 20,
          borderRadius: 4
        },
        {
          text: 'E',
          fillStyle: 'rgba(194, 24, 7, 0.2)',
          strokeStyle: '#c21807',
          fontColor: '#000000',
          lineWidth: 1,
          hidden: false,
          boxWidth: 30,
          boxHeight: 20,
          borderRadius: 4
        },
        {
          text: 'F',
          fillStyle: 'rgba(150, 86, 162, 0.2)',
          strokeStyle: '#9656a2',
          fontColor: '#000000',
          lineWidth: 1,
          hidden: false,
          boxWidth: 30,
          boxHeight: 20,
          borderRadius: 4
        }
      ];
    }

    // Grundlegende Chart-Optionen für verschiedene Diagrammtypen
    this.radarChartOptions = {
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            generateLabels: this.generateLabels,
            usePointStyle: false,
            padding: 15
          }
        }
      },
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
        }
      }
    };

    this.radarChartOptionsProfiles = {
      plugins: {
        legend: {
          position: 'bottom',
        }
      }
    }
  }

  private loadDisplayNamesAndData(): void {
    // Load all display names first, then load the actual data
    const displayNameRequests = [
      this.analyzeService.getCategoriesSimple(),
      this.analyzeService.getActivitiesSimple(),
      this.analyzeService.getPersonasSimple(),
      this.analyzeService.getProfilesSimple()
    ];

    // Use forkJoin to wait for all display name requests to complete
    forkJoin(displayNameRequests).subscribe({
      next: ([categoriesNames, activitiesNames, personasNames, profilesNames]) => {
        // Store display names in maps
        this.categoriesDisplayNames = new Map(categoriesNames.map(item => [item.id, item.display_name]));
        this.activitiesDisplayNames = new Map(activitiesNames.map(item => [item.id, item.display_name]));
        this.personasDisplayNames = new Map(personasNames.map(item => [item.id, item.display_name]));
        this.profilesDisplayNames = new Map(profilesNames.map(item => [item.id, item.display_name]));

        // Now load the actual data
        this.loadAnalyzeData();
      },
      error: (error) => {
        console.error('Error loading display names:', error);
        // Still try to load data even if display names fail
        this.loadAnalyzeData();
      }
    });
  }

  private loadAnalyzeData(): void {
    this.analyzeService.getProfiles().subscribe({
      next: (profiles) => {
        this.profiles = profiles || [];
        this.initializeChartData();
      },
      error: (error) => {
        console.error('Error loading profiles:', error);
        this.profiles = [];
        this.initializeChartData();
      }
    });
    this.analyzeService.getPersonas().subscribe({
      next: (personas) => {
        this.personas = personas || [];
        this.initializeChartData();
      },
      error: (error) => {
        console.error('Error loading personas:', error);
        this.personas = [];
        this.initializeChartData();
      }
    });
    this.analyzeService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories || [];
        this.initializeChartData();
      },
      error: (error) => {
        console.error('Error loading categories:', error);
        this.categories = [];
        this.initializeChartData();
      }
    });
  }

  private initializeChartData(): void {
    // Set loading states for all charts
    this.activitiesLoading = true;
    this.personaLoading = true;
    this.profilesLoading = true;

    this.initializeProfilesChart();
    this.initializeActivitiesChart();
    this.initializePersonaChart();
    this.initializeSubActivitiesChart(); // Initialize without category to show empty chart
    this.loading = false;

    // Ensure charts are properly sized after initialization
    setTimeout(() => {
      this.resizeCharts();
    }, 200);
  }

  private getColorForValue = (value: number): string => {
    if (this.isScoreVisualization) {
      // value is score in seconds
      if (value < 600) return 'rgb(0, 60, 0)';       // <10 min
      if (value < 1200) return 'rgb(0, 100, 0)';     // 10-20 min
      if (value < 1800) return 'rgb(0, 140, 0)';     // 20-30 min
      if (value < 2400) return 'rgb(133, 218, 133)'; // 30-40 min
      if (value < 3000) return 'rgb(238, 61, 61)';   // 40-50 min
      if (value < 3600) return 'rgb(201, 0, 0)';     // 50-60 min
      return 'rgb(126, 0, 0)';                       // >60 min
    }
    // Index-based (percent)
    if (value > 141) return '#9656a2';      // Lila (F)
    if (value > 100) return '#c21807';      // Rot (E)
    if (value > 72) return '#ed7014';       // Orange (D)
    if (value > 51) return '#eed202';       // Gelb (C)
    if (value > 35) return '#3cb043';       // Hellgrün (B)
    if (value > 0) return '#32612d';        // Dunkelgrün (A)
    return '#9656a2';                       // Lila (F)
  };

  private getProfileColor = (profileId: string): string => {
    const profileColors: { [key: string]: string } = {
      2: '#1D3A6E',      // Navy Blue
      4: '#4A90E2',      // Sky Blue
      5: '#A7C7F2',         // Light Blue
      7: '#007C7C',        // Teal
      9: '#1EB7B2',         // Turquoise
      10: '#A0E0DE',       // Soft Aqua
      12: '#5A5A5A',                  // Slate Gray
      16: '#4B0082'               // Indigo
    };
    return profileColors[profileId] || '#666666'; // Default gray if not found
  };

  getLegendItems(): { label: string; color: string }[] {
    if (this.isScoreVisualization) {
      return [
        { label: '<10 min', color: 'rgb(0, 60, 0)' },
        { label: '10-20 min', color: 'rgb(0, 100, 0)' },
        { label: '20-30 min', color: 'rgb(0, 140, 0)' },
        { label: '30-40 min', color: 'rgb(133, 218, 133)' },
        { label: '40-50 min', color: 'rgb(238, 61, 61)' },
        { label: '50-60 min', color: 'rgb(201, 0, 0)' },
        { label: '>60 min', color: 'rgb(126, 0, 0)' },
      ];
    }
    return [
      { label: 'A', color: '#32612d' },
      { label: 'B', color: '#3cb043' },
      { label: 'C', color: '#eed202' },
      { label: 'D', color: '#ed7014' },
      { label: 'E', color: '#c21807' },
      { label: 'F', color: '#9656a2' },
    ];
  }

  private initializeActivitiesChart(): void {
    if (!this.categories || this.categories.length === 0) {
      // Set empty chart data when no categories
      this.activitiesChartData = {
        labels: [],
        datasets: [{
          label: 'Aktivitäten',
          data: [],
          backgroundColor: [],
          borderColor: [],
          borderWidth: 1,
          yAxisID: 'y',
          barPercentage: 0.8
        }]
      };
      this.activitiesLoading = false;
      return;
    }

    // Sort categories based on current sort type
    const sortedData = [...this.categories].sort((a, b) => {
      if (this.sortBy === 'weight') {
        return b.weight - a.weight;  // Sort by weight in descending order
      } else {
        const aMetric = this.isScoreVisualization ? (a.score ?? 0) : a.index;
        const bMetric = this.isScoreVisualization ? (b.score ?? 0) : b.index;
        return bMetric - aMetric;    // Sort by metric in descending order
      }
    });

    let labels: string[] = [];
    // Extract sorted arrays using display names from lookup map
    labels = sortedData.map(item => this.categoriesDisplayNames.get(item.id) || `Category ${item.id}`);

    // Truncate labels longer than 30 characters
    labels = labels.map(label => {
      if (label && label.length > 30) {
        return label.substring(0, 27) + '...';
      }
      return label;
    });
    const scores = sortedData.map(item =>
      this.isScoreVisualization ? (item.score ?? 0) : item.index * 100
    );
    const rawWeights = sortedData.map(item => item.weight);
    const scoreNames = sortedData.map(item =>
      this.isScoreVisualization
        ? `${((item.score ?? 0) / 60).toFixed(1)} ${this.translate.instant('LEGEND.MINUTES')}`
        : this.indexService.getIndexName(item.index)
    );

    // Normalize weights to percentages
    const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);
    const normalizedWeights = totalWeight > 0 ? rawWeights.map(weight => (weight / totalWeight) * 100) : [];

    const scoreColors = scores.map(value => this.getColorForValue(value));

    this.activitiesChartData = {
      labels: labels,
      datasets: [
        {
          label: 'Aktivitäten',
          data: normalizedWeights,
          backgroundColor: scoreColors,
          borderColor: scoreColors,
          borderWidth: 1,
          yAxisID: 'y',
          barPercentage: 0.8
        }
      ]
    };

    this.barChartOptions = {
      indexAxis: 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context: any) => {
              const index = context.dataIndex;
              return [
                `Note: ${scoreNames[index]}`,
                `Relevanz: ${normalizedWeights[index].toFixed(1)}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#495057',
          },
          grid: {
            color: '#ebedef'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          beginAtZero: true,
          ticks: {
            color: '#495057'
          },
          grid: {
            color: '#ebedef'
          },
          title: {
            display: true,
            text: 'Relevanz (%)'
          }
        }
      }
    };

    this.activitiesLoading = false; // Clear loading state when chart is ready
  }

  private initializeSubActivitiesChart(categoryId?: number): void {
    if (!categoryId) {
      this.subactivitiesChartData = {
        labels: [],
        datasets: [{
          label: 'Subaktivitäten',
          data: [],
          backgroundColor: [],
          borderColor: [],
          borderWidth: 1,
          yAxisID: 'y',
          barPercentage: 0.8
        }]
      };
      this.subactivitiesLoading = false;
      return;
    }

    // Get activities for the selected category
    this.analyzeService.getActivities(categoryId).subscribe({
      next: (activities) => {
        this.subactivitiesLoading = false; // Clear loading state when data is received
        if (!activities || activities.length === 0) {
          this.subactivitiesChartData = {
            labels: [],
            datasets: [{
              label: 'Subaktivitäten',
              data: [],
              backgroundColor: [],
              borderColor: [],
              borderWidth: 1,
              yAxisID: 'y',
              barPercentage: 0.8
            }]
          };
          return;
        }

        // Sort activities by weight descending
        const sortedActivities = [...activities].sort((a, b) => b.weight - a.weight);

        // Normalize weights to percentages
        const rawWeights = sortedActivities.map(item => item.weight);
        const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);
        const normalizedWeights = totalWeight > 0 ? rawWeights.map(weight => (weight / totalWeight) * 100) : [];

        // Extract data using display names from lookup map
        let labels: string[] = [];
        labels = sortedActivities.map(item => this.activitiesDisplayNames.get(item.id) || `Activity ${item.id}`);
        const scores = sortedActivities.map(item =>
          this.isScoreVisualization ? (item.score ?? 0) : item.index * 100
        );
        const scoreNames = sortedActivities.map(item =>
          this.isScoreVisualization
            ? `${((item.score ?? 0) / 60).toFixed(1)} ${this.translate.instant('LEGEND.MINUTES')}`
            : this.indexService.getIndexName(item.index)
        );
        const scoreColors = scores.map(value => this.getColorForValue(value));

        // Create chart data
        this.subactivitiesChartData = {
          labels: labels,
          datasets: [
            {
              label: 'Subaktivitäten',
              data: normalizedWeights,
              backgroundColor: scoreColors,
              borderColor: scoreColors,
              borderWidth: 1,
              yAxisID: 'y',
              barPercentage: 0.8
            }
          ]
        };
      },
      error: (error) => {
        console.error('Error loading activities:', error);
        this.subactivitiesLoading = false; // Clear loading state on error
        this.subactivitiesChartData = {
          labels: [],
          datasets: [{
            label: 'Subaktivitäten',
            data: [],
            backgroundColor: [],
            borderColor: [],
            borderWidth: 1,
            yAxisID: 'y',
            barPercentage: 0.8
          }]
        };
      }
    });

    this.subBarChartOptions = {
      indexAxis: 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context: any) => {
              const index = context.dataIndex;
              const dataset = context.dataset;
              const data = dataset.data;
              return [
                `Weight: ${data[index].toFixed(1)}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#495057',
          },
          grid: {
            color: '#ebedef'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          beginAtZero: true,
          ticks: {
            color: '#495057'
          },
          grid: {
            color: '#ebedef'
          },
          title: {
            display: true,
            text: 'Gewichtung (%)'
          }
        }
      }
    };
  }


  onDataSelect(event: any) {
    const index = event.element.index;
    if (index !== undefined && index >= 0) {
      const categoryData = this.activitiesChartData.labels[index];

      // Get the sorted categories (same order as chart data)
      const sortedData = [...this.categories].sort((a, b) => {
        if (this.sortBy === 'weight') {
          return b.weight - a.weight;  // Sort by weight in descending order
        } else {
          return b.index - a.index;    // Sort by score in descending order
        }
      });

      // Use the index to get the correct category from the sorted array
      const category = sortedData[index];
      if (!category) return;

      this.hoveredCategoryId = category.id;
      // Use the full category name for the dialog header
      this.hoveredCategoryName = this.categoriesDisplayNames.get(category.id) || `Category ${category.id}`;

      // Set loading state and immediately clear subactivities chart data to prevent showing old values
      this.subactivitiesLoading = true;
      this.subactivitiesChartData = {
        labels: [],
        datasets: [{
          label: 'Subaktivitäten',
          data: [],
          backgroundColor: [],
          borderColor: [],
          borderWidth: 1,
          yAxisID: 'y',
          barPercentage: 0.8
        }]
      };

      // Check if category has only one activity - if so, show map directly
      this.analyzeService.getActivities(category.id).subscribe({
        next: (activities) => {
          if (activities && activities.length === 1) {
            // Category has only one activity - show map directly
            const activity = activities[0];
            const activityId = activity.id;

            // Set loading state and show both dialogs (parent needed for DOM structure)
            // The parent dialog will be shown but we'll immediately show the map dialog on top
            this.mapLoaded = false;
            this.showSubactivitiesPie = true; // Show parent dialog so map container is in DOM
            this.showSubactivitiesMap = true; // Show map dialog on top
            // Use the full activity name from the stored data
            this.hoveredSubactivityName = this.activitiesDisplayNames.get(activityId) || `Activity ${activityId}`;

            // Wait for dialogs to be rendered before initializing map
            // Need longer delay since we're rendering both parent and child dialogs
            setTimeout(() => {
              this.initializeMapWithRetry().then(() => {
                // Only fetch and add places after map is fully initialized
                this.analyzeService.getPlaces(activityId).subscribe((res: Place[]) => {
                  this.disablePlaces = res.length === 0;
                  this.addPlacesToMap(res);
                  this.zoomToPlaces(res);
                  this.mapLoaded = true;
                });
              }).catch((error) => {
                console.error("Failed to initialize map:", error);
                this.mapLoaded = true; // Set to true to hide loading indicator
              });
            }, 400);
          } else {
            // Category has multiple activities - show pie chart as before
            this.generateSubactivitiesPieData(category.id);
            this.showSubactivitiesPie = true;
            this.initializeSubActivitiesChart(category.id); // Update subactivities chart for the hovered category
          }
        },
        error: (error) => {
          console.error('Error loading activities:', error);
          // On error, fall back to showing pie chart
          this.generateSubactivitiesPieData(category.id);
          this.showSubactivitiesPie = true;
          this.initializeSubActivitiesChart(category.id);
        }
      });
    }
  }


  onSelectSubactivity(event: any) {
    const index = event.element.index;
    if (index !== undefined && index >= 0) {
      const subactivityData = this.subactivitiesChartData.labels[index];
      // Get the activity ID from the pie chart data
      const activityId = this.subactivitiesPieData.activityIds[index];

      // Set loading state and show map dialog
      this.mapLoaded = false;
      this.showSubactivitiesMap = true;
      // Use the full activity name from the stored data
      this.hoveredSubactivityName = this.subactivitiesPieData.fullNames ?
        this.subactivitiesPieData.fullNames[index] : subactivityData;

      // Wait for dialog to be rendered before initializing map
      setTimeout(() => {
        this.initializeMapWithRetry().then(() => {
          // Only fetch and add places after map is fully initialized
          this.analyzeService.getPlaces(activityId).subscribe((res: Place[]) => {
            this.disablePlaces = res.length === 0;
            this.addPlacesToMap(res);
            this.zoomToPlaces(res);
            this.mapLoaded = true;
          });
        }).catch((error) => {
          console.error("Failed to initialize map:", error);
          this.mapLoaded = true; // Set to true to hide loading indicator
        });
      }, 200);
    }
  }

  private initializeMapWithRetry(maxRetries: number = 5, retryDelay: number = 100): Promise<void> {
    return new Promise((resolve, reject) => {
      let retryCount = 0;

      const tryInitializeMap = () => {
        const mapElement = document.getElementById('places-map');
        if (mapElement) {
          this.initializeMap();
          // Wait a bit more to ensure map is fully rendered
          setTimeout(() => {
            resolve();
          }, 100);
        } else if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Map element not found, retrying in ${retryDelay}ms (attempt ${retryCount}/${maxRetries})`);
          setTimeout(tryInitializeMap, retryDelay);
        } else {
          console.error("Map container not found after maximum retries");
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to initialize map. Please try again.',
            life: 5000
          });
          reject(new Error("Map container not found after maximum retries"));
        }
      };

      tryInitializeMap();
    });
  }

  private createRadarChartData(
    labels: string[],
    data: number[],
    scoreNames: string[],
    datasetLabel: string,
    isZoomed: boolean = false
  ): { chartData: any, chartOptions: any } {
    // Handle empty arrays
    if (!data || data.length === 0 || !labels || labels.length === 0) {
      return {
        chartData: {
          labels: [],
          datasets: [{
            label: datasetLabel,
            data: [],
            backgroundColor: 'rgba(0, 0, 0, 0.0)',
            borderColor: "#ffffff",
            borderWidth: 3,
            pointBackgroundColor: [],
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: [],
            pointHoverBorderWidth: 3,
            fill: false
          }]
        },
        chartOptions: this.radarChartOptions
      };
    }

    const borderColors = data.map(value => this.getColorForValue(value * 100));

    // Basis-Datensatz für die Hintergrundfarben (inverted)
    const baseDatasets = [
      {
        label: '',
        data: labels.map(() => 1.41), // Fills from 1.41 to 2.0
        backgroundColor: 'rgba(150, 86, 162, 0.5)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: 'start' // Fill to the next dataset (E)
      },
      {
        label: '',
        data: labels.map(() => 1.0), // Fills from 1.0 to 1.41
        backgroundColor: 'rgba(194, 24, 7, 0.5)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: '+1' // Fill to the next dataset (D)
      },
      {
        label: '',
        data: labels.map(() => 0.72), // Fills from 0.72 to 1.0
        backgroundColor: 'rgba(237, 112, 20, 0.5)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: '+1' // Fill to the next dataset (C)
      },
      {
        label: '',
        data: labels.map(() => 0.5), // Fills from 0.51 to 0.72
        backgroundColor: 'rgba(238, 210, 2, 0.5)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: '+1' // Fill to the next dataset (B)
      },
      {
        label: '',
        data: labels.map(() => 0.35), // Fills from 0.35 to 0.51
        backgroundColor: 'rgba(60, 176, 67, 0.5)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: '+1' // Fill to the next dataset (A)
      },
      {
        label: '',
        data: labels.map(() => 0.35), // Fills from 0 to 0.35
        backgroundColor: 'rgba(50, 97, 45, 0.5)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: 'origin' // Fill to the origin (0)
      }
    ];

    const chartData = {
      labels: labels,
      datasets: [
        {
          label: datasetLabel,
          data: data,
          backgroundColor: 'rgba(0, 0, 0, 0.0)',
          borderColor: "#ffffff",
          borderWidth: isZoomed ? 4 : 3,
          pointBackgroundColor: borderColors,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: isZoomed ? 6 : 4,
          pointHoverRadius: isZoomed ? 8 : 6,
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: borderColors,
          pointHoverBorderWidth: 3,
          fill: false
        },
        ...baseDatasets.reverse()
      ]
    };

    // Calculate dynamic scale for zoomed view
    let scaleConfig: any;
    if (isZoomed && data.length > 0) {
      const minValue = Math.min(...data);
      const maxValue = Math.max(...data);
      const range = maxValue - minValue;
      const padding = Math.max(range * 0.1, 0.05); // 10% padding or minimum 0.05

      scaleConfig = {
        beginAtZero: false,
        min: Math.max(0, minValue - padding),
        max: Math.min(1.41, maxValue + padding),
        ticks: {
          stepSize: Math.max(0.05, range / 8), // Adaptive step size
          color: '#495057',
          callback: function (value: number) {
            return value.toFixed(2);
          }
        },
        grid: {
          color: '#ebedef'
        },
        pointLabels: {
          color: '#495057',
          font: {
            size: 12
          }
        }
      };
    } else {
      scaleConfig = {
        beginAtZero: true,
        max: 1.41,
        min: 0,
        ticks: {
          stepSize: 0.2,
          color: '#495057'
        },
        grid: {
          color: '#ebedef'
        },
        pointLabels: {
          color: '#495057',
          font: {
            size: 12
          }
        }
      };
    }

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context: any) => {
              // Only show tooltip for datasets that have a label (actual data points)
              if (context.dataset.label) {
                const index = context.dataIndex;
                return [
                  `Score: ${scoreNames[index]}`,
                  `Value: ${data[index].toFixed(3)}`
                ];
              }
              return null; // Hide background datasets from tooltip
            }
          }
        },
        // Custom plugin to add value labels on data points
        afterDraw: (chart: any) => {
          const ctx = chart.ctx;
          const meta = chart.getDatasetMeta(chart.data.datasets.length - 1); // Get the main data dataset

          if (meta && meta.data) {
            meta.data.forEach((element: any, index: number) => {
              if (element && element.x !== undefined && element.y !== undefined) {
                const value = data[index];
                const label = value.toFixed(2);

                ctx.save();
                ctx.fillStyle = '#333333';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                // Position label above the point
                const labelY = element.y - 15;
                ctx.fillText(label, element.x, labelY);
                ctx.restore();
              }
            });
          }
        }
      },
      scales: {
        r: scaleConfig
      }
    };

    return { chartData, chartOptions };
  }

  private initializePersonaChart(): void {
    if (!this.personas || this.personas.length === 0) {
      this.showPersona = false;
      // Set empty chart data when no personas
      this.personaChartData = {
        labels: [],
        datasets: [{
          label: 'Persona-Werte',
          data: [],
          backgroundColor: 'rgba(0, 0, 0, 0.0)',
          borderColor: "#ffffff",
          borderWidth: 3,
          pointBackgroundColor: [],
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: [],
          pointHoverBorderWidth: 3,
          fill: false
        }]
      };
      this.personaLoading = false;
      return;
    }

    this.showPersona = true;

    // Sort personas by their index scores (descending)
    const sortedPersonas = [...this.personas].sort((a, b) => b.index - a.index);

    // Extract data using display names from lookup map
    let labels: string[] = [];
    labels = sortedPersonas.map(persona => this.personasDisplayNames.get(persona.id) || `Persona ${persona.id}`);
    const data = sortedPersonas.map(persona => persona.index);
    const scoreNames = sortedPersonas.map(persona => this.indexService.getIndexName(persona.index));

    const { chartData, chartOptions } = this.createRadarChartData(labels, data, scoreNames, 'Persona-Werte', this.personaChartZoomed);
    this.personaChartData = chartData;
    this.radarChartOptions = chartOptions;

    this.personaLoading = false; // Clear loading state when chart is ready
  }

  private initializeProfilesChart(): void {
    if (!this.profiles || this.profiles.length === 0) {
      // Set empty chart data when no profiles
      this.profilesChartData = {
        labels: [],
        datasets: []
      };
      this.profileLegendData = [];
      this.profilesLoading = false;
      return;
    }

    // Sort profiles by their index scores (descending)
    const sortedProfiles = [...this.profiles].sort((a, b) => b.index - a.index);

    // Extract data using display names from lookup map
    let labels: string[] = [];
    labels = sortedProfiles.map(profile => this.profilesDisplayNames.get(profile.id) || `Profile ${profile.id}`);
    const data = sortedProfiles.map(profile => profile.index);
    const scoreNames = sortedProfiles.map(profile => this.indexService.getIndexName(profile.index));

    // Create combo chart with exponential function and horizontal bars
    const profileMap = new Map(this.profiles.map(p => [p.id, this.profilesDisplayNames.get(p.id) || `Profile ${p.id}`]));
    this.createProfilesComboChart(sortedProfiles, profileMap, scoreNames);

    this.profilesLoading = false; // Clear loading state when chart is ready
  }

  private createProfilesComboChart(profiles: any[], profileMap: Map<number, string>, scoreNames: string[]): void {
    // Handle empty profiles array
    if (!profiles || profiles.length === 0) {
      this.profilesChartData = {
        labels: [],
        datasets: []
      };
      this.profileLegendData = [];
      return;
    }

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

    // Create datasets for the combo chart
    const datasets: any[] = [];

    // Create a single continuous exponential line with colored segments
    // We'll create multiple overlapping line segments to achieve the colored effect
    gradeRanges.forEach((grade, index) => {
      const segmentData = [...exponentialData]; // Copy all exponential data

      // Find the range of x-values that should be included for this grade
      let startX = -1;
      let endX = -1;

      // Find the first x where y >= grade.min
      if (index === 0) {
        // For the first grade (A), start from x=0
        startX = 0;
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
      if (index === gradeRanges.length - 1) {
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

      // Set points outside the calculated range to null
      segmentData.forEach((yValue, xIndex) => {
        const x = xIndex + 1;
        if (x < startX || x > endX) {
          (segmentData as any[])[xIndex] = null;
        }
      });

      datasets.push({
        type: 'line',
        label: '', // Hide grade line labels
        borderColor: grade.color,
        borderWidth: 2,
        fill: false,
        tension: 0.4,
        data: segmentData.map((value, index) => ({ x: index + 1, y: value })),
        pointRadius: 0,
        pointHoverRadius: 0,
        spanGaps: false
      });
    });

    // Add points for each profile on the exponential line
    profiles.forEach((profile, index) => {
      const profileName = profileMap.get(profile.id) || `Profile ${profile.id}`;
      const profileColor = this.getProfileColor(profile.id);

      // Map score to x-position using inverse exponential function
      // Solve for x in the equation: profile.score = 0.2511169 * 1.122178^x
      // x = log(profile.score / 0.2511169) / log(1.122178)
      let xPosition: number;

      if (profile.index <= 0) {
        xPosition = 1; // Default to A+ for invalid scores
      } else {
        xPosition = Math.log(profile.index / 0.2511169) / Math.log(1.122178);

        // Clamp xPosition to valid range [1, 18]
        xPosition = Math.max(1, Math.min(18, xPosition));
      }

      // Create the data point using the calculated xPosition and the actual profile score
      const profilePoint = { x: xPosition, y: profile.index };

      datasets.push({
        type: 'scatter',
        label: profileName,
        backgroundColor: profileColor,
        borderColor: profileColor,
        data: [profilePoint],
        pointRadius: 8,
        pointHoverRadius: 10,
        pointBorderWidth: 2,
        pointStyle: 'rectRounded',
        pointBorderColor: 'white',
        showLine: false
      });
    });

    this.profilesChartData = {
      labels: xValues.map(x => gradeLevels[x - 1]),
      datasets: datasets
    };

    // Create legend data for profiles
    this.profileLegendData = profiles.map(profile => {
      const profileName = profileMap.get(profile.id) || `Profile ${profile.id}`;
      return {
        name: profileName,
        color: this.getProfileColor(profile.id)
      };
    });

    // Create combo chart options
    this.profilesBarChartOptions = {
      maintainAspectRatio: false,
      aspectRatio: 0.6,
      plugins: {
        tooltip: {
          mode: 'point',
          intersect: true,
          callbacks: {
            title: (context: any) => {
              const dataset = context[0].dataset;

              // Only show title for scatter plots (profiles), hide grade line tooltips
              if (dataset.type === 'scatter' && dataset.label) {
                return dataset.label; // Show profile name as title
              }
              return null;
            },
            label: (context: any) => {
              const dataset = context.dataset;

              // Only show tooltip for scatter plots (profiles), hide grade line tooltips
              if (dataset.type === 'scatter' && dataset.label) {
                return dataset.label; // Show only the profile name
              }
              return null;
            }
          }
        },
        legend: {
          display: false
        },
        // Custom plugin to draw profile names
        afterDraw: (chart: any) => {
          const ctx = chart.ctx;
          const profiles = chart.data.datasets.filter((dataset: any) => dataset.type === 'scatter');

          profiles.forEach((dataset: any) => {
            const meta = chart.getDatasetMeta(chart.data.datasets.indexOf(dataset));

            meta.data.forEach((element: any, index: number) => {
              if (element && element.x !== undefined && element.y !== undefined) {
                const x = element.x;
                const y = element.y - 15; // Position above the point

                ctx.save();
                ctx.fillStyle = '#333333';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(dataset.label, x, y);
                ctx.restore();
              }
            });
          });
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0.5,
          max: 18.5,
          ticks: {
            color: '#495057',
            stepSize: 1,
            callback: function (value: number) {
              const gradeIndex = Math.round(value) - 1;
              return gradeIndex >= 0 && gradeIndex < gradeLevels.length ? gradeLevels[gradeIndex] : '';
            }
          },
          grid: {
            color: '#ebedef'
          }
        },
        y: {
          min: 0,
          max: 2,
          ticks: {
            display: true,
            color: '#495057',
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
            text: 'Index in %',
            color: '#495057',
            font: {
              size: 12,
              weight: 'bold'
            }
          }
        }
      },
      // Configure interaction modes for mixed chart types
      interaction: {
        mode: 'point',
        intersect: true
      }
    };
  }


  onCategoryLeave(): void {
    this.showSubactivitiesPie = false;
    this.hoveredCategoryId = null;
    this.hoveredCategoryName = '';
    this.subactivitiesLoading = false; // Clear loading state

    // Immediately clear subactivities chart data
    this.subactivitiesChartData = {
      labels: [],
      datasets: [{
        label: 'Subaktivitäten',
        data: [],
        backgroundColor: [],
        borderColor: [],
        borderWidth: 1,
        yAxisID: 'y',
        barPercentage: 0.8
      }]
    };

    // Clear pie chart data to prevent stale data from persisting
    this.subactivitiesPieData = null;

    this.initializeSubActivitiesChart(); // Reset subactivities chart when leaving
  }

  onSubactivityLeave(): void {
    this.showSubactivitiesMap = false;
    this.hoveredSubactivityName = '';

    // If pie chart data is not set, we came directly from category click (single activity)
    // In this case, also close the parent dialog
    if (!this.subactivitiesPieData || !this.subactivitiesPieData.labels || this.subactivitiesPieData.labels.length === 0) {
      this.showSubactivitiesPie = false;
      this.hoveredCategoryId = null;
      this.hoveredCategoryName = '';
    }

    // Clean up map when dialog is closed
    if (this.map) {
      try {
        if (this.overlay) {
          this.map.removeOverlay(this.overlay);
        }
        if (this.tooltipOverlay) {
          this.map.removeOverlay(this.tooltipOverlay);
        }
        this.map.dispose();
        this.map = undefined;
        this.placesLayer = undefined;
        this.centerLayer = undefined;
        this.shapeLayer = undefined;
        this.tooltipElement = undefined;
        this.tooltipOverlay = undefined;
      } catch (error) {
        console.error("Error cleaning up map:", error);
      }
    }
  }

  private generateSubactivitiesPieData(categoryId: number): void {
    // Get activities for the selected category
    this.analyzeService.getActivities(categoryId).subscribe({
      next: (activities) => {
        if (!activities || activities.length === 0) {
          this.showSubactivitiesPie = false;
          this.subactivitiesPieData = {
            labels: [],
            datasets: [{
              data: [],
              backgroundColor: [],
              borderColor: '#ffffff',
              borderWidth: 2,
            }],
            activityIds: [],
            fullNames: []
          };
          return;
        }

        // Sort activities by weight descending
        const sortedActivities = [...activities].sort((a, b) => b.weight - a.weight);

        // Normalize weights to percentages
        const rawWeights = sortedActivities.map(item => item.weight);
        const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);
        const normalizedWeights = totalWeight > 0 ? rawWeights.map(weight => (weight / totalWeight) * 100) : [];

        // Create labels with activity name using display names from lookup map
        let labels: string[] = [];
        labels = sortedActivities.map(item => this.activitiesDisplayNames.get(item.id) || `Activity ${item.id}`);

        // Truncate labels longer than 30 characters
        labels = labels.map(label => {
          if (label && label.length > 30) {
            return label.substring(0, 27) + '...';
          }
          return label;
        });

        const pieColors = sortedActivities.map(item =>
          this.isScoreVisualization ? this.getColorForValue(item.score ?? 0) : this.getColorForValue(item.index * 100)
        );

        this.subactivitiesPieData = {
          labels: labels,
          datasets: [{
            data: normalizedWeights,
            backgroundColor: pieColors,
            borderColor: '#ffffff',
            borderWidth: 2,
          }]
        };

        // Store the pie data with IDs and full names for later use
        this.subactivitiesPieData.activityIds = sortedActivities.map(item => item.id);
        this.subactivitiesPieData.fullNames = sortedActivities.map(item =>
          this.activitiesDisplayNames.get(item.id) || `Activity ${item.id}`
        );
      },
      error: (error) => {
        console.error('Error loading activities for pie chart:', error);
        this.showSubactivitiesPie = false;
      }
    });
  }

  ngOnDestroy() {
    if (this.subscriptions) {
      this.subscriptions.forEach(subscription => subscription.unsubscribe());
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
  }

  hide() {
    this.analyzeService.hide();
  }

  onDialogHide(): void {
    this.resetScores();
  }

  private resetScores(): void {
    // Reset all score-related data
    this.profiles = [];
    this.personas = [];
    this.categories = [];

    // Reset display name maps
    this.categoriesDisplayNames.clear();
    this.activitiesDisplayNames.clear();
    this.personasDisplayNames.clear();
    this.profilesDisplayNames.clear();

    // Reset chart data
    this.personaChartData = null;
    this.activitiesChartData = null;
    this.profilesChartData = null;
    this.subactivitiesChartData = null;
    this.subactivitiesPieData = null;

    // Reset UI state
    this.showPersona = true;
    this.activeTab = 'activities';
    this.personaChartZoomed = false;
    this.showSubactivitiesMap = false;
    this.showSubactivitiesPie = false;
    this.hoveredSubactivityName = '';
    this.hoveredCategoryId = null;
    this.hoveredCategoryName = '';
    this.activitiesLoading = false;
    this.personaLoading = false;
    this.profilesLoading = false;
    this.subactivitiesLoading = false;
    this.mapLoaded = false;
    this.noPlaces = false;
    this.disablePlaces = false;
    this.profileLegendData = [];

    // Reset current score
    this.currentScore = 0;
    this.currentScoreColor = '';

    // Reset feature and properties
    this.feature = undefined;
    this.properties = undefined;
  }

  onDialogShow(): void {
    // Resize charts when dialog becomes visible
    setTimeout(() => {
      this.resizeCharts();
    }, 200);
  }


  toggleActivitiesChartType(): void {
    this.activitiesLoading = true;
    this.initializeActivitiesChart();
    setTimeout(() => {
      this.resizeCharts();
    }, 100);
  }

  toggleSort(): void {
    this.sortBy = this.sortBy === 'score' ? 'weight' : 'score';
    this.activitiesLoading = true;
    this.initializeActivitiesChart();
    // Regenerate subactivities pie chart if currently showing
    if (this.showSubactivitiesPie && this.hoveredCategoryId) {
      this.generateSubactivitiesPieData(this.hoveredCategoryId);
    }
    setTimeout(() => {
      this.resizeCharts();
    }, 100);
  }

  togglePersonaChartZoom(): void {
    this.personaChartZoomed = !this.personaChartZoomed;
    this.personaLoading = true;
    this.initializePersonaChart();
    setTimeout(() => {
      this.resizeCharts();
    }, 100);
  }

  ngAfterViewInit() {
    // isShare is now handled by subscription in constructor
    this.setupResizeObserver();
  }

  private setupResizeObserver(): void {
    if (this.dialogContainer?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => {
        // Debounce resize events
        if (this.resizeTimeout) {
          clearTimeout(this.resizeTimeout);
        }
        this.resizeTimeout = setTimeout(() => {
          this.resizeCharts();
        }, 100);
      });

      this.resizeObserver.observe(this.dialogContainer.nativeElement);
    }
  }

  private resizeCharts(): void {
    // Force chart resize after a small delay to ensure DOM is ready
    setTimeout(() => {
      if (this.activitiesChart?.chart) {
        this.activitiesChart.chart.resize();
      }
      if (this.personaChart?.chart) {
        this.personaChart.chart.resize();
      }
      if (this.profilesChart?.chart) {
        this.profilesChart.chart.resize();
      }
      if (this.subactivitiesPieChart?.chart) {
        this.subactivitiesPieChart.chart.resize();
      }
    }, 50);
  }

  onTabChange(event: any): void {
    this.activeTab = event.value;
    // Resize charts when switching tabs
    setTimeout(() => {
      this.resizeCharts();
    }, 100);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    // Resize charts when window is resized
    setTimeout(() => {
      this.resizeCharts();
    }, 100);
  }


  private initializeMap() {
    try {
      // Clean up existing map if it exists
      if (this.map) {
        if (this.overlay) {
          this.map.removeOverlay(this.overlay);
        }
        if (this.tooltipOverlay) {
          this.map.removeOverlay(this.tooltipOverlay);
        }
        this.map.dispose();
        this.map = undefined;
      }

      const mapElement = document.getElementById('places-map');
      if (!mapElement) {
        console.error("Map container not found");
        return;
      }

      // Ensure the map container has proper dimensions
      if (mapElement.offsetWidth === 0 || mapElement.offsetHeight === 0) {
        console.warn("Map container has zero dimensions, waiting for layout...");
        setTimeout(() => this.initializeMap(), 100);
        return;
      }

      // Create tooltip element
      this.tooltipElement = document.createElement('div');
      this.tooltipElement.className = 'tooltip';
      this.tooltipElement.style.cssText = `
        position: absolute;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        pointer-events: none;
        z-index: 1000;
        display: none;
        max-width: 200px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `;

      // Create tooltip overlay
      this.tooltipOverlay = new Overlay({
        element: this.tooltipElement,
        offset: [10, 0],
        positioning: 'bottom-left'
      });

      const baseLayer = new TileLayer({
        source: new XYZ({
          url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          crossOrigin: 'anonymous'
        })
      });

      // Create shape layer for the clicked feature
      this.shapeLayer = new VectorLayer({
        source: new VectorSource(),
        style: new Style({
          fill: new Fill({
            color: 'rgba(76, 175, 80, 0.2)' // Semi-transparent green
          }),
          stroke: new Stroke({
            color: '#4CAF50',
            width: 2
          })
        })
      });

      // Create places vector layer
      this.placesLayer = new VectorLayer({
        source: new VectorSource(),
        style: new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({
              color: '#482683'  // CI primary purple
            }),
            stroke: new Stroke({
              color: '#ffffff',
              width: 2
            })
          })
        })
      });

      // Create center point layer
      this.centerLayer = new VectorLayer({
        source: new VectorSource(),
        style: new Style({
          image: new CircleStyle({
            radius: 8,
            fill: new Fill({
              color: '#4CAF50' // A green color for the center point
            }),
            stroke: new Stroke({
              color: '#ffffff',
              width: 3
            })
          })
        })
      });

      this.map = new OlMap({
        target: 'places-map',
        layers: [baseLayer, this.shapeLayer, this.placesLayer, this.centerLayer],
        view: new View({
          center: fromLonLat([49.320099, 9.2156505]),
          zoom: 10,
          enableRotation: false
        }),
        overlays: [this.tooltipOverlay]
      });

      const coordinates = this.analyzeService.getCoordinates();
      if (coordinates) {
        this.map.getView().setCenter(fromLonLat([coordinates![0], coordinates![1]]));
      }

      // Load the shape data for the clicked feature
      this.loadShapeData();

      // Add hover event handlers
      this.map.on('pointermove', (event) => {
        if (event.dragging) {
          this.tooltipElement!.style.display = 'none';
          return;
        }

        // Check for features in both places and center layers
        let foundFeature: any = null;

        // Use forEachFeatureAtPixel to find any feature at the pixel
        this.map?.forEachFeatureAtPixel(event.pixel, (feature) => {
          foundFeature = feature;
          return true; // Stop iteration at first feature found
        });

        // Change cursor style based on whether we're hovering over a place (not center point)
        if (this.map) {
          const mapViewport = this.map.getViewport();
          if (foundFeature && foundFeature.get('id') !== 'center') {
            // Hovering over a place - show pointer cursor
            mapViewport.style.cursor = 'pointer';
          } else {
            // Not hovering over a place - show default cursor
            mapViewport.style.cursor = '';
          }
        }

        if (foundFeature) {
          const name = foundFeature.get('name');
          const rating = foundFeature.get('rating');
          const activity = foundFeature.get('activity');

          if (name) {
            this.tooltipElement!.style.display = '';
            this.tooltipElement!.innerHTML = `
              <div><strong>${name} ${activity ? `<div>(${activity})</div>` : ''}</strong></div>
            `;
            this.tooltipOverlay!.setPosition(event.coordinate);
          } else {
            this.tooltipElement!.style.display = 'none';
          }
        } else {
          this.tooltipElement!.style.display = 'none';
        }
      });

      // Add click event handler
      this.map.on('click', (event) => {
        // Check for features in places layer only (not center layer)
        let clickedFeature: any = null;

        this.map?.forEachFeatureAtPixel(event.pixel, (feature) => {
          // Only handle clicks on places (not center point)
          if (feature.get('id') !== 'center') {
            clickedFeature = feature;
            return true; // Stop iteration at first feature found
          }
          return false; // Continue iteration
        });

        if (clickedFeature) {
          const uri = clickedFeature.get('uri');
          if (uri) {
            // Open URL in new tab
            window.open(uri, '_blank');
          }
        }
      });
    } catch (error) {
      console.error("Error initializing map:", error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to initialize map: ' + error,
        life: 5000
      });
    }
  }

  private loadShapeData(): void {
    if (!this.feature || !this.shapeLayer) return;

    const featureId = this.feature.properties?.['id'];
    const resolution = this.analyzeService.getCurrentState().mapType;

    if (!featureId || !resolution) {
      console.warn('Missing feature ID or resolution for shape loading');
      return;
    }

    this.analyzeService.getShape(featureId, resolution).subscribe({
      next: (shapeData) => {
        let shape = JSON.parse(shapeData);
        if (shape && shape.type === 'MultiPolygon') {
          // Create a feature from the MultiPolygon geometry
          const feature = new MultiPolygon(shape.coordinates);

          this.shapeLayer?.getSource()?.addFeature(new Feature({
            geometry: feature
          }));
        }
      },
      error: (error) => {
        console.error('Error loading shape data:', error);
        this.messageService.add({
          severity: 'warn',
          summary: 'Warning',
          detail: 'Could not load feature shape',
          life: 3000
        });
      }
    });
  }

  private addPlacesToMap(places: Place[]) {
    if (!this.map || !this.placesLayer || !this.centerLayer) {
      console.error("Map or layers not initialized.");
      return;
    }

    // Clear existing features from the layers
    this.placesLayer.getSource()?.clear();
    this.centerLayer.getSource()?.clear();

    // Handle empty places array
    if (!places || places.length === 0) {
      return;
    }

    // Add new features to the places layer
    places.forEach(place => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([place.lon, place.lat])),
        name: place.name,
        id: place.id,
        rating: place.rating,
        activity: place.activity,
        uri: place.uri // Add uri property
      });
      this.placesLayer?.getSource()?.addFeature(feature);
    });
  }

  private zoomToPlaces(places: Place[]) {
    if (!this.map) {
      console.error("Map not initialized");
      return;
    }

    // Get center coordinates
    const coordinates = this.analyzeService.getCoordinates();

    if (!places || places.length === 0) {
      this.noPlaces = true;
      // Still set the map view to the feature center for the OSM link
      if (coordinates) {
        const centerCoordinate = fromLonLat([coordinates[0], coordinates[1]]);
        this.map.getView().setCenter(centerCoordinate);
        // Set a reasonable zoom level (e.g., 15 for a detailed view)
        this.map.getView().setZoom(15);
      }
      return;
    } else {
      this.noPlaces = false;
    }

    // Create extent from place coordinates and center point
    const placeCoordinates = places.map(place => fromLonLat([place.lon, place.lat]));
    const centerCoordinate = coordinates ? fromLonLat([coordinates[0], coordinates[1]]) : null;

    // Combine all coordinates for extent calculation
    const allCoordinates = centerCoordinate
      ? [...placeCoordinates, centerCoordinate]
      : placeCoordinates;

    if (allCoordinates.length > 0) {
      // Calculate the extent that includes all coordinates
      let extent: [number, number, number, number] | null = null;

      for (const coord of allCoordinates) {
        if (!extent) {
          extent = [coord[0], coord[1], coord[0], coord[1]];
        } else {
          extent = [
            Math.min(extent[0], coord[0]),
            Math.min(extent[1], coord[1]),
            Math.max(extent[2], coord[0]),
            Math.max(extent[3], coord[1])
          ];
        }
      }

      if (extent) {
        // Add some padding to the extent
        const padding = 0.01; // Adjust this value to control the padding
        const paddedExtent: [number, number, number, number] = [
          extent[0] - padding,
          extent[1] - padding,
          extent[2] + padding,
          extent[3] + padding
        ];

        // Fit the map view to the extent
        this.map.getView().fit(paddedExtent, {
          duration: 1000, // Animation duration in milliseconds
          padding: [20, 20, 20, 20] // Additional padding in pixels
        });
      }
    }
  }

  /**
   * Generates an OpenStreetMap editor link with the current map view
   * @returns OSM iD editor URL with current map center and zoom, or null if map is not available
   */
  getOsmLink(): string | null {
    if (!this.map) {
      return null;
    }

    try {
      const view = this.map.getView();
      const center = view.getCenter();
      const zoom = view.getZoom();

      if (!center || zoom === undefined) {
        return null;
      }

      // Convert from OpenLayers projection (EPSG:3857) to lon/lat (EPSG:4326)
      const [lon, lat] = toLonLat(center);

      // Generate OSM iD editor link with current map view
      // Format: https://www.openstreetmap.org/edit#map=ZOOM/LAT/LON
      return `https://www.openstreetmap.org/edit#map=${Math.round(zoom)}/${lat.toFixed(6)}/${lon.toFixed(6)}`;
    } catch (error) {
      console.error('Error generating OSM link:', error);
      return null;
    }
  }
}
