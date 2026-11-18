import { Component, inject, effect, OnDestroy, computed, signal, ChangeDetectionStrategy, untracked } from '@angular/core';
import { County } from '../../../interfaces/features';
import { StatsService } from '../../../services/stats.service';
import { FilterConfigService } from '../../../services/filter-config.service';
import { MapService } from '../../../services/map.service';
import { ProjectsService } from '../../../services/project.service';
import { SharedModule } from '../../../shared/shared.module';
import { InfoOverlayComponent } from '../../../shared/info-overlay/info-overlay.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../services/language.service';
import { FeatureSelectionService, MapLibreFeatureData } from '../../../shared/services/feature-selection.service';
import { MobileUiService } from '../../../services/mobile-ui.service';
import { ScoreColorsService } from '../../../services/score-colors.service';
import { getContrastTextColor, getGrade, getGradeColor } from '../../../utils/grade.util';
import { currentNumberLocale } from '../../../shared/pipes/locale-number.pipe';
import { formatNumber } from '@angular/common';

interface RankedRow {
  county: County;
  rank: number;
  label: string;
  color: string;
  textColor: string;
}

@Component({
  selector: 'app-stats',
  imports: [SharedModule, InfoOverlayComponent, TranslateModule],
  templateUrl: './stats.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './stats.component.css',
})
export class StatsComponent implements OnDestroy {
  private statsService = inject(StatsService);
  private filterConfigService = inject(FilterConfigService);
  private mapService = inject(MapService);
  private projectService = inject(ProjectsService);
  private translate = inject(TranslateService);
  private languageService = inject(LanguageService);
  private featureSelectionService = inject(FeatureSelectionService);
  private mobileUi = inject(MobileUiService);
  private scoreColorsService = inject(ScoreColorsService);

  private readonly counties = signal<County[]>([]);
  isLoading = signal(true); // Start with loading state true by default (step 0)
  readonly error = signal<string | null>(null);
  
  // Track current language to trigger translation updates
  private currentLang = signal<string>(this.languageService.getCurrentLanguage());
  
  // Level selection options - signal that updates when language changes
  levelOptions = signal<Array<{ value: 'state' | 'county' | 'municipality'; label: string }>>([
    { value: 'state' as const, label: '' },
    { value: 'county' as const, label: '' },
    { value: 'municipality' as const, label: '' }
  ]);
  
  /** Ranking level; shared state so it can be restored from and synced to the URL. */
  get selectedLevel(): 'municipality' | 'county' | 'state' {
    return this.filterConfigService.statsLevel();
  }
  private loadRankingsTimeout: ReturnType<typeof setTimeout> | null = null;
  private languageSubscription: any = null;

  constructor() {
    // Reload rankings whenever the level changes (UI selection or restored from the URL).
    let previousLevel = untracked(() => this.filterConfigService.statsLevel());
    effect(() => {
      const level = this.filterConfigService.statsLevel();
      if (level === previousLevel) {
        return;
      }
      previousLevel = level;
      untracked(() => this.reloadRankingsForLevel());
    });

    // Initialize level options with translations
    this.updateLevelOptions();
    
    // Subscribe to language changes to update translations
    this.languageSubscription = this.languageService.onLanguageChange().subscribe(event => {
      this.currentLang.set(event.lang);
      // Update level options when language changes
      this.updateLevelOptions();
    });
    // Track previous filter state to detect actual changes (excluding bewertung)
    let previousFilters: { profileIdsKey: string | null; stateIds: number[] | undefined; regiostarIds: number[] | undefined } | null = null;
    let previousBewertung: 'qualitaet' | 'zeit' | null = null;
    let previousMapLoading = true;
    
    // React to all relevant filter changes: profile combination, filters, and map loading state
    // Note: bewertung is NOT watched here because both index and score are already in the response
    // The display methods (formatDisplayValue, getDisplayValue) handle showing the correct value
    // Watch individual filter signals to ensure we catch all changes
    effect(() => {
      const profileIds = this.filterConfigService.currentProfileIds();
      const profileIdsKey = profileIds?.length
        ? JSON.stringify([...profileIds].sort((a, b) => a - b))
        : null;
      const isMapLoading = this.mapService.isMapLoading();
      const filters = this.filterConfigService.contentLayerFilters();
      const currentBewertung = this.filterConfigService.selectedBewertung();
      // Watch individual filter signals to ensure effect triggers on all filter changes
      const selectedStates = this.filterConfigService.selectedStates();
      const selectedRegioStars = this.filterConfigService.selectedRegioStars();
      
      // Detect when map transitions from loading to not loading
      const mapJustFinishedLoading = previousMapLoading && !isMapLoading;
      // Detect when map transitions from not loading to loading (map starts reloading)
      const mapJustStartedLoading = !previousMapLoading && isMapLoading;
      previousMapLoading = isMapLoading;
      
      // Compute current filter state once for reuse
      // Use signal values for comparison to ensure we catch all changes
      const currentFilterState = {
        profileIdsKey,
        stateIds: selectedStates.length > 0 ? [...selectedStates].sort() : undefined,
        regiostarIds: selectedRegioStars.length > 0 ? [...selectedRegioStars].sort() : undefined
      };

      const rankingsAffectingFiltersChanged = !previousFilters ||
        previousFilters.profileIdsKey !== currentFilterState.profileIdsKey ||
        JSON.stringify(previousFilters.stateIds) !== JSON.stringify(currentFilterState.stateIds) ||
        JSON.stringify(previousFilters.regiostarIds) !== JSON.stringify(currentFilterState.regiostarIds);
      
      // Check if only bewertung changed
      const onlyBewertungChanged = previousBewertung !== null && 
        previousBewertung !== currentBewertung &&
        previousFilters !== null &&
        profileIdsKey === previousFilters.profileIdsKey &&
        JSON.stringify(previousFilters.stateIds) === JSON.stringify(currentFilterState.stateIds) &&
        JSON.stringify(previousFilters.regiostarIds) === JSON.stringify(currentFilterState.regiostarIds);
      
      // If only bewertung changed, check if it's a change from zeit to qualitaet
      if (onlyBewertungChanged) {
        // If changing from zeit to qualitaet, send a request to the backend
        if (previousBewertung === 'zeit' && currentBewertung === 'qualitaet') {
          // Only send request if conditions are met (map ready, project ready, etc.)
          if (profileIdsKey !== null && !isMapLoading && filters) {
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
      
      if (profileIdsKey !== null && !isMapLoading && filters) {
        if (mapJustFinishedLoading && !rankingsAffectingFiltersChanged) {
          this.isLoading.set(false);
        }

        // Check if filters actually changed (excluding bewertung which doesn't require API call)
        
        // Only reload if filters actually changed or this is the first load
        // Compare sorted arrays to handle order differences
        const filtersChanged = !previousFilters || 
          previousFilters.profileIdsKey !== currentFilterState.profileIdsKey ||
          JSON.stringify(previousFilters.stateIds) !== JSON.stringify(currentFilterState.stateIds) ||
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
        
        // Clear data if no profiles are available
        if (profileIdsKey === null) {
          this.counties.set([]);
          previousFilters = null;
          previousBewertung = null;
          // No data to load, so set loading to false
          this.isLoading.set(false);
        } else if (isMapLoading) {
          // Set loading state when map starts reloading
          if (mapJustStartedLoading) {
            // Only toggle loading if we actually need to refresh the rankings.
            if (rankingsAffectingFiltersChanged) {
              this.isLoading.set(true);
            } else {
              this.isLoading.set(false);
            }
          } else if (untracked(() => this.counties()).length === 0) {
            // If map is loading but we don't have data yet, show loading
            this.isLoading.set(true);
          }
          // If we already have data and map is loading but didn't just start, keep it displayed
        }
      }
    });
  }

  onLevelChange(newLevel: 'municipality' | 'county' | 'state'): void {
    // Persisted by FilterConfigService; the level effect reloads the rankings.
    this.filterConfigService.setStatsLevel(newLevel);
  }

  private reloadRankingsForLevel(): void {
    // Trigger new API call when level changes (level is a parameter, not a filter)
    const profileIds = this.filterConfigService.currentProfileIds();
    const isMapLoading = this.mapService.isMapLoading();
    const filters = this.filterConfigService.contentLayerFilters();
    if (profileIds?.length && !isMapLoading && filters) {
      this.loadTopRankings();
    }
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
    const profileIds = this.filterConfigService.currentProfileIds();
    if (!profileIds?.length) {
      return;
    }

    // Don't load while map tiles are still loading for a filter change
    const isMapLoading = this.mapService.isMapLoading();
    if (isMapLoading) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    const selectedStates = this.filterConfigService.selectedStates();
    const selectedRegioStars = this.filterConfigService.selectedRegioStars();

    const params = {
      type: this.selectedLevel,
      profile_ids: profileIds,
      state_ids: selectedStates.length > 0 ? selectedStates : undefined,
      regiostar_ids: selectedRegioStars.length > 0 ? selectedRegioStars : undefined,
      bewertung: this.filterConfigService.selectedBewertung()
    };

    this.statsService.getTopRankings(params).subscribe({
      next: (data) => {
        // Store raw data - ranks will be recalculated in filteredCounties getter to handle ties
        this.counties.set(data as County[]);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading top rankings:', error);
        this.error.set(this.translate.instant('stats.errorLoading'));
        this.isLoading.set(false);
        this.counties.set([]);
      }
    });
  }

  /**
   * Rankings sorted by the active bewertung, with tied scores sharing a rank
   * (e.g. two items on rank 3 make the next one rank 5), plus the precomputed chip label and colours.
   */
  readonly rankedRows = computed<RankedRow[]>(() => {
    const counties = this.counties();
    const bewertung = this.filterConfigService.selectedBewertung();
    // Labels come from translate.instant; re-run on language change.
    this.currentLang();
    if (counties.length === 0) {
      return [];
    }

    const valueOf = (county: County) => (bewertung === 'zeit' ? county.score : county.index);
    // Lower values are better for both score (zeit) and index (qualitaet).
    const sorted = [...counties].sort((a, b) => valueOf(a) - valueOf(b));

    const rows: RankedRow[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const county = sorted[i];
      // Compare with a small tolerance for floating point.
      const tied = i > 0 && Math.abs(valueOf(sorted[i - 1]) - valueOf(county)) < 0.001;
      const rank = tied ? rows[i - 1].rank : i + 1;
      county.rank = rank;
      const color = this.getDisplayColor(county, bewertung);
      rows.push({
        county,
        rank,
        label: this.formatDisplayValue(county, bewertung),
        color,
        textColor: getContrastTextColor(color),
      });
    }
    return rows;
  });

  /**
   * Format the display value based on settings
   */
  private formatDisplayValue(county: County, bewertung: 'qualitaet' | 'zeit'): string {
    if (bewertung === 'zeit') {
      // For score, convert seconds to minutes for display
      // API returns score in seconds, but we display in minutes
      const minutes = formatNumber(county.score / 60, currentNumberLocale(this.translate), '1.1-1');
      const minLabel = this.translate.instant('map.popup.minutes');
      return `${minutes} ${minLabel}`;
    } else {
      // For index, show the rating letter grade
      return this.getRating(county.index) as string;
    }
  }

  /** Colour chip for the rating column (grade colour or travel-time bracket colour). */
  private getDisplayColor(county: County, bewertung: 'qualitaet' | 'zeit'): string {
    return bewertung === 'zeit'
      ? this.scoreColorsService.getColorForScore(county.score)
      : getGradeColor(county.index);
  }

  /** Sub-grade for an API index (e.g. 42 → "B"). */
  private getRating(index: number): string {
    return getGrade(index) ?? this.translate.instant('map.popup.error');
  }

  /**
   * Handle clicking on a feature name - pan the map to its coordinates and select it in Analyze
   */
  onFeatureNameClick(county: County): void {
    if (county.name) {
      // Map selectedLevel to the 't' property used by MapLibre features
      // 'h' = hexagon, 'm' = municipality, 'c' = county, 's' = state
      let tileType: string;
      if (this.selectedLevel === 'county') {
        tileType = 'c';
      } else if (this.selectedLevel === 'state') {
        tileType = 's';
      } else if (this.selectedLevel === 'municipality') {
        tileType = 'm';
      } else {
        // Default to county if unknown
        tileType = 'c';
      }
      
      // Create a MapLibreFeatureData object to select the feature in the analyze component
      const featureData: MapLibreFeatureData = {
        properties: {
          id: county.id,
          name: county.name,
          score: county.score,
          index: county.index,
          t: tileType // Required for getFeatureTypeFromTileProperty to work
        },
        id: county.id
      };
      
      this.featureSelectionService.setSelectedMapLibreFeature(featureData);
      if (this.mobileUi.isMobile()) {
        this.mobileUi.openAnalyze();
      }

      const map = this.mapService.getMap();
      if (map && county.lat != null && county.lng != null) {
        map.flyTo({
          center: [county.lng, county.lat],
          zoom: this.getZoomForSelectedLevel(),
          duration: 1000
        });
      }
    }
  }

  /** Zoom matching automatic admin-level bands in FilterConfigService.determineDefaultAdminLevel */
  private getZoomForSelectedLevel(): number {
    if (this.selectedLevel === 'state') {
      return 7;
    }
    if (this.selectedLevel === 'county') {
      return 8;
    }
    return 9; // municipality
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
