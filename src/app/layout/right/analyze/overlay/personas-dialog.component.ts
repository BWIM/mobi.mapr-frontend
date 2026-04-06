import { Component, Inject, OnInit, AfterViewInit, ViewChild, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SharedModule } from '../../../../shared/shared.module';
import { CommonModule } from '@angular/common';
import { AnalyzeService, PersonaBreakdown } from '../../../../services/analyze.service';
import { catchError, of, forkJoin } from 'rxjs';
import { ChartModule } from 'primeng/chart';
import { UIChart } from 'primeng/chart';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageService } from '../../../../services/language.service';

export interface PersonasDialogData {
  featureType: 'municipality' | 'hexagon' | 'county' | 'state';
  featureId: number;
  profileIds: number[];
  categoryIds?: number[];
  personaId?: number;
  isScoreMode: boolean;
  featureName?: string;
  getGrade: (index: number) => string;
  // Comparison mode fields
  featureId2?: number;
  featureType2?: 'municipality' | 'hexagon' | 'county' | 'state';
  featureName2?: string;
  isComparisonMode?: boolean;
}

@Component({
  selector: 'app-personas-dialog',
  standalone: true,
  imports: [
    SharedModule,
    CommonModule,
    ChartModule,
    TranslateModule,
  ],
  templateUrl: './personas-dialog.component.html',
  styleUrl: './personas-dialog.component.css'
})
export class PersonasDialogComponent implements OnInit, AfterViewInit {
  allPersonas: PersonaBreakdown[] = [];
  allPersonas2: PersonaBreakdown[] = [];
  isLoading: boolean = false;
  isLoading2: boolean = false;
  error: string | null = null;
  error2: string | null = null;
  chartData: any = null;
  chartOptions: any = null;
  
  @ViewChild('personasChart') personasChart?: UIChart;

  // Quality (index) colors - A through F
  qualityColors = [
    { letter: 'A', color: 'rgb(50, 97, 45)' },
    { letter: 'B', color: 'rgb(60, 176, 67)' },
    { letter: 'C', color: 'rgb(238, 210, 2)' },
    { letter: 'D', color: 'rgb(237, 112, 20)' },
    { letter: 'E', color: 'rgb(194, 24, 7)' },
    { letter: 'F', color: 'rgb(197, 136, 187)' }
  ];

  // Time (score) colors - match exact colors from map.service.ts getScoreFillColorExpression()
  timeColors = [
    { value: '0-7', color: 'rgb(23, 25, 63)' },      // 0-7 min (default for < 480) - darkest
    { value: '8-15', color: 'rgb(43, 40, 105)' },   // 8-15 min (480-960s) - very dark
    { value: '16-23', color: 'rgb(74, 89, 160)' },    // 16-23 min (960-1440s) - darker
    { value: '24-30', color: 'rgb(90, 135, 185)' },   // 24-30 min (1440-1800s) - medium
    { value: '31-45', color: 'rgb(121, 194, 230)' },  // 31-45 min (1800-2700s) - medium-light
    { value: '45+', color: 'rgb(162, 210, 235)' }     // 45+ min (2700+s) - lightest
  ];

  private languageService = inject(LanguageService);
  private analyzeService = inject(AnalyzeService);

  constructor(
    public dialogRef: MatDialogRef<PersonasDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PersonasDialogData
  ) {}

  ngOnInit() {
    this.loadAllPersonas();
    if (this.data.isComparisonMode && this.data.featureId2) {
      this.loadAllPersonas2();
    }
  }

  ngAfterViewInit() {
    // Resize chart after view initialization to ensure it uses full container height
    setTimeout(() => {
      if (this.personasChart) {
        this.personasChart.reinit();
      }
    }, 100);
  }

  private loadAllPersonas(): void {
    this.isLoading = true;
    this.error = null;

    this.analyzeService.getPersonas({
      feature_type: this.data.featureType,
      feature_id: this.data.featureId,
      profile_ids: this.data.profileIds,
      category_ids: this.data.categoryIds,
      persona_id: this.data.personaId || 54
    }).pipe(
      catchError((error) => {
        console.error('Error loading personas:', error);
        if (error.status === 404) {
          this.error = this.languageService.instant('analyze.analyzeData.notFound');
        } else if (error.status === 503) {
          this.error = this.languageService.instant('analyze.analyzeData.dataNotPreloaded');
        } else {
          this.error = this.languageService.instant('analyze.analyzeData.errorLoading');
        }
        return of(null);
      })
    ).subscribe((response) => {
      this.isLoading = false;
      if (response) {
        this.allPersonas = [...response]
          .sort((a, b) => b.weight - a.weight);
        if (this.data.isComparisonMode && this.allPersonas2.length > 0) {
          this.initializeComparisonChart();
        } else if (!this.data.isComparisonMode) {
          this.initializeChart(this.allPersonas);
        }
        // Resize chart after data is loaded
        setTimeout(() => {
          if (this.personasChart) {
            this.personasChart.reinit();
          }
        }, 100);
      }
    });
  }

  private loadAllPersonas2(): void {
    if (!this.data.featureId2) {
      return;
    }

    this.isLoading2 = true;
    this.error2 = null;

    this.analyzeService.getPersonas({
      feature_type: this.data.featureType2 || this.data.featureType,
      feature_id: this.data.featureId2,
      profile_ids: this.data.profileIds,
      category_ids: this.data.categoryIds,
      persona_id: this.data.personaId || 54
    }).pipe(
      catchError((error) => {
        console.error('Error loading personas 2:', error);
        if (error.status === 404) {
          this.error2 = this.languageService.instant('analyze.analyzeData.notFound');
        } else if (error.status === 503) {
          this.error2 = this.languageService.instant('analyze.analyzeData.dataNotPreloaded');
        } else {
          this.error2 = this.languageService.instant('analyze.analyzeData.errorLoading');
        }
        return of(null);
      })
    ).subscribe((response) => {
      this.isLoading2 = false;
      if (response) {
        this.allPersonas2 = [...response]
          .sort((a, b) => b.weight - a.weight);
        if (this.allPersonas.length > 0) {
          this.initializeComparisonChart();
        }
        // Resize chart after data is loaded
        setTimeout(() => {
          if (this.personasChart) {
            this.personasChart.reinit();
          }
        }, 100);
      }
    });
  }

  private initializeChart(personas: PersonaBreakdown[]): void {
    if (!personas || personas.length === 0) {
      this.chartData = null;
      return;
    }

    const labels = personas.map((_, index) => (index + 1).toString());
    const weights = personas.map(p => p.weight * 100);

    // Get colors based on current map visualization type
    const colors = personas.map((persona) => {
      if (this.data.isScoreMode) {
        return this.getScoreColor(persona.score);
      } else {
        return this.getGradeColor(persona.index);
      }
    });

    // Find max weight to set appropriate y-axis max
    const maxWeight = Math.max(...weights);
    const yAxisMax = Math.ceil(maxWeight / 5) * 5; // Round up to nearest 5

    const populationLabel = this.languageService.instant('analyze.populationPercent');
    this.chartData = {
      labels: labels,
      datasets: [
        {
          label: populationLabel,
          data: weights,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2
        }
      ]
    };

    this.chartOptions = {
      indexAxis: 'x',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: (context: any) => {
              const index = context[0].dataIndex;
              return personas[index].name || '';
            },
            label: (context: any) => {
              const index = context.dataIndex;
              const persona = personas[index];
              const grade = this.getGrade(persona.index);
              const ratingLabel = this.languageService.instant('analyze.rating');
              const populationLabel = this.languageService.instant('analyze.populationPercent');
              return [
                `${ratingLabel}: ${grade}`,
                `${populationLabel}: ${weights[index].toFixed(1)}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#ffffff',
            font: {
              size: 14
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          max: yAxisMax,
          ticks: {
            stepSize: yAxisMax <= 25 ? 5 : Math.ceil(yAxisMax / 10),
            color: '#ffffff',
            font: {
              size: 14
            },
            padding: 5
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false
          },
          title: {
            display: true,
            text: this.languageService.instant('analyze.populationPercent'),
            color: '#ffffff',
            font: {
              size: 14
            },
            padding: {
              top: 0,
              bottom: 0
            }
          }
        }
      }
    };
  }

  private initializeComparisonChart(): void {
    if (!this.allPersonas || this.allPersonas.length === 0 || 
        !this.allPersonas2 || this.allPersonas2.length === 0) {
      this.chartData = null;
      return;
    }

    // Get all unique personas from both features
    const personaMap = new Map<string, { name: string; weight1: number; weight2: number; index1: number; index2: number; score1: number; score2: number }>();
    
    this.allPersonas.forEach(persona => {
      personaMap.set(persona.name, {
        name: persona.name,
        weight1: persona.weight,
        weight2: 0,
        index1: persona.index,
        index2: 0,
        score1: persona.score,
        score2: 0
      });
    });
    
    this.allPersonas2.forEach(persona => {
      const existing = personaMap.get(persona.name);
      if (existing) {
        existing.weight2 = persona.weight;
        existing.index2 = persona.index;
        existing.score2 = persona.score;
      } else {
        personaMap.set(persona.name, {
          name: persona.name,
          weight1: 0,
          weight2: persona.weight,
          index1: 0,
          index2: persona.index,
          score1: 0,
          score2: persona.score
        });
      }
    });

    // Sort by combined weight
    const sortedPersonas = Array.from(personaMap.values())
      .sort((a, b) => Math.max(b.weight1, b.weight2) - Math.max(a.weight1, a.weight2));

    const labels = sortedPersonas.map((_, index) => (index + 1).toString());
    const weights1 = sortedPersonas.map(p => p.weight1 * 100);
    const weights2 = sortedPersonas.map(p => p.weight2 * 100);

    // Get colors based on current map visualization type - same colors as before
    const colors1 = sortedPersonas.map((persona) => {
      if (this.data.isScoreMode) {
        return this.getScoreColor(persona.score1);
      } else {
        return this.getGradeColor(persona.index1);
      }
    });

    const colors2 = sortedPersonas.map((persona) => {
      if (this.data.isScoreMode) {
        return this.getScoreColor(persona.score2);
      } else {
        return this.getGradeColor(persona.index2);
      }
    });

    // Find max weight to set appropriate y-axis max
    const maxWeight = Math.max(...weights1, ...weights2);
    const yAxisMax = Math.ceil(maxWeight / 5) * 5; // Round up to nearest 5

    const feature1Name = this.data.featureName || this.languageService.instant('analyze.feature1');
    const feature2Name = this.data.featureName2 || this.languageService.instant('analyze.feature2');
    const populationLabel = this.languageService.instant('analyze.populationPercent');

    this.chartData = {
      labels: labels,
      datasets: [
        {
          label: populationLabel,
          data: weights1,
          backgroundColor: colors1,
          borderColor: '#ffffff',
          borderWidth: 1
        },
        {
          label: populationLabel,
          data: weights2,
          backgroundColor: colors2,
          borderColor: '#ffffff',
          borderWidth: 1
        }
      ]
    };

    this.chartOptions = {
      indexAxis: 'x',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: (context: any) => {
              const index = context[0].dataIndex;
              return sortedPersonas[index].name || '';
            },
            label: (context: any) => {
              const index = context.dataIndex;
              const datasetIndex = context.datasetIndex;
              const persona = sortedPersonas[index];
              const weight = datasetIndex === 0 ? persona.weight1 : persona.weight2;
              const indexValue = datasetIndex === 0 ? persona.index1 : persona.index2;
              const grade = this.getGrade(indexValue);
              const featureName = datasetIndex === 0 ? feature1Name : feature2Name;
              const ratingLabel = this.languageService.instant('analyze.rating');
              const populationLabel = this.languageService.instant('analyze.populationPercent');
              return [
                `${featureName}`,
                `${ratingLabel}: ${grade}`,
                `${populationLabel}: ${(weight * 100).toFixed(1)}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#ffffff',
            font: {
              size: 14
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          max: yAxisMax,
          ticks: {
            stepSize: yAxisMax <= 25 ? 5 : Math.ceil(yAxisMax / 10),
            color: '#ffffff',
            font: {
              size: 14
            },
            padding: 5
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false
          },
          title: {
            display: true,
            text: this.languageService.instant('analyze.populationPercent'),
            color: '#ffffff',
            font: {
              size: 14
            },
            padding: {
              top: 0,
              bottom: 0
            }
          }
        }
      }
    };

    // Update allPersonas to include all personas from both features for the list
    this.allPersonas = sortedPersonas.map(persona => ({
      name: persona.name,
      weight: Math.max(persona.weight1, persona.weight2),
      index: persona.index1 || persona.index2,
      score: persona.score1 || persona.score2
    } as PersonaBreakdown));
  }

  getGrade(index: number): string {
    return this.data.getGrade(index);
  }

  private getScoreColor(score: number): string {
    if (score < 480) {
      return 'rgb(23, 25, 63)'; // 0-7 min (default for < 480) - darkest
    } else if (score < 960) {
      return 'rgb(43, 40, 105)'; // 8-15 min (480-960s) - very dark
    } else if (score < 1440) {
      return 'rgb(74, 89, 160)'; // 16-23 min (960-1440s) - darker
    } else if (score < 1800) {
      return 'rgb(90, 135, 185)'; // 24-30 min (1440-1800s) - medium
    } else if (score < 2700) {
      return 'rgb(121, 194, 230)'; // 31-45 min (1800-2700s) - medium-light
    } else {
      return 'rgb(162, 210, 235)'; // 45+ min (2700+s) - lightest
    }
  }

  private getGradeColor(index: number): string {
    const indexValue = index / 100;
    if (indexValue <= 0) {
      return 'rgba(128, 128, 128, 0.7)'; // NaN or invalid
    } else if (indexValue < 0.35) {
      return 'rgba(50, 97, 45, 0.7)'; // Grade A (A+, A, A-)
    } else if (indexValue < 0.5) {
      return 'rgba(60, 176, 67, 0.7)'; // Grade B (B+, B, B-)
    } else if (indexValue < 0.71) {
      return 'rgba(238, 210, 2, 0.7)'; // Grade C (C+, C, C-)
    } else if (indexValue < 1.0) {
      return 'rgba(237, 112, 20, 0.7)'; // Grade D (D+, D, D-)
    } else if (indexValue < 1.41) {
      return 'rgba(194, 24, 7, 0.7)'; // Grade E (E+, E, E-)
    } else {
      return 'rgba(150, 86, 162, 0.7)'; // Grade F (F+, F, F-)
    }
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
