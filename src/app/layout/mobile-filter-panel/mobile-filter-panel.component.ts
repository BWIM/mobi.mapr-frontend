import { Component, inject, input, output } from '@angular/core';
import { FilterConfigService } from '../../services/filter-config.service';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SearchService } from '../../services/search.service';

@Component({
  selector: 'app-mobile-filter-panel',
  imports: [SharedModule, TranslateModule],
  templateUrl: './mobile-filter-panel.component.html',
  styleUrl: './mobile-filter-panel.component.css',
})
export class MobileFilterPanelComponent {
  isExpanded = input.required<boolean>();
  onClose = output<void>();
  private filterConfigService = inject(FilterConfigService);
  private translate = inject(TranslateService);
  private searchService = inject(SearchService);
  
  searchQuery: string = '';

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery = input.value;
    if (this.searchQuery.trim().length >= 3) {
      this.searchService.setSearchQuery(this.searchQuery.trim());
    }
  }

  onSearchSubmit(): void {
    if (this.searchQuery.trim().length >= 3) {
      this.searchService.setSearchQuery(this.searchQuery.trim());
    }
  }

  // Expose filter config service signals for template
  modeOptions = this.filterConfigService.modeOptions;
  selectedModes = this.filterConfigService.selectedModes;
  selectedBewertung = this.filterConfigService.selectedBewertung;

  toggleVerkehrsmittel(modeId: number) {
    // Find the mode option to check if it's pedestrian or car
    const modeOption = this.modeOptions().find(option => option.id === modeId);
    
    // Prevent deselecting pedestrian mode if it's currently selected
    if (modeOption && modeOption.name.toLowerCase() === 'pedestrian' && this.isSelected(modeId)) {
      return; // Don't allow deselecting pedestrian mode
    }
    
    // Prevent toggling car mode if it's disabled (persona cannot use car)
    if (this.isModeDisabled(modeId)) {
      return; // Don't allow toggling car mode when disabled
    }
    
    this.filterConfigService.toggleMode(modeId);
  }

  isSelected(modeId: number): boolean {
    return this.filterConfigService.isModeSelected(modeId);
  }

  isPedestrianMode(modeId: number): boolean {
    const modeOption = this.modeOptions().find(option => option.id === modeId);
    return modeOption?.name.toLowerCase() === 'pedestrian';
  }

  isCarMode(modeId: number): boolean {
    const modeOption = this.modeOptions().find(option => option.id === modeId);
    return modeOption?.name.toLowerCase() === 'car';
  }

  isModeDisabled(modeId: number): boolean {
    return this.filterConfigService.isModeDisabled(modeId);
  }

  getModeTooltip(option: { id: number; display_name: string }): string {
    if (this.isPedestrianMode(option.id) && this.isSelected(option.id)) {
      const cannotDisable = this.translate.instant('left.transportModes.cannotDisable');
      return `${option.display_name} - ${cannotDisable}`;
    }
    if (this.isCarMode(option.id) && this.isModeDisabled(option.id)) {
      const cannotUseCar = this.translate.instant('left.transportModes.cannotUseCar');
      return `${option.display_name} - ${cannotUseCar}`;
    }
    return option.display_name;
  }

  selectMobilitatsbewertung(bewertung: 'qualitaet' | 'zeit') {
    this.filterConfigService.setBewertung(bewertung);
  }

  isMobilitatsbewertungSelected(bewertung: 'qualitaet' | 'zeit'): boolean {
    return this.filterConfigService.isBewertungSelected(bewertung);
  }

  close() {
    this.onClose.emit();
  }
}
