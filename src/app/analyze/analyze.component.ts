import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { Subscription } from 'rxjs';
import { ProjectsService } from '../projects/projects.service';
import { AnalyzeService } from './analyze.service';
import Feature from 'ol/Feature';
import { Properties } from './analyze.interface';

@Component({
  selector: 'app-analyze',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css'
})
export class AnalyzeComponent implements OnInit, OnDestroy {
  visible: boolean = false;
  loading: boolean = false;
  private subscription: Subscription;
  projectDetails: any;
  feature: Feature | undefined;
  properties: Properties | undefined;

  // Diagrammdaten
  personaChartData: any;
  activitiesChartData: any;
  modesChartData: any;
  radarChartOptions: any;
  barChartOptions: any;
  pieChartOptions: any;

  hasPersonaData(): boolean {
    return Object.keys(this.projectDetails?.persona_scores || {}).length > 0;
  }

  hasActivityData(): boolean {
    return Object.keys(this.projectDetails?.category_scores || {}).length > 0;
  }

  hasModeData(): boolean {
    return Object.keys(this.projectDetails?.mode_scores || {}).length > 0;
  }

  constructor(
    private analyzeService: AnalyzeService,
    private projectsService: ProjectsService,
    private cdr: ChangeDetectorRef
  ) {
    this.subscription = this.analyzeService.visible$.subscribe(
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
            this.projectsService.getProjectDetails(state.projectId, state.mapType, state.feature.getId()!.toString())
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
    );

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

    this.barChartOptions = {      plugins: {
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
  }

  private initializeChartData(): void {
    this.initializeModesChart();
    this.initializeActivitiesChart();
    this.initializePersonaChart();
    this.loading = false;
    this.cdr.detectChanges();
  }

  private initializeModesChart(): void {
    const modeScores = this.projectDetails?.mode_scores || [];
    const uniqueModes = new Set<string>();
    
    // Sammle alle einzigartigen Verkehrsmittel
    modeScores.forEach((rankData: any) => {
      Object.keys(rankData.modes || {}).forEach(mode => uniqueModes.add(mode));
    });

    const labels = modeScores.map((rankData: any) => `Rang ${rankData.rank}`);

    // Farbpalette für bis zu 4 Modi
    const colorPalette = {
      'car': '#FF6384',      // Rot für Auto
      'bicycle': '#36A2EB',     // Blau für Fahrrad
      'pedestrian': '#4BC0C0',     // Türkis für Fußgänger
      'pt': '#FFCD56'        // Gelb für ÖPNV
    };

    // Berechne die Gesamtsumme für jeden Rang
    const rankTotals = modeScores.map((rankData: any) => {
      return Object.values(rankData.modes || {}).reduce((sum: number, mode: any) => sum + (mode.count || 0), 0);
    });

    const datasets = Array.from(uniqueModes).map(mode => {
      return {
        label: modeScores[0]?.modes[mode]?.display_name || mode,
        data: modeScores.map((rankData: any, index: number) => {
          const count = rankData.modes[mode]?.count || 0;
          const total = rankTotals[index];
          return total > 0 ? (count / total * 100) : 0;
        }),
        backgroundColor: colorPalette[mode as keyof typeof colorPalette] || '#808080',
        stack: 'Stack 0'
      };
    });

    this.modesChartData = {
      labels: labels,
      datasets: datasets
    };

    this.barChartOptions = {
      indexAxis: 'x',
      maintainAspectRatio: false,
      aspectRatio: 1,
      plugins: {
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context: any) {
              return `${context.dataset.label}: ${context.raw.toFixed(1)}%`;
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
          stacked: true,
          ticks: {
            color: '#495057'
          },
          grid: {
            color: '#ebedef'
          }
        },
        y: {
          stacked: true,
          ticks: {
            color: '#495057',
            callback: function(value: number) {
              return value + '%';
            }
          },
          grid: {
            color: '#ebedef'
          },
          max: 100
        }
      }
    };
  }

  private initializeActivitiesChart(): void {
    const categoryScores = this.projectDetails?.category_scores || {};
    
    // Sortiere die Kategorien nach ihren Scores (aufsteigend)
    const sortedCategories = Object.entries(categoryScores)
      .sort(([, a]: [string, any], [, b]: [string, any]) => a.score - b.score);
    
    const labels = sortedCategories.map(([, category]: [string, any]) => category.display_name);
    const data = sortedCategories.map(([, category]: [string, any]) => category.score);

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

    this.activitiesChartData = {
      type: 'bar',
      labels: labels,
      datasets: [{
        label: 'Aktivitätswerte',
        data: data,
        backgroundColor: backgroundColor,
        borderColor: backgroundColor,
        borderWidth: 1
      }]
    };

    // Aktualisiere die Chart-Optionen
    this.barChartOptions = {
      indexAxis: 'x',
      maintainAspectRatio: false,
      aspectRatio: 1,
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
          beginAtZero: true,
          ticks: {
            color: '#495057'
          },
          grid: {
            color: '#ebedef'
          }
        }
      }
    };
  }

  private initializePersonaChart(): void {
    const personaScores = this.projectDetails?.persona_scores || {};
    // Filtere Personas ohne "n/a" und finde den höchsten Score
    const filteredPersonaScores = Object.entries(personaScores)
      .filter(([key]) => key !== 'n/a')
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
    const highestScore = Math.max(...Object.values(filteredPersonaScores).map((persona: any) => persona.score));

    const labels = Object.values(filteredPersonaScores).map((persona: any) => persona.display_name);
    const data = Object.values(filteredPersonaScores).map((persona: any) => persona.score);

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

    // Basis-Datensatz für die Hintergrundfarben
    const baseDatasets = []
    if (highestScore >= 1.41) {
      baseDatasets.push({
        label: 'F',
        data: Array(labels.length).fill(2.0),
        backgroundColor: 'rgba(150, 86, 162, 0.2)',
        borderWidth: 0,
        fill: 'start'
      })
    }
    if (highestScore >= 1.0) {
      baseDatasets.push({
        label: 'E',
        data: Array(labels.length).fill(1.41),
        backgroundColor: 'rgba(194, 24, 7, 0.2)',
        borderWidth: 0,
        fill: 'start'
      })
    }
    if (highestScore >= 0.72) {
      baseDatasets.push({
        label: 'D',
        data: Array(labels.length).fill(1.0),
        backgroundColor: 'rgba(237, 112, 20, 0.2)',
        borderWidth: 0,
        fill: 'start'
      })
    }
    if (highestScore >= 0.51) {
      baseDatasets.push({
        label: 'C',
        data: Array(labels.length).fill(0.72),
        backgroundColor: 'rgba(238, 210, 2, 0.2)',
        borderWidth: 0,
        fill: 'start'
      })
    }
    if (highestScore >= 0.35) {
      baseDatasets.push({
        label: 'B',
        data: Array(labels.length).fill(0.51),
        backgroundColor: 'rgba(60, 176, 67, 0.2)',
        borderWidth: 0,
        fill: 'start'
      })
    }
    baseDatasets.push({
      label: 'A',
      data: Array(labels.length).fill(0.35),
      backgroundColor: 'rgba(50, 97, 45, 0.2)',
      borderWidth: 0,
      fill: 'start'
    })

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
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  hide() {
    this.analyzeService.hide();
  }
}
