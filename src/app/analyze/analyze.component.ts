import { Component, OnInit, OnDestroy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { Subscription } from 'rxjs';
import { ProjectsService } from '../projects/projects.service';
import { AnalyzeService } from './analyze.service';
import { MapService } from '../map/map.service';
import Feature from 'ol/Feature';
import { Properties } from './analyze.interface';
import { ProjectDetails } from '../projects/project.interface';

@Component({
  selector: 'app-analyze',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css'
})
export class AnalyzeComponent implements OnInit, OnDestroy, AfterViewInit {
  visible: boolean = false;
  loading: boolean = false;
  private subscriptions: Subscription[] = [];
  projectDetails: ProjectDetails | undefined;
  feature: Feature | undefined;
  properties: Properties | undefined;
  averageType: 'mean' | 'median' = 'mean';
  populationArea: 'pop' | 'area' = 'pop';
  currentScore: number = 0;
  currentScoreColor: string = '';
  weightingType: 'population' | 'area' = 'population';
  isAreaWeighting: boolean = false;

  // Diagrammdaten
  personaChartData: any;
  activitiesChartData: any;
  modesChartData: any;
  radarChartOptions: any;
  barChartOptions: any;
  pieChartOptions: any;
  activitiesChartType: 'bar' | 'doughnut' = 'bar';
  doughnutChartOptions: any;

  getScore(): {score: number, color: string} {
    if (!this.properties) return {score: 0, color: ''};
    const mapType = `${this.populationArea}_${this.averageType}`;
    this.currentScore = this.properties[mapType] as number || 0;
    const color =`${this.populationArea}_${this.averageType}_color`;
    this.currentScoreColor = this.properties[color] as string || '';
    return {score: this.currentScore, color: this.currentScoreColor};
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
    private mapService: MapService,
    private cdr: ChangeDetectorRef
  ) {
    this.subscriptions.push(
      this.analyzeService.visible$.subscribe(
      visible => {
        this.visible = visible;
        if (visible) {
          const state = this.analyzeService.getCurrentState();
          if (state.feature) {
            this.feature = state.feature;
            this.properties = this.feature.getProperties() as Properties;
          }
          if (state.projectId && state.mapType && state.feature) {
            this.loading = true;
            this.projectsService.getProjectDetails(state.projectId, state.mapType, state.feature.getProperties()['id'])
              .subscribe({
                next: (details) => {
                  this.projectDetails = details;
                  this.initializeChartData();
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
      this.mapService.visualizationSettings$.subscribe(settings => {
        this.averageType = settings.averageType;
        this.populationArea = settings.populationArea;
        this.getScore();
        this.cdr.detectChanges();
      })
    );
    this.getScore();

    // Grundlegende Chart-Optionen für verschiedene Diagrammtypen
    this.radarChartOptions = {
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            generateLabels: function(chart: any) {
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
            },
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

    this.barChartOptions = {
      plugins: {
        legend: {
          position: 'bottom'
        }
      },
      responsive: true,
      maintainAspectRatio: false
    };

    this.pieChartOptions = {
      plugins: {
        legend: {
          position: 'bottom'
        }
      },
      responsive: true,
      maintainAspectRatio: false
    };

    this.doughnutChartOptions = {
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context: any) {
              const dataset = context.dataset;
              const value = dataset.data[context.dataIndex];
              const label = context.label;
              const weight = dataset.weights[context.dataIndex];
              return `${label}: ${value.toFixed(2)} (Weight: ${weight})`;
            }
          }
        }
      },
      cutout: '60%',
      responsive: true,
      maintainAspectRatio: false
    };
  }

  private initializeChartData(): void {
    this.initializeModesChart();
    this.initializeActivitiesChart();
    this.initializePersonaChart();
    this.loading = false;
    this.cdr.detectChanges();
    // Trigger resize after charts are initialized and rendered
    setTimeout(() => this.triggerChartResize(), 100);
  }

  private initializeModesChart(): void {
    if (!this.projectDetails?.hexagons || this.projectDetails.hexagons.length === 0) return;

    // Calculate weighted averages for each mode
    const modeScores = new Map<number, { totalWeightedScore: number, totalWeight: number }>();
    
    // Sum up weighted scores and weights for each mode
    this.projectDetails.hexagons.forEach(hexagon => {
      const weight = this.weightingType === 'population' ? hexagon.population : 1;
      hexagon.mode_scores.forEach(modeScore => {
        const current = modeScores.get(modeScore.mode) || { totalWeightedScore: 0, totalWeight: 0 };
        current.totalWeightedScore += modeScore.score * weight;
        current.totalWeight += weight;
        modeScores.set(modeScore.mode, current);
      });
    });

    // Calculate final weighted averages
    const weightedModeScores = Array.from(modeScores.entries()).map(([mode, data]) => ({
      mode,
      score: data.totalWeightedScore / data.totalWeight
    }));

    // Sort modes by their weighted scores (ascending)
    const sortedModes = weightedModeScores.sort((a, b) => a.score - b.score);
    
    // Get mode names from formatted_modes
    const modeMap = new Map(this.projectDetails.modes.map(mode => [mode.id, mode.name]));
    const labels = sortedModes.map(mode => modeMap.get(mode.mode) || `${mode.mode}`);
    const data = sortedModes.map(mode => mode.score);

    // Farbzuordnung basierend auf den Werten
    const getColorForValue = (value: number): string => {
      if (value >= 1.41) return '#9656a2';      // Lila (F)
      if (value >= 1) return '#c21807';      // Rot (E)
      if (value >= 0.72) return '#ed7014';      // Orange (D)
      if (value >= 0.51) return '#eed202';      // Gelb (C)
      if (value >= 0.35) return '#3cb043';      // Hellgrün (B)
      return '#32612d';                         // Dunkelgrün (A)
    };

    const backgroundColor = data.map(value => getColorForValue(value));

    this.modesChartData = {
      type: 'bar',
      labels: labels,
      datasets: [
        {
          label: 'Verkehrsmittelwerte',
          data: data,
          backgroundColor: backgroundColor,
          borderColor: backgroundColor,
          borderWidth: 1,
          yAxisID: 'y',
          order: 2
        }
      ]
    };

    // Aktualisiere die Chart-Optionen
    this.barChartOptions = {
      indexAxis: 'x',
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context: any) {
              return `${context.dataset.label}: ${context.raw.toFixed(2)}`;
            }
          }
        },
        legend: {
          labels: {
            color: '#495057'
          },
          position: 'bottom'
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
            text: 'Verkehrsmittelwerte'
          }
        }
      }
    };
  }

  private initializeActivitiesChart(): void {
    if (!this.projectDetails?.hexagons || this.projectDetails.hexagons.length === 0) return;

    // Calculate weighted averages for each category
    const categoryScores = new Map<number, { totalWeightedScore: number, totalWeight: number }>();
    
    // Sum up weighted scores and weights for each category
    this.projectDetails.hexagons.forEach(hexagon => {
      const weight = this.weightingType === 'population' ? hexagon.population : 1;
      hexagon.category_scores.forEach(categoryScore => {
        const current = categoryScores.get(categoryScore.category) || { totalWeightedScore: 0, totalWeight: 0 };
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

    // Create array with all necessary data and filter for weights > 3%
    const categoryData = weightedCategoryScores
      .map(category => ({
        name: categoryMap.get(category.category)?.name || `${category.category}`,
        score: category.score,
        weight: categoryMap.get(category.category)?.weight || 1
      }))
      .filter(item => item.weight > 3); // Filter for weights greater than 3%

    // Sort based on chart type
    let sortedData;
    if (this.activitiesChartType === 'bar') {
      // Sort by score for bar chart (ascending)
      sortedData = [...categoryData].sort((a, b) => a.score - b.score);
    } else {
      // Sort by weight for doughnut chart (descending)
      sortedData = [...categoryData].sort((a, b) => b.weight - a.weight);
    }

    // Extract sorted arrays
    const labels = sortedData.map(item => item.name);
    const data = sortedData.map(item => item.score);
    const weights = sortedData.map(item => item.weight);

    // Farbzuordnung basierend auf den Werten
    const getColorForValue = (value: number): string => {
      if (value >= 1.41) return '#9656a2';      // Lila (F)
      if (value >= 1) return '#c21807';      // Rot (E)
      if (value >= 0.72) return '#ed7014';      // Orange (D)
      if (value >= 0.51) return '#eed202';      // Gelb (C)
      if (value >= 0.35) return '#3cb043';      // Hellgrün (B)
      return '#32612d';                         // Dunkelgrün (A)
    };

    const backgroundColor = data.map(value => getColorForValue(value));

    if (this.activitiesChartType === 'bar') {
      this.activitiesChartData = {
        labels: labels,
        datasets: [
          {
            label: 'Aktivitätswerte',
            data: data,
            backgroundColor: backgroundColor,
            borderColor: backgroundColor,
            borderWidth: 1,
            yAxisID: 'y',
            order: 2
          }
        ]
      };

      // Aktualisiere die Chart-Optionen
      this.barChartOptions = {
        indexAxis: 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context: any) {
                const weight = weights[context.dataIndex];
                return `${context.dataset.label}: ${context.raw.toFixed(2)} (Weight: ${weight})`;
              }
            }
          },
          legend: {
            labels: {
              color: '#495057'
            },
            position: 'bottom'
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
              text: 'Aktivitätswerte'
            }
          }
        }
      };
    } else {
      // Create a new dataset that shows activities multiplied by their weight
      const weightedScores = sortedData.map(item => ({
        name: item.name,
        weightedValue: item.score * item.weight,
        score: item.score,
        weight: item.weight
      }));
      
      // Sort by weighted value (descending)
      const sortedWeightedScores = [...weightedScores].sort((a, b) => b.weightedValue - a.weightedValue);
      
      const weightedLabels = sortedWeightedScores.map(item => item.name);
      const weightedData = sortedWeightedScores.map(item => item.weightedValue);
      const originalScores = sortedWeightedScores.map(item => item.score);
      const weights = sortedWeightedScores.map(item => item.weight);
      
      const weightedBackgroundColors = sortedWeightedScores.map(item => {
        const score = item.score;
        if (score >= 1.41) return '#9656a2';      // Purple (F)
        if (score >= 1.0) return '#c21807';       // Red (E)
        if (score >= 0.72) return '#ed7014';      // Orange (D)
        if (score >= 0.51) return '#eed202';      // Yellow (C)
        if (score >= 0.35) return '#3cb043';      // Light green (B)
        return '#32612d';                         // Dark green (A)
      });

      this.activitiesChartData = {
        labels: weightedLabels,
        datasets: [
          {
            label: 'Gewichtete Aktivitätswerte',
            data: weightedData,
            backgroundColor: weightedBackgroundColors,
            borderColor: weightedBackgroundColors,
            borderWidth: 1
          }
        ]
      };

      // Update chart options for weighted bar chart
      this.barChartOptions = {
        indexAxis: 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context: any) {
                const index = context.dataIndex;
                return [
                  `Gewichteter Wert: ${context.raw.toFixed(2)}`,
                  `Score: ${originalScores[index].toFixed(2)}`,
                  `Gewichtung: ${weights[index]}`
                ];
              }
            }
          },
          legend: {
            labels: {
              color: '#495057'
            },
            position: 'bottom'
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
            beginAtZero: true,
            ticks: {
              color: '#495057'
            },
            grid: {
              color: '#ebedef'
            },
            title: {
              display: true,
              text: 'Gewichtete Aktivitätswerte (Score × Gewichtung)'
            }
          }
        }
      };
    }
  }

  private initializePersonaChart(): void {
    if (!this.projectDetails?.hexagons || this.projectDetails.hexagons.length === 0) return;

    // Calculate weighted averages for each persona
    const personaScores = new Map<number, { totalWeightedScore: number, totalWeight: number }>();
    
    // Sum up weighted scores and weights for each persona
    this.projectDetails.hexagons.forEach(hexagon => {
      const weight = this.weightingType === 'population' ? hexagon.population : 1;
      hexagon.persona_scores.forEach(personaScore => {
        const current = personaScores.get(personaScore.persona) || { totalWeightedScore: 0, totalWeight: 0 };
        current.totalWeightedScore += personaScore.score * weight;
        current.totalWeight += weight;
        personaScores.set(personaScore.persona, current);
      });
    });

    // Calculate final weighted averages
    const weightedPersonaScores = Array.from(personaScores.entries()).map(([persona, data]) => ({
      persona,
      score: data.totalWeightedScore / data.totalWeight
    }));

    // Sort personas by their weighted scores (ascending)
    const sortedPersonas = weightedPersonaScores.sort((a, b) => a.score - b.score);
    
    // Get persona names from formatted_personas
    const personaMap = new Map(this.projectDetails.personas.map(p => [p.id, p.name]));
    const labels = sortedPersonas.map(persona => personaMap.get(persona.persona) || `${persona.persona}`);
    const data = sortedPersonas.map(persona => persona.score);

    // Find the highest score for background bands
    const highestScore = Math.max(...data);

    // Calculate dynamic max value - round up to next 0.5 increment and add small padding
    const maxValue = highestScore * 1.05;

    // Farbzuordnung basierend auf den Werten
    const getColorForValue = (value: number): string => {
      if (value >= 1.41) return '#9656a2';      // Lila (F)
      if (value >= 1) return '#c21807';      // Rot (E)
      if (value >= 0.72) return '#ed7014';      // Orange (D)
      if (value >= 0.51) return '#eed202';      // Gelb (C)
      if (value >= 0.35) return '#3cb043';      // Hellgrün (B)
      return '#32612d';                         // Dunkelgrün (A)
    };

    const getBackgroundColorForValue = (value: number): string => {
      if (value >= 1.41) return 'rgba(150, 86, 162, 0.2)';    // Lila (F)
      if (value >= 1) return 'rgba(194, 24, 7, 0.2)';    // Rot (E)
      if (value >= 0.72) return 'rgba(237, 112, 20, 0.2)';    // Orange (D)
      if (value >= 0.51) return 'rgba(238, 210, 2, 0.2)';    // Gelb (C)
      if (value >= 0.35) return 'rgba(60, 176, 67, 0.2)';    // Hellgrün (B)
      return 'rgba(50, 97, 45, 0.2)';                       // Dunkelgrün (A)
    };

    const borderColors = data.map(value => getColorForValue(value));
    const backgroundColors = data.map(value => getBackgroundColorForValue(value));

    // Update radar options with dynamic max value
    this.radarChartOptions = {
      ...this.radarChartOptions,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          max: maxValue,
          ticks: {
            stepSize: maxValue > 2 ? 0.5 : 0.2,
            font: {
              size: 10
            }
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

    // Basis-Datensatz für die Hintergrundfarben
    const baseDatasets = [];
    if (highestScore >= 1.41) {
      baseDatasets.push({
        label: 'F',
        data: Array(labels.length).fill(Math.min(maxValue, 2)), // Use dynamic max value
        backgroundColor: 'rgba(150, 86, 162, 0.2)',
        borderWidth: 0,
        fill: 'start'
      });
    }
    if (highestScore >= 1.0) {
      baseDatasets.push({
        label: 'E',
        data: Array(labels.length).fill(Math.min(maxValue, 1.41)),
        backgroundColor: 'rgba(194, 24, 7, 0.2)',
        borderWidth: 0,
        fill: 'start'
      });
    }
    if (highestScore >= 0.72) {
      baseDatasets.push({
        label: 'D',
        data: Array(labels.length).fill(Math.min(maxValue, 1.0)),
        backgroundColor: 'rgba(237, 112, 20, 0.2)',
        borderWidth: 0,
        fill: 'start'
      });
    }
    if (highestScore >= 0.51) {
      baseDatasets.push({
        label: 'C',
        data: Array(labels.length).fill(Math.min(maxValue, 0.72)),
        backgroundColor: 'rgba(238, 210, 2, 0.2)',
        borderWidth: 0,
        fill: 'start'
      });
    }
    if (highestScore >= 0.35) {
      baseDatasets.push({
        label: 'B',
        data: Array(labels.length).fill(Math.min(maxValue, 0.51)),
        backgroundColor: 'rgba(60, 176, 67, 0.2)',
        borderWidth: 0,
        fill: 'start'
      });
    }
    baseDatasets.push({
      label: 'A',
      data: Array(labels.length).fill(Math.min(maxValue, 0.35)),
      backgroundColor: 'rgba(50, 97, 45, 0.2)',
      borderWidth: 0,
      fill: 'start'
    });

    this.personaChartData = {
      labels: labels,
      datasets: [
        ...baseDatasets.reverse(),
        {
          label: 'Persona-Werte',
          data: data,
          backgroundColor: 'transparent',
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

  ngOnInit() {
  }

  ngOnDestroy() {
    if (this.subscriptions) {
      this.subscriptions.forEach(subscription => subscription.unsubscribe());
    }
  }

  hide() {
    this.analyzeService.hide();
  }

  onWeightingChange(event: any): void {
    this.isAreaWeighting = event.checked;
    this.weightingType = this.isAreaWeighting ? 'area' : 'population';
    this.initializeChartData();
    // No need for an additional trigger here as initializeChartData already has one
  }

  toggleActivitiesChartType(): void {
    this.activitiesChartType = this.activitiesChartType === 'bar' ? 'doughnut' : 'bar';
    this.initializeActivitiesChart();
    // Trigger resize after chart type change with sufficient delay to ensure rendering completes
    setTimeout(() => this.triggerChartResize(), 100);
  }

  /**
   * Triggers a resize event on window to make charts adjust to their container size
   */
  triggerChartResize(): void {
    // Initial resize
    window.dispatchEvent(new Event('resize'));
    
    // Series of delayed resizes to ensure chart properly adjusts
    const delays = [50, 150, 300];
    delays.forEach(delay => {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        this.cdr.detectChanges();
      }, delay);
    });
  }

  ngAfterViewInit() {
  }
}
