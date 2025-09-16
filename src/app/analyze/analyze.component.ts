import { Component, OnDestroy, ChangeDetectorRef, AfterViewInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { Subscription } from 'rxjs';
import { ProjectsService } from '../projects/projects.service';
import { AnalyzeService } from './analyze.service';
import { Place, Properties } from './analyze.interface';
import { ProjectDetails } from '../projects/project.interface';
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
import { fromLonLat } from 'ol/proj';
import Overlay from 'ol/Overlay';
import { Style, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style';
import { MultiPolygon } from 'ol/geom';
import { IndexService } from '../services/index.service';

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
  private subscriptions: Subscription[] = [];
  projectDetails: ProjectDetails | undefined;
  feature: MapGeoJSONFeature | undefined;
  properties: Properties | undefined;
  averageType: 'mean' | 'median' = 'mean';
  populationArea: 'pop' | 'area' = 'pop';
  currentScore: number = 0;
  currentScoreColor: string = '';
  weightingType: 'population' | 'area' = 'population';
  isAreaWeighting: boolean = false;
  sortBy: 'score' | 'weight' = 'weight';
  showPersona: boolean = true;
  activeTab: string = 'activities';
  personaChartZoomed: boolean = false;
  showActivityOverlay: boolean = false;
  selectedCategory: number | null = null;
  selectedCategoryName: string = '';
  showSubactivitiesMap: boolean = false;
  hoveredSubactivityName: string = '';
  mapLoaded: boolean = false;

  // Subactivities pie chart properties
  showSubactivitiesPie: boolean = false;
  subactivitiesPieData: any;
  subactivitiesPieOptions: any;
  hoveredCategoryId: number | null = null;
  hoveredCategoryName: string = '';
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

  hasPersonaData(): boolean {
    if (!this.projectDetails) return false;
    if (!this.projectDetails.hexagons || this.projectDetails.hexagons.length === 0) return false;
    return true;
  }

  hasActivityData(): boolean {
    if (!this.projectDetails) return false;
    if (!this.projectDetails.hexagons || this.projectDetails.hexagons.length === 0) return false;
    return true;
  }

  hasModeData(): boolean {
    return this.projectDetails?.hexagons?.some(hexagon =>
      hexagon.profile_scores && hexagon.profile_scores.length > 0
    ) || false;
  }

  hasProfileData(): boolean {
    return this.projectDetails?.hexagons?.some(hexagon =>
      hexagon.profile_scores && hexagon.profile_scores.length > 0
    ) || false;
  }

  constructor(
    private analyzeService: AnalyzeService,
    private projectsService: ProjectsService,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService,
    private indexService: IndexService
  ) {
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
            if (state.projectId && state.mapType && state.feature) {
              this.loading = true;
              this.projectsService.getProjectDetails(state.projectId, state.mapType, state.feature.properties['id'])
                .subscribe({
                  next: (details) => {
                    if (details.error) {
                      this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: details.error,
                        life: 5000
                      });
                    }
                    this.projectDetails = details;
                    this.initializeChartData();
                    setTimeout(() => {
                      this.resizeCharts();
                    }, 100);

                  },
                  error: (error) => {
                    console.error('Error loading project details:', error);
                    this.loading = false;
                  }
                });
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

  private initializeChartData(): void {
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
    if (value > 141) return '#9656a2';      // Lila (F)
    if (value > 100) return '#c21807';      // Rot (E)
    if (value > 72) return '#ed7014';      // Orange (D)
    if (value > 51) return '#eed202';      // Gelb (C)
    if (value > 35) return '#3cb043';      // Hellgrün (B)
    if (value > 0) return '#32612d';       // Dunkelgrün (A)
    return '#9656a2';                     // Lila (F)
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

  private initializeActivitiesChart(): void {
    if (!this.projectDetails?.hexagons || this.projectDetails.hexagons.length === 0) return;

    // Calculate weighted averages for each category
    const categoryScores = new Map<number, { totalWeightedScore: number, totalWeight: number, id: number }>();

    // Sum up weighted scores and weights for each category
    this.projectDetails.hexagons.forEach(hexagon => {
      const weight = this.weightingType === 'population' ? hexagon.population : 1;
      hexagon.category_scores.forEach(categoryScore => {
        const current = categoryScores.get(categoryScore.category) || { totalWeightedScore: 0, totalWeight: 0, id: categoryScore.category };
        current.totalWeightedScore += categoryScore.score * weight;
        current.totalWeight += weight;
        categoryScores.set(categoryScore.category, current);
      });
    });

    // Calculate final weighted averages
    const weightedCategoryScores = Array.from(categoryScores.entries()).map(([category, data]) => ({
      category,
      score: data.totalWeightedScore / data.totalWeight
    }));

    // Get category names and weights from formatted_categories
    const categoryMap = new Map(this.projectDetails.categories.map(cat => [cat.id, { name: cat.name, weight: cat.weight }]));

    // Create array with all necessary data
    const categoryData = weightedCategoryScores
      .map(category => ({
        name: categoryMap.get(category.category)?.name || `${category.category}`,
        score: category.score,
        weight: categoryMap.get(category.category)?.weight || 1
      }));

    // Sort based on current sort type
    const sortedData = [...categoryData].sort((a, b) => {
      if (this.sortBy === 'weight') {
        return b.weight - a.weight;  // Sort by weight in descending order
      } else {
        return b.score - a.score;    // Sort by score in descending order
      }
    });

    // Extract sorted arrays
    const labels = sortedData.map(item => item.name);
    const scores = sortedData.map(item => item.score * 100);
    const weights = sortedData.map(item => item.weight);
    const scoreNames = sortedData.map(item => this.indexService.getIndexName(item.score));


    const scoreColors = scores.map(value => this.getColorForValue(value));

    this.activitiesChartData = {
      labels: labels,
      datasets: [
        {
          label: 'Aktivitäten',
          data: weights,
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
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context: any) => {
              const index = context.dataIndex;
              return [
                `Note: ${scoreNames[index]}`,
                `Weight: ${weights[index]}`
              ];
            }
          }
        },
        legend: {
          position: 'bottom',
          labels: {
            generateLabels: this.generateLabels,
            usePointStyle: false,
            padding: 15
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#495057'
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
            text: 'Gewichtung'
          }
        }
      }
    };
  }

  private initializeSubActivitiesChart(categoryId?: number): void {
    if (!this.projectDetails?.hexagons || this.projectDetails.hexagons.length === 0) return;

    // If no categoryId is provided, don't show any data
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
      return;
    }

    // Calculate weighted averages for subactivities of the specific category
    const subactivityScores = new Map<number, {
      name: string,
      id: number,
      totalWeightedScore: number,
      totalWeight: number,
      totalWeightedWeight: number
    }>();

    // Sum up weighted scores and weights for each subactivity in the specific category
    this.projectDetails.hexagons.forEach(hexagon => {
      const weight = this.weightingType === 'population' ? hexagon.population : 1;

      // Find the category score for this specific category
      const categoryScore = hexagon.category_scores.find(cs => cs.category === categoryId);
      if (categoryScore && categoryScore.activities) {
        categoryScore.activities.forEach(activity => {
          const current = subactivityScores.get(activity.activity) || {
            name: activity.activity_name,
            id: activity.activity,
            totalWeightedScore: 0,
            totalWeight: 0,
            totalWeightedWeight: 0
          };
          current.totalWeightedScore += activity.score * weight;
          current.totalWeightedWeight += activity.weight * weight;
          current.totalWeight += weight;
          subactivityScores.set(activity.activity, current);
        });
      }
    });

    // Calculate final weighted averages
    const weightedSubactivityScores = Array.from(subactivityScores.entries())
      .map(([activityId, data]) => ({
        id: activityId,
        name: data.name,
        score: data.totalWeightedScore / data.totalWeight,
        weight: data.totalWeightedWeight / data.totalWeight
      }))
      .sort((a, b) => b.weight - a.weight); // Sort by weight descending

    if (weightedSubactivityScores.length === 0) {
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

    // Normalize weights to percentages
    const rawWeights = weightedSubactivityScores.map(item => item.weight);
    const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);
    const normalizedWeights = rawWeights.map(weight => (weight / totalWeight) * 100);

    // Extract sorted arrays
    const scores = weightedSubactivityScores.map(item => item.score);
    const weights = normalizedWeights;

    // Create labels with activity name and percentage
    const labelsWithPercentages = weightedSubactivityScores.map((item, index) =>
      `${item.name}`
    );

    const scoreNames = weightedSubactivityScores.map(item => this.indexService.getIndexName(item.score));
    const scoreColors = scores.map(value => this.getColorForValue(value));

    // Create chart data
    this.subactivitiesChartData = {
      labels: labelsWithPercentages,
      datasets: [
        {
          label: 'Subaktivitäten',
          data: weights,
          backgroundColor: scoreColors,
          borderColor: scoreColors,
          borderWidth: 1,
          yAxisID: 'y',
          barPercentage: 0.8
        }
      ]
    };

    this.subBarChartOptions = {
      indexAxis: 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context: any) => {
              const index = context.dataIndex;
              return [
                `Score: ${scoreNames[index]}`,
                `Weight: ${weights[index].toFixed(1)}%`
              ];
            }
          }
        },
        legend: {
          position: 'bottom',
          labels: {
            generateLabels: this.generateLabels,
            usePointStyle: false,
            padding: 15
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#495057'
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
      // Find the category ID from the category name
      const category = this.projectDetails?.categories.find(cat => cat.name === categoryData);
      if (!category) return;

      this.hoveredCategoryId = category.id;
      this.hoveredCategoryName = categoryData;
      this.generateSubactivitiesPieData(category.id);
      this.showSubactivitiesPie = true;
      this.initializeSubActivitiesChart(category.id); // Update subactivities chart for the hovered category
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
      this.hoveredSubactivityName = subactivityData;

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
        legend: {
          position: 'bottom',
          labels: {
            generateLabels: this.generateLabels,
            usePointStyle: false,
            padding: 15
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
    if (!this.projectDetails?.hexagons || this.projectDetails.hexagons.length === 0 || !this.projectDetails.personas) return;

    // Calculate weighted averages for each persona
    const personaScores = new Map<number, { totalWeightedScore: number, totalWeight: number }>();

    // Sum up weighted scores and weights for each persona
    this.projectDetails.hexagons.forEach(hexagon => {
      const weight = this.weightingType === 'population' ? hexagon.population : 1;
      if (hexagon.persona_scores) {
        hexagon.persona_scores.forEach(personaScore => {
          const current = personaScores.get(personaScore.persona) || { totalWeightedScore: 0, totalWeight: 0 };
          current.totalWeightedScore += personaScore.score * weight;
          current.totalWeight += weight;
          personaScores.set(personaScore.persona, current);
        });
      }
    });
    if (personaScores.size === 0) {
      this.showPersona = false;
    } else {
      this.showPersona = true;
    }
    // Calculate final weighted averages
    const weightedPersonaScores = Array.from(personaScores.entries()).map(([persona, data]) => ({
      persona,
      score: data.totalWeightedScore / data.totalWeight
    }));

    // Sort personas by their weighted scores (descending)
    const sortedPersonas = weightedPersonaScores.sort((a, b) => b.score - a.score);

    // Get persona names from formatted_personas
    const personaMap = new Map(this.projectDetails.personas.map(p => [p.id, p.name]));
    const labels = sortedPersonas.map(persona => personaMap.get(persona.persona) || `${persona.persona}`);
    const data = sortedPersonas.map(persona => persona.score);
    const scoreNames = sortedPersonas.map(persona => this.indexService.getIndexName(persona.score));

    const { chartData, chartOptions } = this.createRadarChartData(labels, data, scoreNames, 'Persona-Werte', this.personaChartZoomed);
    this.personaChartData = chartData;
    this.radarChartOptions = chartOptions;
  }

  private initializeProfilesChart(): void {
    if (!this.projectDetails?.hexagons || this.projectDetails.hexagons.length === 0 || !this.projectDetails.profiles) return;

    // Calculate weighted averages for each profile
    const profileScores = new Map<number, { totalWeightedScore: number, totalWeight: number }>();

    // Sum up weighted scores and weights for each profile
    this.projectDetails.hexagons.forEach(hexagon => {
      const weight = this.weightingType === 'population' ? hexagon.population : 1;
      if (hexagon.profile_scores) {
        hexagon.profile_scores.forEach(profileScore => {
          const current = profileScores.get(profileScore.profile) || { totalWeightedScore: 0, totalWeight: 0 };
          current.totalWeightedScore += profileScore.score * weight;
          current.totalWeight += weight;
          profileScores.set(profileScore.profile, current);
        });
      }
    });

    if (profileScores.size === 0) {
      return;
    }

    // Calculate final weighted averages
    const weightedProfileScores = Array.from(profileScores.entries()).map(([profile, data]) => ({
      profile,
      score: data.totalWeightedScore / data.totalWeight
    }));

    // Sort profiles by their weighted scores (descending)
    const sortedProfiles = weightedProfileScores.sort((a, b) => b.score - a.score);

    // Get profile names from formatted_profiles
    const profileMap = new Map(this.projectDetails.profiles.map(p => [p.id, p.name]));
    const labels = sortedProfiles.map(profile => profileMap.get(profile.profile) || `${profile.profile}`);
    const data = sortedProfiles.map(profile => profile.score);
    const scoreNames = sortedProfiles.map(profile => this.indexService.getIndexName(profile.score));

    // Create combo chart with exponential function and horizontal bars
    this.createProfilesComboChart(sortedProfiles, profileMap, scoreNames);
  }

  private createProfilesComboChart(profiles: any[], profileMap: Map<number, string>, scoreNames: string[]): void {
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
      const profileName = profileMap.get(profile.profile) || `Profile ${profile.profile}`;
      const profileColor = this.getProfileColor(profile.profile);

      // Map score to x-position using inverse exponential function
      // Solve for x in the equation: profile.score = 0.2511169 * 1.122178^x
      // x = log(profile.score / 0.2511169) / log(1.122178)
      let xPosition: number;

      if (profile.score <= 0) {
        xPosition = 1; // Default to A+ for invalid scores
      } else {
        xPosition = Math.log(profile.score / 0.2511169) / Math.log(1.122178);

        // Clamp xPosition to valid range [1, 18]
        xPosition = Math.max(1, Math.min(18, xPosition));
      }

      // Create the data point using the calculated xPosition and the actual profile score
      const profilePoint = { x: xPosition, y: profile.score };

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
      const profileName = profileMap.get(profile.profile) || `Profile ${profile.profile}`;
      return {
        name: profileName,
        color: this.getProfileColor(profile.profile)
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
    this.initializeSubActivitiesChart(); // Reset subactivities chart when leaving
  }

  onSubactivityLeave(): void {
    this.showSubactivitiesMap = false;
    this.hoveredSubactivityName = '';

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
    if (!this.projectDetails?.hexagons) return;

    // Collect all activities for this category across all hexagons
    const activityScores = new Map<number, {
      name: string,
      id: number,
      totalWeightedScore: number,
      totalWeight: number,
      totalWeightedWeight: number
    }>();

    this.projectDetails.hexagons.forEach(hexagon => {
      const weight = this.weightingType === 'population' ? hexagon.population : 1;

      // Find the category score for this category
      const categoryScore = hexagon.category_scores.find(cs => cs.category === categoryId);
      if (categoryScore && categoryScore.activities) {
        categoryScore.activities.forEach(activity => {
          const current = activityScores.get(activity.activity) || {
            name: activity.activity_name,
            id: activity.activity,
            totalWeightedScore: 0,
            totalWeight: 0,
            totalWeightedWeight: 0
          };
          current.totalWeightedScore += activity.score * weight;
          current.totalWeightedWeight += activity.weight * weight;
          current.totalWeight += weight;
          activityScores.set(activity.activity, current);
        });
      }
    });

    // Calculate weighted averages and prepare pie chart data
    const pieData = Array.from(activityScores.entries())
      .map(([activityId, data]) => ({
        name: data.name,
        id: data.id,
        score: data.totalWeightedScore / data.totalWeight,
        weight: data.totalWeightedWeight / data.totalWeight
      }))
      .sort((a, b) => b.weight - a.weight); // Sort by weight descending

    if (pieData.length === 0) {
      this.showSubactivitiesPie = false;
      return;
    }

    // Normalize weights to percentages
    const rawWeights = pieData.map(item => item.weight);
    const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);
    const normalizedWeights = rawWeights.map(weight => (weight / totalWeight) * 100);

    // Create labels with activity name and score
    const labels = pieData.map(item => {
      return item.name;
    });

    this.subactivitiesPieData = {
      labels: labels,
      datasets: [{
        data: normalizedWeights, // Use only normalized weights as data
        backgroundColor: pieData.map(item => this.getColorForValue(item.score * 100)),
        borderColor: '#ffffff',
        borderWidth: 2,
      }]
    };

    // Store the pie data with IDs for later use
    this.subactivitiesPieData.activityIds = pieData.map(item => item.id);
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

  onDialogShow(): void {
    // Resize charts when dialog becomes visible
    setTimeout(() => {
      this.resizeCharts();
    }, 200);
  }

  onWeightingChange(event: any): void {
    this.isAreaWeighting = event.checked;
    this.weightingType = this.isAreaWeighting ? 'area' : 'population';
    this.initializeChartData();
    // Regenerate subactivities pie chart if currently showing
    if (this.showSubactivitiesPie && this.hoveredCategoryId) {
      this.generateSubactivitiesPieData(this.hoveredCategoryId);
    }
    // No need for an additional trigger here as initializeChartData already has one
  }

  toggleActivitiesChartType(): void {
    this.initializeActivitiesChart();
    setTimeout(() => {
      this.resizeCharts();
    }, 100);
  }

  toggleSort(): void {
    this.sortBy = this.sortBy === 'score' ? 'weight' : 'score';
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
              color: '#ff5722'
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
          zoom: 10
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
    if (places.length === 0) {
      this.noPlaces = true;
    } else {
      this.noPlaces = false;
    }
    if (!this.map) {
      console.error("Map not initialized");
      return;
    }

    // Get center coordinates
    const coordinates = this.analyzeService.getCoordinates();

    // Create extent from place coordinates and center point
    const placeCoordinates = places.map(place => fromLonLat([place.lon, place.lat]));
    const centerCoordinate = coordinates ? fromLonLat([coordinates[0], coordinates[1]]) : null;

    // Combine all coordinates for extent calculation
    const allCoordinates = centerCoordinate
      ? [...placeCoordinates, centerCoordinate]
      : placeCoordinates;
  }
}
