import { Component, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { County } from '../../../interfaces/features';
import { StatsService } from '../../../services/stats.service';
import { MapService } from '../../../services/map.service';

@Component({
  selector: 'app-stats',
  imports: [CommonModule],
  templateUrl: './stats.component.html',
})
export class StatsComponent {
  private statsService = inject(StatsService);
  private mapService = inject(MapService);

  counties: County[] = [];
  isLoading = true;
  error: string | null = null;
  
  // Level selection - hardcoded to county for now (user will implement level selection later)
  selectedLevel: 'municipality' | 'county' | 'state' = 'county';

  constructor() {
    // React to profile combination changes from MapService to fetch data
    effect(() => {
      const profileCombinationID = this.mapService.currentProfileCombinationID();
      if (profileCombinationID !== null) {
        this.loadTopRankings();
      } else {
        // Clear data if no profile combination is available
        this.counties = [];
      }
    });
  }

  private loadTopRankings(): void {
    const profileCombinationID = this.mapService.currentProfileCombinationID();
    if (!profileCombinationID) {
      return;
    }

    this.isLoading = true;
    this.error = null;

    const params = {
      type: this.selectedLevel,
      profile_combination_id: profileCombinationID
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
