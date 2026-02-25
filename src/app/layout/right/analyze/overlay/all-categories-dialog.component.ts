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
  personaIds?: number[];
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
    { letter: 'A', color: 'rgba(50, 97, 45, 0.7)' },
    { letter: 'B', color: 'rgba(60, 176, 67, 0.7)' },
    { letter: 'C', color: 'rgba(238, 210, 2, 0.7)' },
    { letter: 'D', color: 'rgba(237, 112, 20, 0.7)' },
    { letter: 'E', color: 'rgba(194, 24, 7, 0.7)' },
    { letter: 'F', color: 'rgba(197, 136, 187, 0.7)' }
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
      persona_ids: this.data.personaIds,
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
    const colors = categories.map((cat) => {
      if (this.data.isScoreMode) {
        // Use score-based colors
        const scoreValue = cat.score;
        if (scoreValue <= 600) {
          return 'rgb(0,73,40)'; // Dark green - 0-10 min
        } else if (scoreValue <= 1200) {
          return 'rgb(60,140,100)'; // Darker medium green - 10-20 min
        } else if (scoreValue <= 1800) {
          return 'rgb(120,180,160)'; // Medium-light green - 20-30 min
        } else if (scoreValue <= 2400) {
          return 'rgb(160,140,180)'; // Purple-green transition - 30-40 min
        } else if (scoreValue <= 3000) {
          return 'rgb(180,100,160)'; // Medium purple - 40-50 min
        } else {
          return 'rgb(72,38,131)'; // Dark purple - 50-60 min
        }
      } else {
        // Use index-based colors
        const indexValue = cat.index / 100;
        if (indexValue <= 0) {
          return 'rgba(128, 128, 128, 0.7)'; // Transparent gray
        } else if (indexValue <= 0.35) {
          return 'rgba(50, 97, 45, 0.7)'; // Dark green
        } else if (indexValue <= 0.5) {
          return 'rgba(60, 176, 67, 0.7)'; // Green
        } else if (indexValue <= 0.71) {
          return 'rgba(238, 210, 2, 0.7)'; // Yellow
        } else if (indexValue <= 1) {
          return 'rgba(237, 112, 20, 0.7)'; // Orange
        } else if (indexValue <= 1.41) {
          return 'rgba(194, 24, 7, 0.7)'; // Red
        } else {
          return 'rgba(150, 86, 162, 0.7)'; // Purple
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
              const grade = this.getGrade(categories[index].index);
              const activityLabel = this.translate.instant('analyze.activity');
              const ratingLabel = this.translate.instant('analyze.rating');
              const relevanceLabel = this.translate.instant('analyze.relevance');
              return [
                `${activityLabel}: ${categories[index].category_name}`,
                `${ratingLabel}: ${grade}`,
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

  getTimeGradient(): string {
    return `linear-gradient(to right, 
      rgb(181, 212, 233) 0%, 
      rgb(147, 195, 224) 16.67%, 
      rgb(109, 173, 213) 33.33%, 
      rgb(75, 151, 201) 50%, 
      rgb(48, 126, 188) 66.67%, 
      rgb(24, 100, 170) 83.33%, 
      rgb(24, 100, 170) 100%)`;
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

  openPlacesOverlay(categoryId?: number, categoryName?: string): void {
    if (!this.isPlacesButtonEnabled()) {
      return;
    }

    const placesData: PlacesDialogData = {
      featureType: this.data.featureType,
      featureId: this.data.featureId,
      profileCombinationId: this.data.profileCombinationId,
      categoryIds: categoryId ? [categoryId] : this.data.categoryIds,
      personaIds: this.data.personaIds,
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
