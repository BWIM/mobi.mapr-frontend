import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { StatisticsService, ScoreEntry } from './statistics.service';
import { Subscription } from 'rxjs';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { LoadingService } from '../services/loading.service';
import { FormsModule } from '@angular/forms';
import { AutoCompleteModule } from 'primeng/autocomplete';

import { MapV2Service } from '../map-v2/map-v2.service';
import { PaginatorModule } from 'primeng/paginator';
import { GeocodingService } from '../services/geocoding.service';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { IndexService } from '../services/index.service';
import { ProjectsService } from '../projects/projects.service';
import { IconFieldModule } from 'primeng/iconfield';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [
    SharedModule,
    ScrollPanelModule,
    ButtonModule,
    ProgressSpinnerModule,
    PaginatorModule,
    FormsModule,
    AutoCompleteModule,
    IconFieldModule
  ],
  templateUrl: './statistics.component.html',
  styleUrls: ['./statistics.component.css']
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
  filteredCountyScores: ScoreEntry[] = [];

  // Pagination
  stateTotalRecords: number = 0;
  countyTotalRecords: number = 0;
  currentStatePage: number = 1;
  currentCountyPage: number = 1;
  rowsPerPage: number = 50;

  // Score type
  scoreType: 'pop' | 'avg' = 'pop';
  scoreTypeOptions: any[] = [];
  isScoreVisualization: boolean = false;

  // Gemeinde filter for municipalities
  selectedGemeinde: any = null;
  selectedGemeindeName: string = '';
  gemeindeNames: { [key: string]: number } = {};
  filteredGemeinden: any[] = [];
  noMunicipalityResults: boolean = false;

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
  populationFiltersCollapsed: boolean = true; // Collapsed by default

  constructor(
    private statisticsService: StatisticsService,
    private mapService: MapV2Service,
    private loadingService: LoadingService,
    private translate: TranslateService,
    private geocodingService: GeocodingService,
    private messageService: MessageService,
    private indexService: IndexService,
    private projectsService: ProjectsService
  ) {
    this.updateScoreTypeOptions();

    // Sync with current visualization type (index/score)
    this.isScoreVisualization = this.mapService.getVisualizationType() === 'score';
    this.subscription.add(
      this.mapService.visualizationType$.subscribe(type => {
        this.isScoreVisualization = type === 'score';
      })
    );

    this.subscription.add(
      this.statisticsService.visible$.subscribe(visible => {
        const projectId = this.mapService.getCurrentProject();
        if (projectId) {
          this.visible = visible;
          if (visible) {
            this.resetUI();
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
      this.loadMunicipalityScores(projectId),
      this.loadGemeindeNames()
    ]).finally(() => {
      this.loading = false;
      this.loadingService.stopLoading();
    });
  }

  private resetUI(): void {
    this.stateScores = [];
    this.countyScores = [];
    this.municipalityScores = [];
    this.filteredCountyScores = [];
    this.selectedCategories = this.populationCategories;
    this.selectedGemeinde = null;
    this.selectedGemeindeName = '';
    this.filteredGemeinden = [];
    this.noMunicipalityResults = false;
  }

  private async loadStateScores(projectId: string): Promise<void> {
    try {
      const subscription = this.statisticsService.getStateScores(projectId, 0, 200, this.scoreType)
        .subscribe({
          next: (response) => {
            if (response) {
              this.stateTotalRecords = response.count;
              const scores = response.results.map((score) =>
                this.statisticsService.convertToScoreEntry(score, 'state')
              );
              this.stateScores = this.calculateRankings(scores);
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
              const scores = firstResponse.results.map((score) =>
                this.statisticsService.convertToScoreEntry(score, 'county')
              );
              this.countyScores = this.calculateRankings(scores);
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
                const newScores = response.results.map((score) =>
                  this.statisticsService.convertToScoreEntry(score, 'county')
                );
                this.countyScores = this.countyScores.concat(newScores);

                // Recalculate rankings for all counties
                this.countyScores = this.calculateRankings(this.countyScores);

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
      // Only add population filters if not all categories are selected (meaning filters are active)
      const allCategoriesSelected = this.selectedCategories.length === this.populationCategories.length;
      const populationFilters = allCategoriesSelected ? undefined : this.selectedCategories.map(category => ({
        min: category.min,
        max: category.max
      }));

      // Get gemeinde ID from selected gemeinde
      const gemeindeId = this.selectedGemeinde ? this.selectedGemeinde.id : undefined;
      console.log('Loading municipality scores with gemeindeId:', gemeindeId);

      const subscription = this.statisticsService.getMunicipalityScores(projectId, this.scoreType, populationFilters, gemeindeId)
        .subscribe({
          next: (response) => {
            if (response && response.length > 0) {
              // Convert all results to ScoreEntry format
              const scores = response.map((score: any) =>
                this.statisticsService.convertToScoreEntry(score, 'municipality', score.rank)
              );
              // When filtering by gemeinde, use API rank directly; otherwise recalculate rankings
              if (gemeindeId) {
                // Use API rank when filtering by gemeinde
                this.municipalityScores = scores;
              } else {
                // Recalculate rankings for unfiltered results
                this.municipalityScores = this.calculateRankings(scores);
              }
              this.noMunicipalityResults = false;
            } else {
              // No results found
              this.municipalityScores = [];
              this.noMunicipalityResults = true;
            }
          },
          error: (error) => {
            console.error('Error loading municipality scores:', error);
            this.municipalityScores = [];
            this.noMunicipalityResults = true;
          }
        });

      this.dataLoadingSubscriptions.push(subscription);
    } catch (error) {
      console.error('Error loading municipality scores:', error);
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

    // Apply filter to counties (frontend filtering)
    this.applyPopulationFilter();

    // Reload municipality data with new filters (backend filtering)
    this.reloadMunicipalityData();

    // Reset pagination when filter changes
    this.currentStatePage = 1;
    this.currentCountyPage = 1;
  }


  private reloadMunicipalityData(): void {
    const projectId = this.mapService.getCurrentProject();
    if (projectId) {
      this.loadMunicipalityScores(projectId);
    }
  }

  private async loadGemeindeNames(): Promise<void> {
    try {
      const projectId = this.mapService.getCurrentProject();
      if (!projectId) {
        console.error('No project ID available');
        return;
      }

      const subscription = this.statisticsService.getGemeindeNames(projectId)
        .subscribe({
          next: (response) => {
            this.gemeindeNames = response;
            // Convert to array format for autocomplete
            this.filteredGemeinden = Object.keys(response).map(name => ({
              name: name,
              id: response[name]
            }));
          },
          error: (error) => {
            console.error('Error loading gemeinde names:', error);
          }
        });

      this.dataLoadingSubscriptions.push(subscription);
    } catch (error) {
      console.error('Error loading gemeinde names:', error);
    }
  }

  filterGemeinden(event: any): void {
    const query = event.query.toLowerCase();
    this.filteredGemeinden = Object.keys(this.gemeindeNames)
      .filter(name => name.toLowerCase().includes(query))
      .map(name => ({
        name: name,
        id: this.gemeindeNames[name]
      }))
      .slice(0, 50); // Limit to 50 results for performance
  }

  onGemeindeSelect(event: any): void {
    console.log('Gemeinde selected:', event);
    this.selectedGemeinde = event.value;
    this.selectedGemeindeName = event.value.name;
    this.reloadMunicipalityData();
  }

  onGemeindeClear(): void {
    this.selectedGemeinde = null;
    this.selectedGemeindeName = '';
    this.reloadMunicipalityData();
  }

  getPopulationSizeText(category: any): string {
    return category.displayText;
  }

  private applyPopulationFilter(): void {
    let filteredCounties = this.countyScores;

    // Apply population category filter to counties only (municipalities are filtered on backend)
    if (this.selectedCategories.length > 0) {
      filteredCounties = this.countyScores.filter(score => {
        if (!score.population) return false;
        return this.selectedCategories.some(category => {
          const { min, max } = category;
          return score.population && score.population > min && score.population <= max;
        });
      });
    }

    this.filteredCountyScores = filteredCounties;

    // Reset page counters when filtering
    this.currentStatePage = 1;
    this.currentCountyPage = 1;

    // Ensure current pages are valid after filtering
    this.adjustPaginationAfterFilter();
  }

  private adjustPaginationAfterFilter(): void {
    const maxCountyPages = Math.ceil(this.filteredCountyScores.length / this.rowsPerPage);

    if (this.currentCountyPage > maxCountyPages && maxCountyPages > 0) {
      this.currentCountyPage = maxCountyPages;
    }
  }


  getIndexName(score: ScoreEntry): string {
    const isCompareProject = this.isCompareProject();
    const indexValue = this.scoreType === 'pop' ? score.index_pop : score.index_avg;

    if (isCompareProject) {
      // For compare projects, return the actual index value formatted
      return indexValue.toFixed(2);
    } else {
      return this.indexService.getIndexName(indexValue);
    }
  }

  getScoreMinutes(score: ScoreEntry): string {
    const value = this.scoreType === 'pop' ? score.score_pop : score.score_avg;
    return (value / 60).toFixed(1);
  }

  getIndexColor(score: ScoreEntry): string {
    const isCompareProject = this.isCompareProject();

    if (isCompareProject) {
      // For compare projects, return no color (use default text color)
      return '';
    } else {
      if (this.scoreType === 'pop') {
        return this.indexService.getIndexColor(score.index_pop);
      } else {
        return this.indexService.getIndexColor(score.index_avg);
      }
    }
  }

  private isCompareProject(): boolean {
    const projectInfo = this.projectsService.getCurrentProjectInfo();
    return !!(projectInfo?.baseline_project_name || projectInfo?.comparison_project_name);
  }

  get filteredCountyCount(): number {
    return this.filteredCountyScores.length;
  }

  get municipalityCount(): number {
    return this.municipalityScores.length;
  }

  get paginatedCountyScores(): ScoreEntry[] {
    const startIndex = (this.currentCountyPage - 1) * this.rowsPerPage;
    const endIndex = startIndex + this.rowsPerPage;
    return this.filteredCountyScores.slice(startIndex, endIndex);
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

  /**
   * Calculates proper rankings based on the project type and visualization mode.
   * Three scenarios:
   * 1. Regular project with index visualization: rank by grade (A+, A, A-, etc.)
   * 2. Compare project: rank by index value (lower is better)
   * 3. Score visualization: rank by score value (higher is better)
   */
  private calculateRankings(scores: ScoreEntry[]): ScoreEntry[] {
    if (!scores || scores.length === 0) {
      return scores;
    }

    const isCompareProject = this.isCompareProject();

    if (isCompareProject) {
      // Scenario 2: Compare project - rank by index value (lower is better)
      const sortedScores = [...scores].sort((a, b) => {
        const aIndex = this.scoreType === 'pop' ? a.index_pop : a.index_avg;
        const bIndex = this.scoreType === 'pop' ? b.index_pop : b.index_avg;
        return aIndex - bIndex;
      });

      // Entries with the same index value get the same rank
      let currentRank = 1;
      let previousIndex: number | null = null;

      return sortedScores.map((score) => {
        const indexValue = this.scoreType === 'pop' ? score.index_pop : score.index_avg;

        // If this index is different from the previous one, increment rank
        if (previousIndex !== null && Math.abs(indexValue - previousIndex) > 0.0001) {
          currentRank++;
        }

        previousIndex = indexValue;

        return {
          ...score,
          rank: currentRank
        };
      });
    }

    if (this.isScoreVisualization) {
      // Scenario 3: Score visualization - rank by score value (lower is better, since score is in minutes)
      const sortedScores = [...scores].sort((a, b) => {
        const aScore = this.scoreType === 'pop' ? a.score_pop : a.score_avg;
        const bScore = this.scoreType === 'pop' ? b.score_pop : b.score_avg;
        return aScore - bScore; // Ascending order (lower is better)
      });

      // Group scores by their score value
      let currentRank = 1;
      let previousScore: number | null = null;

      return sortedScores.map((score) => {
        const scoreValue = this.scoreType === 'pop' ? score.score_pop : score.score_avg;

        // If this score is different from the previous one, increment rank
        if (previousScore !== null && Math.abs(scoreValue - previousScore) > 0.0001) {
          currentRank++;
        }

        previousScore = scoreValue;

        return {
          ...score,
          rank: currentRank
        };
      });
    }

    // Scenario 1: Regular project with index visualization - rank by grade (A+, A, A-, etc.)
    const sortedScores = [...scores].sort((a, b) => {
      const aIndex = this.scoreType === 'pop' ? a.index_pop : a.index_avg;
      const bIndex = this.scoreType === 'pop' ? b.index_pop : b.index_avg;
      return aIndex - bIndex; // Lower index is better
    });

    // Group scores by their grade
    const gradeGroups: { [grade: string]: ScoreEntry[] } = {};

    sortedScores.forEach(score => {
      const indexValue = this.scoreType === 'pop' ? score.index_pop : score.index_avg;
      const grade = this.indexService.getIndexName(indexValue);
      if (!gradeGroups[grade]) {
        gradeGroups[grade] = [];
      }
      gradeGroups[grade].push(score);
    });

    // Assign ranks to each group
    let currentRank = 1;
    const rankedScores: ScoreEntry[] = [];

    // Process groups in order of their grade (A+ is best, F- is worst)
    const gradeOrder = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E+', 'E', 'E-', 'F+', 'F', 'F-'];

    gradeOrder.forEach(grade => {
      if (gradeGroups[grade] && gradeGroups[grade].length > 0) {
        // All scores in this grade group get the same rank
        gradeGroups[grade].forEach(score => {
          rankedScores.push({
            ...score,
            rank: currentRank
          });
        });

        // Increment rank by 1 for the next grade group
        currentRank += 1;
      }
    });

    return rankedScores;
  }
}