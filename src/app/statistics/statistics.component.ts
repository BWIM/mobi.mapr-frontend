import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { StatisticsService, ScoreEntry } from './statistics.service';
import { Subscription } from 'rxjs';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { LoadingService } from '../services/loading.service';
import { MultiSelectModule } from 'primeng/multiselect';
import { MapV2Service } from '../map-v2/map-v2.service';
import { PaginatorModule } from 'primeng/paginator';
import { GeocodingService } from '../services/geocoding.service';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ScoringService } from '../services/scoring.service';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [
    SharedModule,
    ScrollPanelModule,
    ButtonModule,
    ProgressSpinnerModule,
    MultiSelectModule,
    PaginatorModule
  ],
  templateUrl: './statistics.component.html'
})
export class StatisticsComponent implements OnInit, OnDestroy {
  visible: boolean = false;
  private subscription: Subscription = new Subscription();
  loading: boolean = false;
  
  // Cache for project version validity
  private _isProjectVersionValid: boolean = false;
  
  stateScores: ScoreEntry[] = [];
  countyScores: ScoreEntry[] = [];
  municipalityScores: ScoreEntry[] = [];
  filteredMunicipalityScores: ScoreEntry[] = [];
  
  // Pagination
  stateTotalRecords: number = 0;
  countyTotalRecords: number = 0;
  municipalityTotalRecords: number = 0;
  currentStatePage: number = 1;
  currentCountyPage: number = 1;
  currentMunicipalityPage: number = 1;
  rowsPerPage: number = 15;

  // Score type
  scoreType: 'pop' | 'avg' = 'pop';
  scoreTypeOptions: any[] = [];

  populationCategories = [
    { label: 'Landgemeinden (0-5.000)', value: 'small', min: 0, max: 5000 },
    { label: 'Kleine Kleinstädte (5.001-10.000)', value: 'small', min: 5001, max: 10000 },
    { label: 'Große Kleinstädte (10.001-20.000)', value: 'medium', min: 10001, max: 20000 },
    { label: 'Kleine Mittelstädte (20.001-50.000)', value: 'medium', min: 20001, max: 50000 },
    { label: 'Große Mittelstädte (50.001-100.000)', value: 'large', min: 50001, max: 100000 },
    { label: 'Kleinere Großstädte (100.001-500.000)', value: 'large', min: 100001, max: 500000 },
    { label: 'Große Großstädte (>500.000)', value: 'large', min: 500001, max: Infinity }
  ];
  selectedCategories: any[] = this.populationCategories;

  constructor(
    private statisticsService: StatisticsService,
    private mapService: MapV2Service,
    private loadingService: LoadingService,
    private translate: TranslateService,
    private geocodingService: GeocodingService,
    private messageService: MessageService,
    private scoringService: ScoringService
  ) {
    this.updateScoreTypeOptions();
    this.updateProjectVersionValidity();
    
    this.subscription.add(
      this.statisticsService.visible$.subscribe(visible => {
        const projectId = this.mapService.getCurrentProject();
        if (projectId) {
          this.visible = visible;
          if (visible) {
            this.updateProjectVersionValidity();
            if (this._isProjectVersionValid) {
              this.loadAllData();
            } else {
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Statistics are not available for this project.',
                life: 5000
              });
            }
          }
        }
      })
    );

    // Update options when language changes
    this.subscription.add(
      this.translate.onLangChange.subscribe(() => {
        this.updateScoreTypeOptions();
      })
    );
  }

  private updateProjectVersionValidity(): void {
    this._isProjectVersionValid = this.mapService.getProjectVersion() >= 0.7;
  }

  get isProjectVersionValid(): boolean {
    return this._isProjectVersionValid;
  }

  ngOnInit() {}

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  private loadAllData(): void {
    this.loading = true;
    this.loadingService.startLoading();

    const projectId = this.mapService.getCurrentProject();
    if (!projectId) {
      console.error('No project ID available');
      this.loading = false;
      this.loadingService.stopLoading();
      return;
    }

    Promise.all([
      this.loadStateScores(projectId),
      this.loadCountyScores(projectId),
      this.loadMunicipalityScores(projectId)
    ]).finally(() => {
      this.loading = false;
      this.loadingService.stopLoading();
    });
  }

  private async loadStateScores(projectId: string): Promise<void> {
    try {
      const response = await this.statisticsService.getStateScores(projectId, this.currentStatePage, this.scoreType).toPromise();
      if (response) {
        this.stateTotalRecords = response.count;
        this.stateScores = response.results.map(score => 
          this.statisticsService.convertToScoreEntry(score, 'state')
        );
      }
    } catch (error) {
      console.error('Error loading state scores:', error);
    }
  }

  private async loadCountyScores(projectId: string): Promise<void> {
    try {
      const response = await this.statisticsService.getCountyScores(projectId, this.currentCountyPage, this.scoreType).toPromise();
      if (response) {
        this.countyTotalRecords = response.count;
        this.countyScores = response.results.map(score => 
          this.statisticsService.convertToScoreEntry(score, 'county')
        );
      }
    } catch (error) {
      console.error('Error loading county scores:', error);
    }
  }

  private async loadMunicipalityScores(projectId: string): Promise<void> {
    try {
      const response = await this.statisticsService.getMunicipalityScores(projectId, this.currentMunicipalityPage, this.scoreType).toPromise();
      if (response) {
        this.municipalityTotalRecords = response.count;
        this.municipalityScores = response.results.map(score => 
          this.statisticsService.convertToScoreEntry(score, 'municipality')
        );
        this.applyPopulationFilter();
      }
    } catch (error) {
      console.error('Error loading municipality scores:', error);
    }
  }

  onStatePageChange(event: any): void {
    this.currentStatePage = event.page + 1;
    const projectId = this.mapService.getCurrentProject();
    if (projectId) {
      this.loadStateScores(projectId);
    }
  }

  onCountyPageChange(event: any): void {
    this.currentCountyPage = event.page + 1;
    const projectId = this.mapService.getCurrentProject();
    if (projectId) {
      this.loadCountyScores(projectId);
    }
  }

  onMunicipalityPageChange(event: any): void {
    this.currentMunicipalityPage = event.page + 1;
    const projectId = this.mapService.getCurrentProject();
    if (projectId) {
      this.loadMunicipalityScores(projectId);
    }
  }

  onScoreTypeChange(type: 'pop' | 'avg'): void {
    this.scoreType = type;
    const projectId = this.mapService.getCurrentProject();
    if (projectId) {
      this.loadAllData();
    }
  }

  onPopulationCategoryChange(): void {
    this.applyPopulationFilter();
  }

  private applyPopulationFilter(): void {
    if (this.selectedCategories.length === 0) {
      this.filteredMunicipalityScores = this.municipalityScores;
      return;
    }

    this.filteredMunicipalityScores = this.municipalityScores.filter(score => {
      if (!score.population) return false;
      return this.selectedCategories.some(category => {
        const { min, max } = category;
        return score.population && score.population > min && score.population <= max;
      });
    });
  }



  getScoreName(score: number): string {
    return this.scoringService.getScoreName(score);
  }

  getScoreColor(score: number): string {
    return this.scoringService.getScoreColor(score);
  }

  async onFeatureClick(entry: ScoreEntry): Promise<void> {
    this.statisticsService.visible = false;
    this.loadingService.startLoading();

    try {
      const map = this.mapService.getMap();
      if (!map) return;

      // Determine target zoom level based on administrative level
      let targetZoom = 7.5;
      if (entry.level === 'county') {
        targetZoom = 10;
      } else if (entry.level === 'municipality') {
        targetZoom = 12;
      }

      // Use geocoding to find the location
      let searchQuery = entry.name;
      
      // Add county information for municipalities
      if (entry.level === 'municipality' && entry.county) {
        searchQuery = `${entry.name}, ${entry.county}`;
      }
      
      // Always add Germany to the query
      searchQuery += ', Germany';
      
      const results = await firstValueFrom(this.geocodingService.search(searchQuery));
      
      if (results.length > 0) {
        const bestMatch = results[0];
        map.flyTo({
          center: [bestMatch.lng, bestMatch.lat],
          zoom: targetZoom,
          duration: 2000
        });
      } else {
        console.warn('No location found for:', searchQuery);
      }
    } catch (error) {
      console.error('Error finding feature location:', error);
    } finally {
      this.loadingService.stopLoading();
    }
  }

  private updateScoreTypeOptions(): void {
    this.scoreTypeOptions = [
      { label: this.translate.instant('STATISTICS.POPULATION_WEIGHTED'), value: 'pop' },
      { label: this.translate.instant('STATISTICS.AREA_WEIGHTED'), value: 'avg' }
    ];
  }
}