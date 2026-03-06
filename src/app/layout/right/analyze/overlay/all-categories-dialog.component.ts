import { Component, Inject, OnInit, AfterViewInit, ViewChild, ChangeDetectorRef, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { SharedModule } from '../../../../shared/shared.module';
import { CommonModule } from '@angular/common';
import { AnalyzeService, CategoryScore } from '../../../../services/analyze.service';
import { catchError, of } from 'rxjs';
import { ChartModule } from 'primeng/chart';
import { UIChart } from 'primeng/chart';
import { PlacesDialogComponent, PlacesDialogData } from '../places/places-dialog.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

export interface AllCategoriesDialogData {
  featureType: 'municipality' | 'hexagon' | 'county' | 'state';
  featureId: number;
  profileCombinationId: number;
  categoryIds?: number[];
  personaId?: number;
  isScoreMode: boolean;
  featureName?: string;
  getGrade: (index: number) => string;
  // Comparison mode fields
  featureId2?: number;
  featureName2?: string;
  isComparisonMode?: boolean;
}

@Component({
  selector: 'app-all-categories-dialog',
  standalone: true,
  imports: [
    SharedModule,
    CommonModule,
    ChartModule,
    TranslateModule,
  ],
  templateUrl: './all-categories-dialog.component.html',
  styleUrl: './all-categories-dialog.component.css'
})
export class AllCategoriesDialogComponent implements OnInit, AfterViewInit {
  allCategories: CategoryScore[] = [];
  allCategories2: CategoryScore[] = [];
  isLoading: boolean = false;
  isLoading2: boolean = false;
  error: string | null = null;
  error2: string | null = null;
  chartData: any = null;
  chartOptions: any = null;
  
  @ViewChild('allCategoriesChart') allCategoriesChart?: UIChart;

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

  private translate = inject(TranslateService);

  constructor(
    public dialogRef: MatDialogRef<AllCategoriesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AllCategoriesDialogData,
    private analyzeService: AnalyzeService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.loadAllCategories();
    if (this.data.isComparisonMode && this.data.featureId2) {
      this.loadAllCategories2();
    }
  }

  ngAfterViewInit() {
    // Resize chart after view initialization to ensure it uses full container height
    setTimeout(() => {
      if (this.allCategoriesChart) {
        this.allCategoriesChart.reinit();
      }
    }, 100);
  }

  private loadAllCategories(): void {
    this.isLoading = true;
    this.error = null;

    this.analyzeService.getAnalyze({
      feature_type: this.data.featureType,
      feature_id: this.data.featureId,
      profile_combination_id: this.data.profileCombinationId,
      category_ids: this.data.categoryIds,
      persona_id: this.data.personaId,
      top5: false
    }).pipe(
      catchError((error) => {
        console.error('Error loading all categories:', error);
        if (error.status === 404) {
          this.error = this.translate.instant('analyze.allCategoriesDialog.categoriesNotFound');
        } else if (error.status === 503) {
          this.error = this.translate.instant('analyze.allCategoriesDialog.dataNotLoaded');
        } else {
          this.error = this.translate.instant('analyze.allCategoriesDialog.errorLoadingCategories');
        }
        return of(null);
      })
    ).subscribe((response) => {
      this.isLoading = false;
      if (response && response.categories) {
        this.allCategories = [...response.categories]
          .sort((a, b) => b.weight - a.weight);
        if (this.data.isComparisonMode && this.allCategories2.length > 0) {
          this.initializeComparisonChart();
        } else if (!this.data.isComparisonMode) {
          this.initializeChart(this.allCategories);
        }
        // Resize chart after data is loaded
        setTimeout(() => {
          if (this.allCategoriesChart) {
            this.allCategoriesChart.reinit();
          }
        }, 100);
      }
    });
  }

  private loadAllCategories2(): void {
    if (!this.data.featureId2) {
      return;
    }

    this.isLoading2 = true;
    this.error2 = null;

    this.analyzeService.getAnalyze({
      feature_type: this.data.featureType,
      feature_id: this.data.featureId2,
      profile_combination_id: this.data.profileCombinationId,
      category_ids: this.data.categoryIds,
      persona_id: this.data.personaId,
      top5: false
    }).pipe(
      catchError((error) => {
        console.error('Error loading all categories 2:', error);
        if (error.status === 404) {
          this.error2 = this.translate.instant('analyze.allCategoriesDialog.categoriesNotFound');
        } else if (error.status === 503) {
          this.error2 = this.translate.instant('analyze.allCategoriesDialog.dataNotLoaded');
        } else {
          this.error2 = this.translate.instant('analyze.allCategoriesDialog.errorLoadingCategories');
        }
        return of(null);
      })
    ).subscribe((response) => {
      this.isLoading2 = false;
      if (response && response.categories) {
        this.allCategories2 = [...response.categories]
          .sort((a, b) => b.weight - a.weight);
        if (this.allCategories.length > 0) {
          this.initializeComparisonChart();
        }
        // Resize chart after data is loaded
        setTimeout(() => {
          if (this.allCategoriesChart) {
            this.allCategoriesChart.reinit();
          }
        }, 100);
      }
    });
  }

  private initializeChart(categories: CategoryScore[]): void {
    if (!categories || categories.length === 0) {
      this.chartData = null;
      return;
    }

    const labels = categories.map((_, index) => (index + 1).toString());
    // Convert weights from decimals (0-1) to percentages (0-100)
    const weights = categories.map(cat => cat.weight * 100);

    // Get colors based on current map visualization type
    // Colors match exactly with map.service.ts getScoreFillColorExpression() and getIndexFillColorExpression()
    const colors = categories.map((cat) => {
      if (this.data.isScoreMode) {
        // Use score-based colors (blue colors for zeit bewertung from getScoreFillColorExpression)
        // Match exact color breaks from map.service.ts
        const scoreValue = cat.score;
        if (scoreValue < 480) {
          return 'rgb(23, 25, 63)'; // 0-7 min (default for < 480) - darkest
        } else if (scoreValue < 960) {
          return 'rgb(43, 40, 105)'; // 8-15 min (480-960s) - very dark
        } else if (scoreValue < 1440) {
          return 'rgb(74, 89, 160)'; // 16-23 min (960-1440s) - darker
        } else if (scoreValue < 1800) {
          return 'rgb(90, 135, 185)'; // 24-30 min (1440-1800s) - medium
        } else if (scoreValue < 2700) {
          return 'rgb(121, 194, 230)'; // 31-45 min (1800-2700s) - medium-light
        } else {
          return 'rgb(162, 210, 235)'; // 45+ min (2700+s) - lightest
        }
      } else {
        // Use index-based colors (from getIndexFillColorExpression)
        // Match exact color breaks from map.service.ts
        const indexValue = cat.index / 100;
        if (indexValue <= 0) {
          return 'rgba(128, 128, 128, 1)'; // NaN or invalid
        } else if (indexValue < 0.35) {
          return 'rgba(50, 97, 45, 1)'; // Grade A (A+, A, A-)
        } else if (indexValue < 0.5) {
          return 'rgba(60, 176, 67, 1)'; // Grade B (B+, B, B-)
        } else if (indexValue < 0.71) {
          return 'rgba(238, 210, 2, 1)'; // Grade C (C+, C, C-)
        } else if (indexValue < 1.0) {
          return 'rgba(237, 112, 20, 1)'; // Grade D (D+, D, D-)
        } else if (indexValue < 1.41) {
          return 'rgba(194, 24, 7, 1)'; // Grade E (E+, E, E-)
        } else {
          return 'rgba(150, 86, 162, 1)'; // Grade F (F+, F, F-)
        }
      }
    });

    // Find max weight to set appropriate y-axis max
    const maxWeight = Math.max(...weights);
    const yAxisMax = Math.ceil(maxWeight / 5) * 5; // Round up to nearest 5

    const relevanceLabel = this.translate.instant('analyze.relevancePercent');
    this.chartData = {
      labels: labels,
      datasets: [
        {
          label: relevanceLabel,
          data: weights,
          backgroundColor: colors,
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
            title: () => '',
            label: (context: any) => {
              const index = context.dataIndex;
              const activityLabel = this.translate.instant('analyze.activity');
              const relevanceLabel = this.translate.instant('analyze.relevance');
              const minutesLabel = this.translate.instant('map.popup.minutes');
              
              // Use appropriate label based on mode
              const ratingLabel = this.data.isScoreMode 
                ? this.translate.instant('map.popup.score')
                : this.translate.instant('map.popup.index');
              
              let ratingValue: string;
              if (this.data.isScoreMode) {
                // Convert score from seconds to minutes
                const scoreValue = categories[index].score;
                const minutes = Math.round(scoreValue / 60);
                ratingValue = `${minutes} ${minutesLabel}`;
              } else {
                // Use grade for quality mode
                const grade = this.getGrade(categories[index].index);
                ratingValue = grade;
              }
              
              return [
                `${activityLabel}: ${categories[index].category_name}`,
                `${ratingLabel} ${ratingValue}`,
                `${relevanceLabel}: ${weights[index].toFixed(1)}%`
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
              size: 12
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
              size: 12
            },
            padding: 5
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false
          },
          title: {
            display: true,
            text: this.translate.instant('analyze.relevancePercent'),
            color: '#ffffff',
            font: {
              size: 12
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
      return 'rgba(128, 128, 128, 1)'; // NaN or invalid
    } else if (indexValue < 0.35) {
      return 'rgba(50, 97, 45, 1)'; // Grade A (A+, A, A-)
    } else if (indexValue < 0.5) {
      return 'rgba(60, 176, 67, 1)'; // Grade B (B+, B, B-)
    } else if (indexValue < 0.71) {
      return 'rgba(238, 210, 2, 1)'; // Grade C (C+, C, C-)
    } else if (indexValue < 1.0) {
      return 'rgba(237, 112, 20, 1)'; // Grade D (D+, D, D-)
    } else if (indexValue < 1.41) {
      return 'rgba(194, 24, 7, 1)'; // Grade E (E+, E, E-)
    } else {
      return 'rgba(150, 86, 162, 1)'; // Grade F (F+, F, F-)
    }
  }

  private initializeComparisonChart(): void {
    if (!this.allCategories || this.allCategories.length === 0 || 
        !this.allCategories2 || this.allCategories2.length === 0) {
      this.chartData = null;
      return;
    }

    // Get all unique categories from both features, sorted by combined weight
    const categoryMap = new Map<number, { category_id: number; name: string; weight1: number; weight2: number; index1: number; index2: number; score1: number; score2: number }>();
    
    this.allCategories.forEach(cat => {
      categoryMap.set(cat.category_id, {
        category_id: cat.category_id,
        name: cat.category_name,
        weight1: cat.weight,
        weight2: 0,
        index1: cat.index,
        index2: 0,
        score1: cat.score,
        score2: 0
      });
    });
    
    this.allCategories2.forEach(cat => {
      const existing = categoryMap.get(cat.category_id);
      if (existing) {
        existing.weight2 = cat.weight;
        existing.index2 = cat.index;
        existing.score2 = cat.score;
      } else {
        categoryMap.set(cat.category_id, {
          category_id: cat.category_id,
          name: cat.category_name,
          weight1: 0,
          weight2: cat.weight,
          index1: 0,
          index2: cat.index,
          score1: 0,
          score2: cat.score
        });
      }
    });

    // Sort by combined weight
    const sortedCategories = Array.from(categoryMap.values())
      .sort((a, b) => Math.max(b.weight1, b.weight2) - Math.max(a.weight1, a.weight2));

    const labels = sortedCategories.map((_, index) => (index + 1).toString());
    const weights1 = sortedCategories.map(cat => cat.weight1 * 100);
    const weights2 = sortedCategories.map(cat => cat.weight2 * 100);

    // Get colors based on current map visualization type - same colors as before
    const colors1 = sortedCategories.map((cat) => {
      if (this.data.isScoreMode) {
        return this.getScoreColor(cat.score1);
      } else {
        return this.getGradeColor(cat.index1);
      }
    });

    const colors2 = sortedCategories.map((cat) => {
      if (this.data.isScoreMode) {
        return this.getScoreColor(cat.score2);
      } else {
        return this.getGradeColor(cat.index2);
      }
    });

    // Find max weight to set appropriate y-axis max
    const maxWeight = Math.max(...weights1, ...weights2);
    const yAxisMax = Math.ceil(maxWeight / 5) * 5; // Round up to nearest 5

    const feature1Name = this.data.featureName || this.translate.instant('analyze.feature1');
    const feature2Name = this.data.featureName2 || this.translate.instant('analyze.feature2');
    const relevanceLabel = this.translate.instant('analyze.relevancePercent');

    this.chartData = {
      labels: labels,
      datasets: [
        {
          label: relevanceLabel,
          data: weights1,
          backgroundColor: colors1,
          borderColor: '#ffffff',
          borderWidth: 1
        },
        {
          label: relevanceLabel,
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
              return sortedCategories[index].name || '';
            },
            label: (context: any) => {
              const index = context.dataIndex;
              const datasetIndex = context.datasetIndex;
              const category = sortedCategories[index];
              const weight = datasetIndex === 0 ? category.weight1 : category.weight2;
              const indexValue = datasetIndex === 0 ? category.index1 : category.index2;
              const scoreValue = datasetIndex === 0 ? category.score1 : category.score2;
              const featureName = datasetIndex === 0 ? feature1Name : feature2Name;
              const relevanceLabel = this.translate.instant('analyze.relevance');
              const minutesLabel = this.translate.instant('map.popup.minutes');
              
              // Use appropriate label based on mode
              const ratingLabel = this.data.isScoreMode 
                ? this.translate.instant('map.popup.score')
                : this.translate.instant('map.popup.index');
              
              let ratingValue: string;
              if (this.data.isScoreMode) {
                // Convert score from seconds to minutes
                const minutes = Math.round(scoreValue / 60);
                ratingValue = `${minutes} ${minutesLabel}`;
              } else {
                // Use grade for quality mode
                const grade = this.getGrade(indexValue);
                ratingValue = grade;
              }
              
              return [
                `${featureName}`,
                `${ratingLabel} ${ratingValue}`,
                `${relevanceLabel}: ${(weight * 100).toFixed(1)}%`
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
              size: 12
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
              size: 12
            },
            padding: 5
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false
          },
          title: {
            display: true,
            text: this.translate.instant('analyze.relevancePercent'),
            color: '#ffffff',
            font: {
              size: 12
            },
            padding: {
              top: 0,
              bottom: 0
            }
          }
        }
      }
    };

    // Update allCategories to include all categories from both features for the list
    this.allCategories = sortedCategories.map(cat => ({
      category_id: cat.category_id,
      category_name: cat.name,
      weight: Math.max(cat.weight1, cat.weight2),
      index: cat.index1 || cat.index2,
      score: cat.score1 || cat.score2
    } as CategoryScore));
  }


  isPlacesButtonEnabled(): boolean {
    return this.data.featureType === 'hexagon' || this.data.featureType === 'municipality';
  }

  onChartDataSelect(event: any): void {
    if (!event || !event.element || event.element.index === undefined) {
      return;
    }

    const clickedIndex = event.element.index;
    if (clickedIndex < 0 || clickedIndex >= this.allCategories.length) {
      return;
    }

    const clickedCategory = this.allCategories[clickedIndex];
    if (!clickedCategory) {
      return;
    }

    // Use category_id directly from the API response
    if (!clickedCategory.category_id) {
      console.warn('Category ID not available for category:', clickedCategory.category_name);
      return;
    }

    // Open places overlay with the specific category_id
    this.openPlacesOverlay(clickedCategory.category_id, clickedCategory.category_name);
  }

  onCategoryNameClick(category: CategoryScore): void {
    if (!category) {
      return;
    }

    // Use category_id directly from the API response
    if (!category.category_id) {
      console.warn('Category ID not available for category:', category.category_name);
      return;
    }

    // Open places overlay with the specific category_id
    this.openPlacesOverlay(category.category_id, category.category_name);
  }

  openPlacesOverlay(categoryId?: number, categoryName?: string): void {
    // Always open the places dialog - it will show a hint for unsupported feature types (state/county)
    const placesData: PlacesDialogData = {
      featureType: this.data.featureType,
      featureId: this.data.featureId,
      profileCombinationId: this.data.profileCombinationId,
      categoryIds: categoryId ? [categoryId] : this.data.categoryIds,
      personaId: this.data.personaId,
      categoryNames: categoryName || ''
    };

    this.dialog.open(PlacesDialogComponent, {
      width: '85vw',
      maxWidth: '1200px',
      maxHeight: '85vh',
      panelClass: 'places-dialog-panel',
      data: placesData
    });
  }

  openLegendInfo(): void {
    // Simple alert for now - can be enhanced with a proper dialog later
    const message = this.data.isScoreMode
      ? this.translate.instant('map.legend.time.description')
      : this.translate.instant('map.legend.quality.description');
    
    // For now, just log - can be replaced with a proper dialog
    console.log(message);
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
