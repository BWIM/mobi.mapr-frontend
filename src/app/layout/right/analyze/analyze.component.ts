import { Component, OnInit, OnDestroy, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, catchError, of, forkJoin } from 'rxjs';
import { FeatureSelectionService } from '../../../shared/services/feature-selection.service';
import { MapService, FeatureInfoResponse } from '../../../services/map.service';
import { FilterConfigService } from '../../../services/filter-config.service';
import { AnalyzeService, AnalyzeResponse, CategoryScore } from '../../../services/analyze.service';
import { UIChart } from 'primeng/chart';
import { ChartModule } from 'primeng/chart';
import { MatDialog } from '@angular/material/dialog';
import { SharedModule } from '../../../shared/shared.module';
import { AllCategoriesDialogComponent, AllCategoriesDialogData } from './overlay/all-categories-dialog.component';

@Component({
  selector: 'app-analyze',
  imports: [CommonModule, ChartModule, SharedModule],
  templateUrl: './analyze.component.html',
  styleUrl: './analyze.component.css',
})
export class AnalyzeComponent implements OnInit, OnDestroy {
  selectedFeature: any | null = null;
  featureInfo: FeatureInfoResponse | null = null;
  isLoadingFeatureInfo: boolean = false;
  featureInfoError: string | null = null;
  
  // Analyze chart data
  analyzeData: AnalyzeResponse | null = null;
  isLoadingAnalyze: boolean = false;
  analyzeError: string | null = null;
  activitiesChartData: any = null;
  activitiesChartOptions: any = null;
  
  @ViewChild('activitiesChart') activitiesChart?: UIChart;
  
  private featureSelectionService = inject(FeatureSelectionService);
  private mapService = inject(MapService);
  private filterConfigService = inject(FilterConfigService);
  private analyzeService = inject(AnalyzeService);
  private dialog = inject(MatDialog);
  private featureSubscription?: Subscription;
  private featureInfoSubscription?: Subscription;
  private analyzeSubscription?: Subscription;
  private currentLoadingFeatureId: number | null = null;

  ngOnInit() {
    // Subscribe to feature selection changes
    this.featureSubscription = this.featureSelectionService.selectedMapLibreFeature$.subscribe(
      (feature) => {
        if (feature) {
          this.selectedFeature = feature;
          this.logFeatureInformation(feature);
          this.loadFeatureInfo(feature);
        } else {
          // Cancel any ongoing request
          if (this.featureInfoSubscription) {
            this.featureInfoSubscription.unsubscribe();
            this.featureInfoSubscription = undefined;
          }
          if (this.analyzeSubscription) {
            this.analyzeSubscription.unsubscribe();
            this.analyzeSubscription = undefined;
          }
          this.selectedFeature = null;
          this.featureInfo = null;
          this.featureInfoError = null;
          this.isLoadingFeatureInfo = false;
          this.currentLoadingFeatureId = null;
          this.analyzeData = null;
          this.activitiesChartData = null;
          this.isLoadingAnalyze = false;
          this.analyzeError = null;
        }
      }
    );
  }

  ngOnDestroy() {
    if (this.featureSubscription) {
      this.featureSubscription.unsubscribe();
    }
    if (this.featureInfoSubscription) {
      this.featureInfoSubscription.unsubscribe();
    }
    if (this.analyzeSubscription) {
      this.analyzeSubscription.unsubscribe();
    }
  }

  getGrade(index: number): string {
    const indexValue = index / 100;
    if (indexValue <= 0) return "Error";
    if (indexValue < 0.28) return "A+";
    if (indexValue < 0.32) return "A";
    if (indexValue < 0.35) return "A-";
    if (indexValue < 0.4) return "B+";
    if (indexValue < 0.45) return "B";
    if (indexValue < 0.5) return "B-";
    if (indexValue < 0.56) return "C+";
    if (indexValue < 0.63) return "C";
    if (indexValue < 0.71) return "C-";
    if (indexValue < 0.8) return "D+";
    if (indexValue < 0.9) return "D";
    if (indexValue < 1.0) return "D-";
    if (indexValue < 1.12) return "E+";
    if (indexValue < 1.26) return "E";
    if (indexValue < 1.41) return "E-";
    if (indexValue < 1.59) return "F+";
    if (indexValue < 1.78) return "F";
    return "F-";
  }

  private logFeatureInformation(feature: any): void {
    console.log('=== Feature Information ===');
    console.log('Name:', feature.properties.name || feature.properties.NAME || 'Unnamed');
    
    if (feature.properties.score !== undefined && feature.properties.score !== null) {
      const minutes = (feature.properties.score / 60).toFixed(1);
      console.log('Score:', feature.properties.score, 'seconds', `(${minutes} minutes)`);
    }
    
    if (feature.properties.index !== undefined && feature.properties.index !== null) {
      const indexValue = feature.properties.index / 100;
      console.log('Index:', feature.properties.index, `(${indexValue.toFixed(2)})`);
    }
    
    console.log('ID:', feature.properties.id);
    console.log('All Properties:', feature.properties);
    console.log('Geometry:', feature.geometry);
    console.log('===========================');
  }

  private loadFeatureInfo(feature: any): void {
    const map = this.mapService.getMap();
    if (!map) {
      console.warn('Map not available for feature info');
      return;
    }

    const featureIdRaw = feature.properties.id || feature.id;
    if (!featureIdRaw) {
      console.warn('Feature ID not available');
      return;
    }

    // Convert to number if needed
    const featureId = typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
    if (isNaN(featureId)) {
      console.warn('Invalid feature ID:', featureIdRaw);
      return;
    }

    // Prevent duplicate requests for the same feature
    if ((this.isLoadingFeatureInfo || this.isLoadingAnalyze) && this.currentLoadingFeatureId === featureId) {
      console.log('Feature data request already in progress for feature:', featureId);
      return;
    }

    // Cancel any existing requests
    if (this.featureInfoSubscription) {
      this.featureInfoSubscription.unsubscribe();
      this.featureInfoSubscription = undefined;
    }
    if (this.analyzeSubscription) {
      this.analyzeSubscription.unsubscribe();
      this.analyzeSubscription = undefined;
    }

    // Get current zoom level to determine feature type
    const zoom = map.getZoom();
    const featureType = this.mapService.getFeatureTypeFromZoom(zoom);

    // Get profile combination ID
    const profileCombinationId = this.filterConfigService.currentProfileCombinationID();
    if (!profileCombinationId) {
      console.warn('Profile combination ID not available');
      return;
    }

    // Get current filters
    const filters = this.filterConfigService.contentLayerFilters();
    if (!filters) {
      console.warn('Content layer filters not available');
      return;
    }

    // Mark that we're loading this feature
    this.currentLoadingFeatureId = featureId;
    this.isLoadingFeatureInfo = true;
    this.isLoadingAnalyze = true;
    this.featureInfoError = null;
    this.analyzeError = null;

    // Prepare both API calls
    const featureInfoRequest = this.mapService.getFeatureInfo({
      feature_type: featureType,
      feature_id: featureId,
      profile_combination_id: profileCombinationId,
      category_ids: filters.category_ids,
      persona_ids: filters.persona_ids,
      regiostar_ids: filters.regiostar_ids,
      state_ids: filters.state_ids
    }).pipe(
      catchError((error) => {
        console.error('Error loading feature info:', error);
        this.featureInfoError = error.status === 404 
          ? 'Feature information not found' 
          : error.status === 503
          ? 'Data not preloaded yet'
          : 'Error loading feature information';
        return of(null);
      })
    );

    const analyzeRequest = this.analyzeService.getAnalyze({
      feature_type: featureType,
      feature_id: featureId,
      profile_combination_id: profileCombinationId,
      category_ids: filters.category_ids,
      persona_ids: filters.persona_ids,
      top5: true
    }).pipe(
      catchError((error) => {
        console.error('Error loading analyze data:', error);
        this.analyzeError = error.status === 404 
          ? 'Analyze data not found' 
          : error.status === 503
          ? 'Data not preloaded yet'
          : 'Error loading analyze data';
        return of(null);
      })
    );

    // Run both requests in parallel
    this.featureInfoSubscription = forkJoin({
      featureInfo: featureInfoRequest,
      analyzeData: analyzeRequest
    }).subscribe(({ featureInfo, analyzeData }) => {
      this.isLoadingFeatureInfo = false;
      this.isLoadingAnalyze = false;
      this.currentLoadingFeatureId = null;
      
      // Update feature info
      this.featureInfo = featureInfo;
      
      // Update analyze data
      this.analyzeData = analyzeData;
      if (analyzeData && analyzeData.categories) {
        this.initializeActivitiesChart(analyzeData.categories);
      } else {
        this.activitiesChartData = null;
      }
      
      this.featureInfoSubscription = undefined;
    });
  }

  private initializeActivitiesChart(categories: CategoryScore[]): void {
    if (!categories || categories.length === 0) {
      this.activitiesChartData = null;
      return;
    }

    // Sort by weight descending and take top 5
    const sortedCategories = [...categories]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);

    const labels = sortedCategories.map((_, index) => (index + 1).toString());
    // Convert weights from decimals (0-1) to percentages (0-100)
    const weights = sortedCategories.map(cat => cat.weight * 100);
    const categoryNames = sortedCategories.map(cat => this.getCategoryDisplayName(cat.category_name));
    const scores = sortedCategories.map(cat => cat.score);

    // Get current map visualization type (index or score)
    const filters = this.filterConfigService.contentLayerFilters();
    const isScoreMode = filters?.feature_type === 'score';
    
    // Get colors based on current map visualization type
    const colors = sortedCategories.map((cat) => {
      if (isScoreMode) {
        // Use score-based colors (from getScoreFillColorExpression)
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
        // Use index-based colors (from getIndexFillColorExpression)
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

    this.activitiesChartData = {
      labels: labels,
      datasets: [
        {
          label: 'Relevanz (%)',
          data: weights,
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 1
        }
      ]
    };

    this.activitiesChartOptions = {
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
              const grade = this.getGradeFromIndex(sortedCategories[index].index);
              return [
                `Bewertung: ${grade}`,
                `Relevanz: ${weights[index].toFixed(1)}%`
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
          max: 25,
          ticks: {
            stepSize: 5,
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
            text: 'Relevanz (%)',
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

  private getGradeFromIndex(index: number): string {
    return this.getGrade(index);
  }

  getSortedCategories(): CategoryScore[] {
    if (!this.analyzeData || !this.analyzeData.categories) {
      return [];
    }
    return [...this.analyzeData.categories]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
  }

  openAllCategoriesOverlay(): void {
    if (!this.selectedFeature) {
      return;
    }

    const map = this.mapService.getMap();
    if (!map) {
      console.warn('Map not available for all categories');
      return;
    }

    const featureIdRaw = this.selectedFeature.properties.id || this.selectedFeature.id;
    if (!featureIdRaw) {
      console.warn('Feature ID not available');
      return;
    }

    const featureId = typeof featureIdRaw === 'string' ? parseInt(featureIdRaw, 10) : featureIdRaw;
    if (isNaN(featureId)) {
      console.warn('Invalid feature ID:', featureIdRaw);
      return;
    }

    const zoom = map.getZoom();
    const featureType = this.mapService.getFeatureTypeFromZoom(zoom);
    const profileCombinationId = this.filterConfigService.currentProfileCombinationID();
    
    if (!profileCombinationId) {
      console.warn('Profile combination ID not available');
      return;
    }

    const filters = this.filterConfigService.contentLayerFilters();
    if (!filters) {
      console.warn('Content layer filters not available');
      return;
    }

    const isScoreMode = filters?.feature_type === 'score';
    
    const dialogData: AllCategoriesDialogData = {
      featureType: featureType,
      featureId: featureId,
      profileCombinationId: profileCombinationId,
      categoryIds: filters.category_ids,
      personaIds: filters.persona_ids,
      isScoreMode: isScoreMode,
      getGrade: (index: number) => this.getGrade(index),
      getCategoryDisplayName: (categoryName: string) => this.getCategoryDisplayName(categoryName)
    };

    this.dialog.open(AllCategoriesDialogComponent, {
      width: '95vw',
      maxWidth: '1400px',
      maxHeight: '90vh',
      panelClass: 'all-categories-dialog-panel',
      data: dialogData
    });
  }

  /**
   * Converts snake_case category names to display names
   * Maps common category names to German display names
   */
  getCategoryDisplayName(categoryName: string): string {
    const categoryMap: { [key: string]: string } = {
      'daily_needs': 'täglicher Bedarf',
      'friends': 'Besuch/Freund*innen treffen',
      'general_shopping': 'Einkauf',
      'dog_walking': 'Hund ausführen',
      'medical_services': 'Medizinische Versorgung',
      'restaurant': 'Restaurant, Gaststätte, Mittagessen, Kneipe, Disco',
      'sport': 'Sport (selbst aktiv), Sportverein',
      'walking': 'Spaziergang, Spazierfahrt',
      'work': 'Arbeit',
      'education': 'Bildung',
      'leisure': 'Freizeit',
      'shopping': 'Einkauf',
      'health': 'Gesundheit',
      'culture': 'Kultur',
      'transport': 'Verkehr'
    };

    // Try to find in map first
    if (categoryMap[categoryName]) {
      return categoryMap[categoryName];
    }

    // Try to find in FilterConfigService categories
    const allCategories = this.filterConfigService.allCategories();
    const category = allCategories.find(cat => cat.name === categoryName || cat.wegezweck === categoryName);
    if (category && category.display_name) {
      return category.display_name;
    }

    // Fallback: convert snake_case to readable format
    return categoryName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
