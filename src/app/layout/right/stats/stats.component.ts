import { Component, inject, effect, OnDestroy } from '@angular/core';
import { County } from '../../../interfaces/features';
import { StatsService } from '../../../services/stats.service';
import { FilterConfigService } from '../../../services/filter-config.service';
import { MapService } from '../../../services/map.service';
import { SettingsService } from '../../../services/settings.service';
import { ProjectsService } from '../../../services/project.service';
import { SharedModule } from '../../../shared/shared.module';
import { InfoOverlayComponent } from '../../../shared/info-overlay/info-overlay.component';

@Component({
  selector: 'app-stats',
  imports: [SharedModule, InfoOverlayComponent],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css',
})
export class StatsComponent implements OnDestroy {
  private statsService = inject(StatsService);
  private filterConfigService = inject(FilterConfigService);
  private mapService = inject(MapService);
  private settingsService = inject(SettingsService);
  private projectService = inject(ProjectsService);

  counties: County[] = [];
  isLoading = true;
  error: string | null = null;
  
  // Level selection options
  levelOptions = [
    { value: 'state' as const, label: 'Bundesländer' },
    { value: 'county' as const, label: 'Landkreise' },
    { value: 'municipality' as const, label: 'Gemeinden' }
  ];
  
  selectedLevel: 'municipality' | 'county' | 'state' = 'county';
  private loadRankingsTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Load saved level selection from localStorage
    this.loadSavedLevel();
    // Track previous filter state to detect actual changes (excluding bewertung)
    let previousFilters: { profileCombinationID: number | null; stateIds: number[] | undefined; categoryIds: number[] | undefined; personaIds: number[] | undefined; regiostarIds: number[] | undefined } | null = null;
    let previousMapLoading = true;
    
    // React to all relevant filter changes: profile combination, filters, and map loading state
    // Note: bewertung is NOT watched here because both index and score are already in the response
    // The display methods (formatDisplayValue, getDisplayValue) handle showing the correct value
    effect(() => {
      const profileCombinationID = this.filterConfigService.currentProfileCombinationID();
      const isMapLoading = this.mapService.isMapLoading();
      const filters = this.filterConfigService.contentLayerFilters();
      
      // Detect when map transitions from loading to not loading
      const mapJustFinishedLoading = previousMapLoading && !isMapLoading;
      previousMapLoading = isMapLoading;
      
      // Only load stats when map is ready (not loading) and profile combination is available
      if (profileCombinationID !== null && !isMapLoading && filters) {
        // Check if filters actually changed (excluding bewertung which doesn't require API call)
        const currentFilterState = {
          profileCombinationID,
          stateIds: filters.state_ids,
          categoryIds: filters.category_ids,
          personaIds: filters.persona_ids,
          regiostarIds: filters.regiostar_ids
        };
        
        // Only reload if filters actually changed or this is the first load
        const filtersChanged = !previousFilters || 
          previousFilters.profileCombinationID !== currentFilterState.profileCombinationID ||
          JSON.stringify(previousFilters.stateIds?.sort()) !== JSON.stringify(currentFilterState.stateIds?.sort()) ||
          JSON.stringify(previousFilters.categoryIds?.sort()) !== JSON.stringify(currentFilterState.categoryIds?.sort()) ||
          JSON.stringify(previousFilters.personaIds?.sort()) !== JSON.stringify(currentFilterState.personaIds?.sort()) ||
          JSON.stringify(previousFilters.regiostarIds?.sort()) !== JSON.stringify(currentFilterState.regiostarIds?.sort());
        
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
      } else {
        // Clear any pending timeout if conditions are no longer met
        if (this.loadRankingsTimeout) {
          clearTimeout(this.loadRankingsTimeout);
          this.loadRankingsTimeout = null;
        }
        
        // Clear data if no profile combination is available or map is still loading
        if (profileCombinationID === null) {
          this.counties = [];
          previousFilters = null;
        }
        // Keep loading state if map is still loading
        if (isMapLoading) {
          this.isLoading = true;
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
    const filters = this.filterConfigService.contentLayerFilters();
    
    if (profileCombinationID !== null && !isMapLoading && filters) {
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
    return this.levelOptions.find(opt => opt.value === this.selectedLevel)?.label || 'Landkreise';
  }

  private loadTopRankings(): void {
    const profileCombinationID = this.filterConfigService.currentProfileCombinationID();
    if (!profileCombinationID) {
      return;
    }

    this.isLoading = true;
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
      // Only include persona_ids if project is MID and there are selected personas (same logic as contentLayerFilters)
      persona_ids: (isMid && selectedPersonas.length > 0) ? selectedPersonas : undefined,
      // Only include regiostar_ids if there are selected regiostars (same logic as contentLayerFilters)
      regiostar_ids: selectedRegioStars.length > 0 ? selectedRegioStars : undefined
    };

    this.statsService.getTopRankings(params).subscribe({
      next: (data) => {
        // Response already includes rank from the API
        this.counties = data as County[];
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading top rankings:', error);
        this.error = 'Fehler beim Laden der Daten';
        this.isLoading = false;
        this.counties = [];
      }
    });
  }

  get filteredCounties(): County[] {
    return this.counties;
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
      // For score, show the raw value
      return county.score.toFixed(2);
    } else {
      // For index, show the rating letter grade
      return this.getRating(county.index / 100) as string;
    }
  }

  getRating(index: number): string {
    index = index / 100;
    if (index <= 0) return "Error";
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

  ngOnDestroy(): void {
    // Clear any pending timeout when component is destroyed
    if (this.loadRankingsTimeout) {
      clearTimeout(this.loadRankingsTimeout);
      this.loadRankingsTimeout = null;
    }
  }
}
