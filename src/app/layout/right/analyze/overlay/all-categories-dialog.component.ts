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
  isLoading: boolean = false;
  error: string | null = null;
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
        this.initializeChart(this.allCategories);
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
          borderColor: colors,
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
