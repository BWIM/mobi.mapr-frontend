import { Component, OnDestroy, ChangeDetectorRef, AfterViewInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { Subscription } from 'rxjs';
import { ProjectsService } from '../projects/projects.service';
import { AnalyzeService } from './analyze.service';
import { Place, Properties } from './analyze.interface';
import { ProjectDetails } from '../projects/project.interface';
import { MapGeoJSONFeature } from 'maplibre-gl';
import { UIChart } from 'primeng/chart';

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
import { boundingExtent } from 'ol/extent';

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
  modesChartData: any;
  radarChartOptions: any;
  barChartOptions: any;
  subBarChartOptions: any;
  subactivitiesChartData: any;

  // Map properties
  private map?: OlMap;
  private overlay?: Overlay;
  private placesLayer?: VectorLayer<VectorSource>;
  private centerLayer?: VectorLayer<VectorSource>;
  private tooltipElement?: HTMLElement;
  private tooltipOverlay?: Overlay;


  @ViewChild('activitiesChart') activitiesChart?: UIChart;
  @ViewChild('personaChart') personaChart?: UIChart;
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
    if (!this.projectDetails) return false;
    if (!this.projectDetails.hexagons || this.projectDetails.hexagons.length === 0) return false;
    return true;
  }

  constructor(
    private analyzeService: AnalyzeService,
    private projectsService: ProjectsService,
    private cdr: ChangeDetectorRef,
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
  }

  private initializeChartData(): void {
    // this.initializeModesChart();
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
    if (value >= 141) return '#9656a2';      // Lila (F)
    if (value >= 100) return '#c21807';      // Rot (E)
    if (value >= 72) return '#ed7014';      // Orange (D)
    if (value >= 51) return '#eed202';      // Gelb (C)
    if (value >= 35) return '#3cb043';      // Hellgrün (B)
    return '#32612d';                         // Dunkelgrün (A)
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
    const scoreNames = sortedData.map(item => this.getScoreName(item.score * 100));


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
                `Score: ${scoreNames[index]}`,
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
            text: 'Gewichtung (%)'
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
    const labels = weightedSubactivityScores.map(item => item.name);
    const scores = weightedSubactivityScores.map(item => item.score * 100);
    const weights = normalizedWeights;

    // Create labels with activity name and percentage
    const labelsWithPercentages = weightedSubactivityScores.map((item, index) =>
      `${item.name} (${weights[index].toFixed(1)}%)`
    );

    const scoreNames = weightedSubactivityScores.map(item => this.getScoreName(item.score * 100));
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
      setTimeout(() => {
        this.initializeMap();
      }, 100);
      this.analyzeService.getPlaces(activityId).subscribe((res: Place[]) => {
        this.addPlacesToMap(res);
        this.zoomToPlaces(res);
        this.mapLoaded = true;
      });
    }
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
    const scoreNames = sortedPersonas.map(persona => this.getScoreName(persona.score * 100));

    const borderColors = data.map(value => this.getColorForValue(value * 100));

    // Update radar options with dynamic max value and inverted scale
    this.radarChartOptions = {
      ...this.radarChartOptions,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...this.radarChartOptions.plugins,
        tooltip: {
          callbacks: {
            title: (context: any) => {
              if (context[0].dataset.label === 'Persona-Werte') {
                return context[0].label;
              }
              return context[0].dataset.label;
            },
            label: (context: any) => {
              if (context.dataset.label === 'Persona-Werte') {
                const index = context.dataIndex;
                return `Score: ${scoreNames[index]}`;
              }
              return context.dataset.label;
            }
          }
        }
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 2,
          reverse: true, // This inverts the scale
          ticks: {
            stepSize: 0.5,
            font: {
              size: 10
            },
            display: false
          },
          grid: {
            color: '#ebedef'
          },
          angleLines: {
            color: '#ebedef'
          },
          pointLabels: {
            font: {
              size: 12
            }
          }
        }
      }
    };

    // Basis-Datensatz für die Hintergrundfarben (inverted)
    const baseDatasets = [
      {
        label: 'F',
        data: labels.map(() => 1.41), // Fills from 1.41 to 2.0
        backgroundColor: 'rgba(150, 86, 162, 0.2)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: 'start' // Fill to the next dataset (E)
      },
      {
        label: 'E',
        data: labels.map(() => 1.0), // Fills from 1.0 to 1.41
        backgroundColor: 'rgba(194, 24, 7, 0.2)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: '+1' // Fill to the next dataset (D)
      },
      {
        label: 'D',
        data: labels.map(() => 0.72), // Fills from 0.72 to 1.0
        backgroundColor: 'rgba(237, 112, 20, 0.2)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: '+1' // Fill to the next dataset (C)
      },
      {
        label: 'C',
        data: labels.map(() => 0.5), // Fills from 0.51 to 0.72
        backgroundColor: 'rgba(238, 210, 2, 0.2)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: '+1' // Fill to the next dataset (B)
      },
      {
        label: 'B',
        data: labels.map(() => 0.35), // Fills from 0.35 to 0.51
        backgroundColor: 'rgba(60, 176, 67, 0.2)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: '+1' // Fill to the next dataset (A)
      },
      {
        label: 'A',
        data: labels.map(() => 0.35), // Fills from 0 to 0.35
        backgroundColor: 'rgba(50, 97, 45, 0.2)',
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: 'origin' // Fill to the origin (0)
      }
    ]
    this.personaChartData = {
      labels: labels,
      datasets: [
        ...baseDatasets.reverse(),
        {
          label: 'Persona-Werte',
          data: data,
          backgroundColor: 'rgba(0, 0, 0, 0.0)',
          borderColor: borderColors,
          borderWidth: 2,
          pointBackgroundColor: borderColors,
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: borderColors,
          fill: false
        }
      ]
    };
  }


  onCategoryLeave(): void {
    this.showSubactivitiesPie = false;
    this.hoveredCategoryId = null;
    this.hoveredCategoryName = '';
    this.initializeSubActivitiesChart(); // Reset subactivities chart when leaving
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

  getScoreName(score: number): string {
    score = score / 100;
    if (score <= 0) return "Error";
    if (score < 0.28) return "A+";
    if (score < 0.32) return "A";
    if (score < 0.35) return "A-";
    if (score < 0.4) return "B+";
    if (score < 0.45) return "B";
    if (score < 0.5) return "B-";
    if (score < 0.56) return "C+";
    if (score < 0.63) return "C";
    if (score < 0.71) return "C-";
    if (score < 0.8) return "D+";
    if (score < 0.9) return "D";
    if (score < 1.0) return "D-";
    if (score < 1.12) return "E+";
    if (score < 1.26) return "E";
    if (score < 1.41) return "E-";
    if (score < 1.59) return "F+";
    if (score < 1.78) return "F";
    return "F-";
  }

  private initializeMap() {
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
      layers: [baseLayer, this.placesLayer, this.centerLayer],
      view: new View({
        center: fromLonLat([49.320099, 9.2156505]),
        zoom: 10
      }),
      overlays: [this.tooltipOverlay]
    });
    
    const coordinates = this.analyzeService.getCoordinates();
    console.log(coordinates);
    if (coordinates) {
      this.map.getView().setCenter(fromLonLat([coordinates![0], coordinates![1]]));
    }

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
  }

  private addPlacesToMap(places: Place[]) {
    if (!this.map || !this.placesLayer || !this.centerLayer) {
      console.error("Map or layers not initialized.");
      return;
    }

    // Clear existing features from the layers
    this.placesLayer.getSource()?.clear();
    this.centerLayer.getSource()?.clear();

    const coordinates = this.analyzeService.getCoordinates();
    // add center point to center layer
    this.centerLayer.getSource()?.addFeature(new Feature({
      geometry: new Point(fromLonLat([coordinates![0], coordinates![1]])),
      name: "Center",
      id: "center",
      rating: 0,
      activity: "clicked point"
    }));
    

    // Add new features to the places layer
    places.forEach(place => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([place.lon, place.lat])),
        name: place.name,
        id: place.id,
        rating: place.rating,
        activity: place.activity
      });
      this.placesLayer?.getSource()?.addFeature(feature);
    });
  }

  private zoomToPlaces(places: Place[]) {
    if (!this.map || places.length === 0) {
      console.error("Map not initialized or no places to zoom to.");
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
    
    const extent = boundingExtent(allCoordinates);

    // Add some padding to the extent
    const padding = [50, 50, 50, 50]; // [top, right, bottom, left]
    
    this.map.getView().fit(extent, {
      duration: 500,
      padding: padding,
      maxZoom: 15
    });
  }
}
