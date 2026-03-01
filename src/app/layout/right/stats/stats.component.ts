import { Component, inject, effect, OnDestroy, computed, signal } from '@angular/core';
import { County } from '../../../interfaces/features';
import { StatsService } from '../../../services/stats.service';
import { FilterConfigService } from '../../../services/filter-config.service';
import { MapService } from '../../../services/map.service';
import { SettingsService } from '../../../services/settings.service';
import { ProjectsService } from '../../../services/project.service';
import { SharedModule } from '../../../shared/shared.module';
import { InfoOverlayComponent } from '../../../shared/info-overlay/info-overlay.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../services/language.service';
import { SearchService } from '../../../services/search.service';

@Component({
  selector: 'app-stats',
  imports: [SharedModule, InfoOverlayComponent, TranslateModule],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css',
})
export class StatsComponent implements OnDestroy {
  private statsService = inject(StatsService);
  private filterConfigService = inject(FilterConfigService);
  private mapService = inject(MapService);
  private settingsService = inject(SettingsService);
  private projectService = inject(ProjectsService);
  private translate = inject(TranslateService);
  private languageService = inject(LanguageService);
  private searchService = inject(SearchService);

  counties: County[] = [];
  isLoading = signal(true); // Start with loading state true by default (step 0)
  error: string | null = null;
  
  // Track current language to trigger translation updates
  private currentLang = signal<string>(this.languageService.getCurrentLanguage());
  
  // Level selection options - signal that updates when language changes
  levelOptions = signal<Array<{ value: 'state' | 'county' | 'municipality'; label: string }>>([
    { value: 'state' as const, label: '' },
    { value: 'county' as const, label: '' },
    { value: 'municipality' as const, label: '' }
  ]);
  
  selectedLevel: 'municipality' | 'county' | 'state' = 'county';
  private loadRankingsTimeout: ReturnType<typeof setTimeout> | null = null;
  private languageSubscription: any = null;

  constructor() {
    // Load saved level selection from localStorage
    this.loadSavedLevel();
    
    // Initialize level options with translations
    this.updateLevelOptions();
    
    // Subscribe to language changes to update translations
    this.languageSubscription = this.languageService.onLanguageChange().subscribe(event => {
      this.currentLang.set(event.lang);
      // Update level options when language changes
      this.updateLevelOptions();
    });
    // Track previous filter state to detect actual changes (excluding bewertung)
    let previousFilters: { profileCombinationID: number | null; stateIds: number[] | undefined; categoryIds: number[] | undefined; personaId: number | null | undefined; regiostarIds: number[] | undefined } | null = null;
    let previousBewertung: 'qualitaet' | 'zeit' | null = null;
    let previousMapLoading = true;
    
    // React to all relevant filter changes: profile combination, filters, and map loading state
    // Note: bewertung is NOT watched here because both index and score are already in the response
    // The display methods (formatDisplayValue, getDisplayValue) handle showing the correct value
    // Watch individual filter signals to ensure we catch all changes
    effect(() => {
      const profileCombinationID = this.filterConfigService.currentProfileCombinationID();
      const isMapLoading = this.mapService.isMapLoading();
      const isPreparingProject = this.mapService.isPreparingProject();
      const isReadyCheckComplete = this.mapService.isReadyCheckComplete();
      const filters = this.filterConfigService.contentLayerFilters();
      const currentBewertung = this.filterConfigService.selectedBewertung();
      // Watch individual filter signals to ensure effect triggers on all filter changes
      const selectedStates = this.filterConfigService.selectedStates();
      const selectedActivities = this.filterConfigService.selectedActivities();
      const selectedPersonas = this.filterConfigService.selectedPersonas();
      const selectedRegioStars = this.filterConfigService.selectedRegioStars();
      
      // Detect when map transitions from loading to not loading
      const mapJustFinishedLoading = previousMapLoading && !isMapLoading;
      previousMapLoading = isMapLoading;
      
      // Compute current filter state once for reuse
      // Use signal values for comparison to ensure we catch all changes
      const currentFilterState = {
        profileCombinationID,
        stateIds: selectedStates.length > 0 ? [...selectedStates].sort() : undefined,
        categoryIds: selectedActivities.length > 0 ? [...selectedActivities].sort() : undefined,
        personaId: selectedPersonas,
        regiostarIds: selectedRegioStars.length > 0 ? [...selectedRegioStars].sort() : undefined
      };
      
      // Check if only bewertung changed
      const onlyBewertungChanged = previousBewertung !== null && 
        previousBewertung !== currentBewertung &&
        previousFilters !== null &&
        profileCombinationID === previousFilters.profileCombinationID &&
        JSON.stringify(previousFilters.stateIds) === JSON.stringify(currentFilterState.stateIds) &&
        JSON.stringify(previousFilters.categoryIds) === JSON.stringify(currentFilterState.categoryIds) &&
        previousFilters.personaId === currentFilterState.personaId &&
        JSON.stringify(previousFilters.regiostarIds) === JSON.stringify(currentFilterState.regiostarIds);
      
      // If only bewertung changed, check if it's a change from zeit to qualitaet
      if (onlyBewertungChanged) {
        // If changing from zeit to qualitaet, send a request to the backend
        if (previousBewertung === 'zeit' && currentBewertung === 'qualitaet') {
          // Only send request if conditions are met (map ready, project ready, etc.)
          if (profileCombinationID !== null && !isMapLoading && !isPreparingProject && isReadyCheckComplete && filters) {
            // Clear any existing timeout
            if (this.loadRankingsTimeout) {
              clearTimeout(this.loadRankingsTimeout);
              this.loadRankingsTimeout = null;
            }
            
            // Send request to backend
            this.loadTopRankings();
          }
        }
        // Update the previous value
        previousBewertung = currentBewertung;
        // For other bewertung changes, just update the display without API call
        return;
      }
      
      // Only load stats when:
      // - Map is ready (not loading)
      // - Project is not being prepared
      // - Ready check has completed (step 2 is done, so step 3 can proceed)
      // - Profile combination is available
      // This ensures rankings only load after ready check completes (step 3)
      if (profileCombinationID !== null && !isMapLoading && !isPreparingProject && isReadyCheckComplete && filters) {
        // Check if filters actually changed (excluding bewertung which doesn't require API call)
        
        // Only reload if filters actually changed or this is the first load
        // Compare sorted arrays to handle order differences
        const filtersChanged = !previousFilters || 
          previousFilters.profileCombinationID !== currentFilterState.profileCombinationID ||
          JSON.stringify(previousFilters.stateIds) !== JSON.stringify(currentFilterState.stateIds) ||
          JSON.stringify(previousFilters.categoryIds) !== JSON.stringify(currentFilterState.categoryIds) ||
          previousFilters.personaId !== currentFilterState.personaId ||
          JSON.stringify(previousFilters.regiostarIds) !== JSON.stringify(currentFilterState.regiostarIds);
        
        if (filtersChanged) {
          // Clear any existing timeout
          if (this.loadRankingsTimeout) {
            clearTimeout(this.loadRankingsTimeout);
            this.loadRankingsTimeout = null;
          }
          
          // If map just finished loading, wait 1 second before loading rankings to avoid race condition
          if (mapJustFinishedLoading) {
            this.loadRankingsTimeout = setTimeout(() => {
              this.loadTopRankings();
              this.loadRankingsTimeout = null;
            }, 0);
          } else {
            // Map was already loaded, load immediately
            this.loadTopRankings();
          }
          previousFilters = currentFilterState;
        }
        // Always update bewertung tracking when we have valid filters
        previousBewertung = currentBewertung;
      } else {
        // Clear any pending timeout if conditions are no longer met
        if (this.loadRankingsTimeout) {
          clearTimeout(this.loadRankingsTimeout);
          this.loadRankingsTimeout = null;
        }
        
        // Clear data if no profile combination is available
        if (profileCombinationID === null) {
          this.counties = [];
          previousFilters = null;
          previousBewertung = null;
          // No data to load, so set loading to false
          this.isLoading.set(false);
        } else if (isMapLoading || isPreparingProject) {
          // Only set loading state if we don't already have data loaded
          // If we have data and only bewertung might change, don't show loading
          if (this.counties.length === 0) {
            this.isLoading.set(true);
          }
          // If we already have data, keep it displayed (bewertung change doesn't need loading state)
        }
      }
    });
  }

  onLevelChange(newLevel: 'municipality' | 'county' | 'state'): void {
    this.selectedLevel = newLevel;
    // Save the selection to localStorage
    this.saveLevel();
    // Trigger new API call when level changes (level is a parameter, not a filter)
    const profileCombinationID = this.filterConfigService.currentProfileCombinationID();
    const isMapLoading = this.mapService.isMapLoading();
    const isPreparingProject = this.mapService.isPreparingProject();
    const filters = this.filterConfigService.contentLayerFilters();
    
    const isReadyCheckComplete = this.mapService.isReadyCheckComplete();
    if (profileCombinationID !== null && !isMapLoading && !isPreparingProject && isReadyCheckComplete && filters) {
      this.loadTopRankings();
    }
  }

  /**
   * Load saved level selection from localStorage
   */
  private loadSavedLevel(): void {
    const settings = this.settingsService.loadSettings();
    if (settings?.statsLevel) {
      // Validate that the saved level is one of the valid options
      const validLevels: ('municipality' | 'county' | 'state')[] = ['municipality', 'county', 'state'];
      if (validLevels.includes(settings.statsLevel)) {
        this.selectedLevel = settings.statsLevel;
      }
    }
  }

  /**
   * Save current level selection to localStorage
   */
  private saveLevel(): void {
    this.settingsService.saveSettings({
      statsLevel: this.selectedLevel
    });
  }

  get selectedLevelLabel(): string {
    return this.levelOptions().find(opt => opt.value === this.selectedLevel)?.label || this.translate.instant('stats.levels.county');
  }

  /**
   * Update level options with current translations
   */
  private updateLevelOptions(): void {
    this.levelOptions.set([
      { value: 'state' as const, label: this.translate.instant('stats.levels.state') },
      { value: 'county' as const, label: this.translate.instant('stats.levels.county') },
      { value: 'municipality' as const, label: this.translate.instant('stats.levels.municipality') }
    ]);
  }

  private loadTopRankings(): void {
    const profileCombinationID = this.filterConfigService.currentProfileCombinationID();
    if (!profileCombinationID) {
      return;
    }

    // Don't load if map is loading, project is being prepared, or ready check hasn't completed
    const isMapLoading = this.mapService.isMapLoading();
    const isPreparingProject = this.mapService.isPreparingProject();
    const isReadyCheckComplete = this.mapService.isReadyCheckComplete();
    if (isMapLoading || isPreparingProject || !isReadyCheckComplete) {
      return;
    }

    this.isLoading.set(true);
    this.error = null;

    // Use the same filtering logic as filter-config.service.ts contentLayerFilters
    const filters = this.filterConfigService.contentLayerFilters();
    const currentProject = this.projectService.project();
    const isMid = currentProject?.is_mid ?? false;
    
    // Apply the same filtering logic as contentLayerFilters
    const selectedStates = this.filterConfigService.selectedStates();
    const selectedActivities = this.filterConfigService.selectedActivities();
    const selectedPersonas = this.filterConfigService.selectedPersonas();
    const selectedRegioStars = this.filterConfigService.selectedRegioStars();

    const params = {
      type: this.selectedLevel,
      profile_combination_id: profileCombinationID,
      // Only include state_ids if there are selected states (same logic as contentLayerFilters)
      state_ids: selectedStates.length > 0 ? selectedStates : undefined,
      // Only include category_ids if project is MID and there are selected activities (same logic as contentLayerFilters)
      category_ids: (isMid && selectedActivities.length > 0) ? selectedActivities : undefined,
      // Only include persona_id if project is MID and there is a selected persona (same logic as contentLayerFilters)
      persona_id: (isMid && selectedPersonas !== null) ? selectedPersonas : undefined,
      // Only include regiostar_ids if there are selected regiostars (same logic as contentLayerFilters)
      regiostar_ids: selectedRegioStars.length > 0 ? selectedRegioStars : undefined,
      bewertung: this.filterConfigService.selectedBewertung()
    };

    this.statsService.getTopRankings(params).subscribe({
      next: (data) => {
        // Store raw data - ranks will be recalculated in filteredCounties getter to handle ties
        this.counties = data as County[];
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading top rankings:', error);
        this.error = this.translate.instant('stats.errorLoading');
        this.isLoading.set(false);
        this.counties = [];
      }
    });
  }

  /**
   * Process rankings to handle tied scores - areas with the same score/index share the same rank
   */
  get filteredCounties(): County[] {
    if (this.counties.length === 0) {
      return [];
    }

    // Sort by the display value (score or index) in ascending order
    // Lower values are better for both score (zeit) and index (qualitaet)
    const sorted = [...this.counties].sort((a, b) => {
      const valueA = this.getDisplayValue(a);
      const valueB = this.getDisplayValue(b);
      // For both 'zeit' (score) and 'qualitaet' (index), lower is better
      return valueA - valueB; // Ascending order (lower values first)
    });

    // Assign ranks, handling ties
    // When areas have the same numeric value (score or index), they share the same rank
    // The next rank skips positions (e.g., if rank 3 is shared by 2 items, next is rank 5)
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        // First item always gets rank 1
        sorted[i].rank = 1;
      } else {
        const prevValue = this.getDisplayValue(sorted[i - 1]);
        const currentValue = this.getDisplayValue(sorted[i]);
        
        // Check if values are equal (with small tolerance for floating point)
        const isEqual = Math.abs(prevValue - currentValue) < 0.001;
        
        if (isEqual) {
          // Same rank as previous (tied)
          sorted[i].rank = sorted[i - 1].rank;
        } else {
          // New rank - use position (i + 1) which automatically accounts for skipped positions
          sorted[i].rank = i + 1;
        }
      }
    }

    return sorted;
  }

  /**
   * Get the display value (index or score) based on settings
   */
  getDisplayValue(county: County): number {
    const bewertung = this.filterConfigService.selectedBewertung();
    // 'zeit' -> score, 'qualitaet' -> index
    return bewertung === 'zeit' ? county.score : county.index;
  }

  /**
   * Format the display value based on settings
   */
  formatDisplayValue(county: County): string {
    const bewertung = this.filterConfigService.selectedBewertung();
    
    if (bewertung === 'zeit') {
      // For score, convert seconds to minutes for display
      // API returns score in seconds, but we display in minutes
      const minutes = (county.score / 60).toFixed(1);
      const minLabel = this.translate.instant('map.popup.minutes');
      return `${minutes} ${minLabel}`;
    } else {
      // For index, show the rating letter grade
      return this.getRating(county.index / 100) as string;
    }
  }

  getRating(index: number): string {
    if (index <= 0) return this.translate.instant('map.popup.error');
    if (index < 0.28) return "A+";
    if (index < 0.32) return "A";
    if (index < 0.35) return "A-";
    if (index < 0.4) return "B+";
    if (index < 0.45) return "B";
    if (index < 0.5) return "B-";
    if (index < 0.56) return "C+";
    if (index < 0.63) return "C";
    if (index < 0.71) return "C-";
    if (index < 0.8) return "D+";
    if (index < 0.9) return "D";
    if (index < 1.0) return "D-";
    if (index < 1.12) return "E+";
    if (index < 1.26) return "E";
    if (index < 1.41) return "E-";
    if (index < 1.59) return "F+";
    if (index < 1.78) return "F";
    return "F-";
  }

  /**
   * Handle clicking on a feature name - copy it to the search bar
   */
  onFeatureNameClick(county: County): void {
    if (county.name) {
      this.searchService.setSearchQuery(county.name);
    }
  }

  ngOnDestroy(): void {
    // Clear any pending timeout when component is destroyed
    if (this.loadRankingsTimeout) {
      clearTimeout(this.loadRankingsTimeout);
      this.loadRankingsTimeout = null;
    }
    // Unsubscribe from language changes
    if (this.languageSubscription) {
      this.languageSubscription.unsubscribe();
    }
  }
}
