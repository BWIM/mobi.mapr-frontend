import { Component, inject, input, output } from '@angular/core';
import { FilterConfigService } from '../../services/filter-config.service';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SearchService } from '../../services/search.service';
import { ProjectsService } from '../../services/project.service';
import { MatDialog } from '@angular/material/dialog';
import { CreditsDialogComponent } from '../rail/credits-dialog/credits-dialog.component';
import { InfoOverlayComponent } from '../../shared/info-overlay/info-overlay.component';

@Component({
  selector: 'app-mobile-filter-panel',
  imports: [SharedModule, TranslateModule, InfoOverlayComponent],
  templateUrl: './mobile-filter-panel.component.html',
  styleUrl: './mobile-filter-panel.component.css',
})
export class MobileFilterPanelComponent {
  isExpanded = input.required<boolean>();
  onClose = output<void>();
  private filterConfigService = inject(FilterConfigService);
  private translate = inject(TranslateService);
  private searchService = inject(SearchService);
  private projectService = inject(ProjectsService);
  private dialog = inject(MatDialog);
  
  project = this.projectService.project;
  searchQuery: string = '';
  
  private touchStartY: number = 0;
  private touchStartTime: number = 0;
  private readonly SWIPE_THRESHOLD = 50; // Minimum distance in pixels
  private readonly SWIPE_MAX_TIME = 300; // Maximum time in milliseconds

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

  togglePanel() {
    this.onClose.emit();
  }

  onTouchStart(event: TouchEvent): void {
    if (event.touches.length > 0) {
      this.touchStartY = event.touches[0].clientY;
      this.touchStartTime = Date.now();
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (!this.touchStartY || event.changedTouches.length === 0) {
      return;
    }

    const touchEndY = event.changedTouches[0].clientY;
    const touchEndTime = Date.now();
    const deltaY = this.touchStartY - touchEndY; // Positive if swiped up
    const deltaTime = touchEndTime - this.touchStartTime;

    // Reset touch start values
    this.touchStartY = 0;
    this.touchStartTime = 0;

    // Check if it's a valid swipe up gesture
    // Only trigger if panel is collapsed
    if (!this.isExpanded() && 
        deltaY > this.SWIPE_THRESHOLD && 
        deltaTime < this.SWIPE_MAX_TIME) {
      // Swipe up detected - open the panel
      this.onClose.emit(); // This toggles the panel open
    }
  }

  openCreditsDialog(): void {
    this.dialog.open(CreditsDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh'
    });
  }

  getFormattedCreatedDate(): string {
    const projectData = this.project();
    if (!projectData?.created) {
      return '';
    }
    const createdDate = new Date(projectData.created);
    const day = String(createdDate.getDate()).padStart(2, '0');
    const month = String(createdDate.getMonth() + 1).padStart(2, '0');
    const year = createdDate.getFullYear();
    return `${day}.${month}.${year}`;
  }
}
