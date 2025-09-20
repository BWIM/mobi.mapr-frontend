import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { StatisticsService, ScoreEntry } from './statistics.service';
import { Subscription } from 'rxjs';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { LoadingService } from '../services/loading.service';
import { FormsModule } from '@angular/forms';

import { MapV2Service } from '../map-v2/map-v2.service';
import { PaginatorModule } from 'primeng/paginator';
import { GeocodingService } from '../services/geocoding.service';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { IndexService } from '../services/index.service';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [
    SharedModule,
    ScrollPanelModule,
    ButtonModule,
    ProgressSpinnerModule,
    PaginatorModule,
    FormsModule
  ],
  templateUrl: './statistics.component.html'
})
export class StatisticsComponent implements OnInit, OnDestroy {
  visible: boolean = false;
  private subscription: Subscription = new Subscription();
  private dataLoadingSubscriptions: Subscription[] = [];
  loading: boolean = false;
  backgroundLoading: boolean = false;

  // AbortController for cancelling API requests
  private abortController: AbortController | null = null;

  stateScores: ScoreEntry[] = [];
  countyScores: ScoreEntry[] = [];
  municipalityScores: ScoreEntry[] = [];
  filteredMunicipalityScores: ScoreEntry[] = [];
  filteredCountyScores: ScoreEntry[] = [];

  // Pagination
  stateTotalRecords: number = 0;
  countyTotalRecords: number = 0;
  municipalityTotalRecords: number = 0;
  currentStatePage: number = 1;
  currentCountyPage: number = 1;
  currentMunicipalityPage: number = 1;
  rowsPerPage: number = 50;

  // Score type
  scoreType: 'pop' | 'avg' = 'pop';
  scoreTypeOptions: any[] = [];

  populationCategories = [
    { label: 'Landgemeinden (0-5.000)', value: 'small', min: 0, max: 5000, displayText: '0-5K' },
    { label: 'Kleine Kleinstädte (5.001-10.000)', value: 'small', min: 5001, max: 10000, displayText: '5-10K' },
    { label: 'Große Kleinstädte (10.001-20.000)', value: 'medium', min: 10001, max: 20000, displayText: '10-20K' },
    { label: 'Kleine Mittelstädte (20.001-50.000)', value: 'medium', min: 20001, max: 50000, displayText: '20-50K' },
    { label: 'Große Mittelstädte (50.001-100.000)', value: 'large', min: 50001, max: 100000, displayText: '50-100K' },
    { label: 'Kleinere Großstädte (100.001-500.000)', value: 'large', min: 100001, max: 500000, displayText: '100-500K' },
    { label: 'Große Großstädte (>500.000)', value: 'large', min: 500001, max: Infinity, displayText: '>500K' }
  ];
  selectedCategories: any[] = this.populationCategories;

  constructor(
    private statisticsService: StatisticsService,
    private mapService: MapV2Service,
    private loadingService: LoadingService,
    private translate: TranslateService,
    private geocodingService: GeocodingService,
    private messageService: MessageService,
    private indexService: IndexService
  ) {
    this.updateScoreTypeOptions();

    this.subscription.add(
      this.statisticsService.visible$.subscribe(visible => {
        const projectId = this.mapService.getCurrentProject();
        if (projectId) {
          this.visible = visible;
          if (visible) {
            this.loadAllData();
          } else {
            this.resetUI();
            // Cancel all ongoing requests when dialog is closed
            this.cancelAllDataRequests();
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

  ngOnInit() { }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.cancelAllDataRequests();
  }

  private cancelAllDataRequests(): void {
    // Cancel all ongoing data loading requests
    this.dataLoadingSubscriptions.forEach(sub => sub.unsubscribe());
    this.dataLoadingSubscriptions = [];
    this.backgroundLoading = false;
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

  private resetUI(): void {
    this.stateScores = [];
    this.countyScores = [];
    this.municipalityScores = [];
    this.filteredMunicipalityScores = [];
    this.filteredCountyScores = [];
    this.selectedCategories = this.populationCategories;
  }

  private async loadStateScores(projectId: string): Promise<void> {
    try {
      const subscription = this.statisticsService.getStateScores(projectId, 0, 200, this.scoreType)
        .subscribe({
          next: (response) => {
            if (response) {
              this.stateTotalRecords = response.count;
              this.stateScores = response.results.map((score, index) =>
                this.statisticsService.convertToScoreEntry(score, 'state', index + 1)
              );
            }
          },
          error: (error) => {
            console.error('Error loading state scores:', error);
          }
        });

      this.dataLoadingSubscriptions.push(subscription);
    } catch (error) {
      console.error('Error loading state scores:', error);
    }
  }

  private async loadCountyScores(projectId: string): Promise<void> {
    try {
      // Load first batch immediately for better UX
      const subscription = this.statisticsService.getCountyScores(projectId, 0, 200, this.scoreType)
        .subscribe({
          next: (firstResponse) => {
            if (firstResponse && firstResponse.results.length > 0) {
              // Display first batch immediately
              this.countyScores = firstResponse.results.map((score, index) =>
                this.statisticsService.convertToScoreEntry(score, 'county', index + 1)
              );
              this.countyTotalRecords = firstResponse.count;

              // Apply filter to first batch
              this.applyPopulationFilter();

              // Load remaining data in background
              this.loadRemainingCounties(projectId, 200);
            }
          },
          error: (error) => {
            console.error('Error loading county scores:', error);
          }
        });

      this.dataLoadingSubscriptions.push(subscription);
    } catch (error) {
      console.error('Error loading county scores:', error);
    }
  }

  private async loadRemainingCounties(projectId: string, startOffset: number): Promise<void> {
    try {
      this.backgroundLoading = true;
      let currentOffset = startOffset;
      let hasMoreData = true;

      while (hasMoreData) {
        const subscription = this.statisticsService.getCountyScores(projectId, currentOffset, 200, this.scoreType)
          .subscribe({
            next: (response) => {
              if (response && response.results.length > 0) {
                // Add new results to existing array
                const newScores = response.results.map((score, index) =>
                  this.statisticsService.convertToScoreEntry(score, 'county', this.countyScores.length + index + 1)
                );
                this.countyScores = this.countyScores.concat(newScores);

                // Reapply filter to include new data
                this.applyPopulationFilter();

                currentOffset += 200;

                // Check if we've reached the end
                if (response.results.length < 200) { // API limit is 200
                  hasMoreData = false;
                }
              } else {
                hasMoreData = false;
              }
            },
            error: (error) => {
              console.error('Error loading remaining counties:', error);
              hasMoreData = false;
            }
          });

        this.dataLoadingSubscriptions.push(subscription);

        // Wait for this request to complete before continuing
        await new Promise<void>((resolve) => {
          subscription.add(() => resolve());
        });
      }
    } catch (error) {
      console.error('Error loading remaining counties:', error);
    } finally {
      this.backgroundLoading = false;
    }
  }

  private async loadMunicipalityScores(projectId: string): Promise<void> {
    try {
      // Load first batch immediately for better UX
      const subscription = this.statisticsService.getMunicipalityScores(projectId, 0, 200, this.scoreType)
        .subscribe({
          next: (firstResponse) => {
            if (firstResponse && firstResponse.results.length > 0) {
              // Display first batch immediately
              this.municipalityScores = firstResponse.results.map((score, index) =>
                this.statisticsService.convertToScoreEntry(score, 'municipality', index + 1)
              );
              this.municipalityTotalRecords = firstResponse.count;

              // Apply filter to first batch
              this.applyPopulationFilter();

              // Load remaining data in background
              this.loadRemainingMunicipalities(projectId, 200);
            }
          },
          error: (error) => {
            console.error('Error loading municipality scores:', error);
          }
        });

      this.dataLoadingSubscriptions.push(subscription);
    } catch (error) {
      console.error('Error loading municipality scores:', error);
    }
  }

  private async loadRemainingMunicipalities(projectId: string, startOffset: number): Promise<void> {
    try {
      this.backgroundLoading = true;
      let currentOffset = startOffset;
      let hasMoreData = true;

      while (hasMoreData) {
        const subscription = this.statisticsService.getMunicipalityScores(projectId, currentOffset, 200, this.scoreType)
          .subscribe({
            next: (response) => {
              if (response && response.results.length > 0) {
                // Add new results to existing array
                const newScores = response.results.map((score, index) =>
                  this.statisticsService.convertToScoreEntry(score, 'municipality', this.municipalityScores.length + index + 1)
                );
                this.municipalityScores = this.municipalityScores.concat(newScores);

                // Reapply filter to include new data
                this.applyPopulationFilter();

                currentOffset += 200;

                // Check if we've reached the end
                if (response.results.length < 200) { // API limit is 200
                  hasMoreData = false;
                }
              } else {
                hasMoreData = false;
              }
            },
            error: (error) => {
              console.error('Error loading remaining municipalities:', error);
              hasMoreData = false;
            }
          });

        this.dataLoadingSubscriptions.push(subscription);

        // Wait for this request to complete before continuing
        await new Promise<void>((resolve) => {
          subscription.add(() => resolve());
        });
      }
    } catch (error) {
      console.error('Error loading remaining municipalities:', error);
    } finally {
      this.backgroundLoading = false;
    }
  }

  onStatePageChange(event: any): void {
    this.currentStatePage = event.page + 1;
    // For client-side pagination, we just update the current page
    // The data is already loaded
  }

  onCountyPageChange(event: any): void {
    this.currentCountyPage = event.page + 1;

    const maxPages = Math.ceil(this.filteredCountyScores.length / this.rowsPerPage);
    if (this.currentCountyPage > maxPages) {
      this.currentCountyPage = maxPages;
    }
  }

  onMunicipalityPageChange(event: any): void {
    console.log('onMunicipalityPageChange', event);
    this.currentMunicipalityPage = event.page + 1;

    const maxPages = Math.ceil(this.filteredMunicipalityScores.length / this.rowsPerPage);
    if (this.currentMunicipalityPage > maxPages) {
      this.currentMunicipalityPage = maxPages;
    }
  }

  onScoreTypeChange(type: 'pop' | 'avg'): void {
    this.scoreType = type;
    const projectId = this.mapService.getCurrentProject();
    if (projectId) {
      this.loadAllData();
    }
  }



  isCategorySelected(category: any): boolean {
    return this.selectedCategories.some(selected => selected.min === category.min && selected.max === category.max);
  }

  toggleCategory(category: any): void {
    if (this.isCategorySelected(category)) {
      this.selectedCategories = this.selectedCategories.filter(selected =>
        !(selected.min === category.min && selected.max === category.max)
      );
    } else {
      this.selectedCategories.push(category);
    }
    this.applyPopulationFilter();

    // Reset pagination when filter changes
    this.currentStatePage = 1;
    this.currentCountyPage = 1;
    this.currentMunicipalityPage = 1;
  }

  getPopulationSizeText(category: any): string {
    return category.displayText;
  }

  private applyPopulationFilter(): void {
    let filteredMunicipalities = this.municipalityScores;
    let filteredCounties = this.countyScores;

    // Apply population category filter
    if (this.selectedCategories.length > 0) {
      filteredMunicipalities = this.municipalityScores.filter(score => {
        if (!score.population) return false;
        return this.selectedCategories.some(category => {
          const { min, max } = category;
          return score.population && score.population > min && score.population <= max;
        });
      });

      filteredCounties = this.countyScores.filter(score => {
        if (!score.population) return false;
        return this.selectedCategories.some(category => {
          const { min, max } = category;
          return score.population && score.population > min && score.population <= max;
        });
      });
    }

    this.filteredMunicipalityScores = filteredMunicipalities;
    this.filteredCountyScores = filteredCounties;

    // Reset page counters when filtering
    this.currentStatePage = 1;
    this.currentCountyPage = 1;
    this.currentMunicipalityPage = 1;

    // Ensure current pages are valid after filtering
    this.adjustPaginationAfterFilter();
  }

  private adjustPaginationAfterFilter(): void {
    const maxCountyPages = Math.ceil(this.filteredCountyScores.length / this.rowsPerPage);
    const maxMunicipalityPages = Math.ceil(this.filteredMunicipalityScores.length / this.rowsPerPage);

    if (this.currentCountyPage > maxCountyPages && maxCountyPages > 0) {
      this.currentCountyPage = maxCountyPages;
    }
    if (this.currentMunicipalityPage > maxMunicipalityPages && maxMunicipalityPages > 0) {
      this.currentMunicipalityPage = maxMunicipalityPages;
    }
  }


  getIndexName(score: ScoreEntry): string {
    if (this.scoreType === 'pop') {
      return this.indexService.getIndexName(score.index_pop);
    } else {
      return this.indexService.getIndexName(score.index_avg);
    }
  }

  getIndexColor(score: ScoreEntry): string {
    if (this.scoreType === 'pop') {
      return this.indexService.getIndexColor(score.index_pop);
    } else {
      return this.indexService.getIndexColor(score.index_avg);
    }
  }

  get filteredCountyCount(): number {
    return this.filteredCountyScores.length;
  }

  get filteredMunicipalityCount(): number {
    return this.filteredMunicipalityScores.length;
  }

  get paginatedCountyScores(): ScoreEntry[] {
    const startIndex = (this.currentCountyPage - 1) * this.rowsPerPage;
    const endIndex = startIndex + this.rowsPerPage;
    return this.filteredCountyScores.slice(startIndex, endIndex);
  }

  get paginatedMunicipalityScores(): ScoreEntry[] {
    const startIndex = (this.currentMunicipalityPage - 1) * this.rowsPerPage;
    const endIndex = startIndex + this.rowsPerPage;
    return this.filteredMunicipalityScores.slice(startIndex, endIndex);
  }

  get paginatedStateScores(): ScoreEntry[] {
    const startIndex = (this.currentStatePage - 1) * this.rowsPerPage;
    const endIndex = startIndex + this.rowsPerPage;
    return this.stateScores.slice(startIndex, endIndex);
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