import { Component, inject, effect } from '@angular/core';
import { County } from '../../../interfaces/features';
import { StatsService } from '../../../services/stats.service';
import { FilterConfigService } from '../../../services/filter-config.service';
import { MapService } from '../../../services/map.service';
import { SharedModule } from '../../../shared/shared.module';
import { InfoOverlayComponent } from '../../../shared/info-overlay/info-overlay.component';

@Component({
  selector: 'app-stats',
  imports: [SharedModule, InfoOverlayComponent],
  templateUrl: './stats.component.html',
})
export class StatsComponent {
  private statsService = inject(StatsService);
  private filterConfigService = inject(FilterConfigService);
  private mapService = inject(MapService);

  counties: County[] = [];
  isLoading = true;
  error: string | null = null;
  
  // Level selection - hardcoded to county for now (user will implement level selection later)
  selectedLevel: 'municipality' | 'county' | 'state' = 'county';

  constructor() {
    // React to profile combination changes and map loading state to fetch data
    effect(() => {
      const profileCombinationID = this.filterConfigService.currentProfileCombinationID();
      const isMapLoading = this.mapService.isMapLoading();
      
      // Only load stats when map is ready (not loading) and profile combination is available
      if (profileCombinationID !== null && !isMapLoading) {
        this.loadTopRankings();
      } else {
        // Clear data if no profile combination is available or map is still loading
        if (profileCombinationID === null) {
          this.counties = [];
        }
        // Keep loading state if map is still loading
        if (isMapLoading) {
          this.isLoading = true;
        }
      }
    });
  }

  private loadTopRankings(): void {
    const profileCombinationID = this.filterConfigService.currentProfileCombinationID();
    if (!profileCombinationID) {
      return;
    }

    this.isLoading = true;
    this.error = null;

    const filters = this.filterConfigService.contentLayerFilters();
    const params = {
      type: this.selectedLevel,
      profile_combination_id: profileCombinationID,
      state_ids: filters?.state_ids,
      category_ids: filters?.category_ids,
      persona_ids: filters?.persona_ids,
      regiostar_ids: filters?.regiotyp_id ? [filters.regiotyp_id] : undefined
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
      return this.getRating(county.index);
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
}
