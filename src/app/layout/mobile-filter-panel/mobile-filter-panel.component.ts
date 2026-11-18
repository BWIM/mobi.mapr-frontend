import { Component, inject, input, output, OnDestroy, ChangeDetectionStrategy, signal } from '@angular/core';
import { FilterConfigService } from '../../services/filter-config.service';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../services/project.service';
import { MapService } from '../../services/map.service';
import { MatDialog } from '@angular/material/dialog';
import { openCreditsDialog } from '../rail/credits-dialog/open-credits-dialog';
import { InfoOverlayComponent } from '../../shared/info-overlay/info-overlay.component';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { Subject } from 'rxjs';
import { ProjectSwitcherComponent } from '../../shared/project-switcher/project-switcher.component';
import { ProjectInfoComponent } from '../../shared/project-info/project-info.component';
import { ProfileOption } from '../../interfaces/profile';

import { GEOCODING_MIN_QUERY_LENGTH, GeocodingResult, GeocodingService } from '../../services/geocoding.service';

@Component({
  selector: 'app-mobile-filter-panel',
  imports: [SharedModule, TranslateModule, InfoOverlayComponent, ProjectSwitcherComponent, ProjectInfoComponent],
  templateUrl: './mobile-filter-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './mobile-filter-panel.component.css',
})
export class MobileFilterPanelComponent implements OnDestroy {
  isExpanded = input.required<boolean>();
  onClose = output<void>();
  private filterConfigService = inject(FilterConfigService);
  private translate = inject(TranslateService);
  private projectService = inject(ProjectsService);
  private mapService = inject(MapService);
  private geocoding = inject(GeocodingService);
  private dialog = inject(MatDialog);
  
  project = this.projectService.project;
  searchQuery: string = '';
  readonly searchResults = signal<GeocodingResult[]>([]);
  private searchSubject = new Subject<string>();
  
  private touchStartY: number = 0;
  private touchDragging = false;
  private readonly DRAG_THRESHOLD = 40;
  private readonly SWIPE_THRESHOLD = 30;

  constructor() {
    this.geocoding.searchAsYouType(this.searchSubject).subscribe(results => {
      this.searchResults.set(results);
    });
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery = input.value;
    // Short queries go through too (answered with no results) so retyping a query searches again.
    this.searchSubject.next(input.value);
    if (input.value.trim().length < GEOCODING_MIN_QUERY_LENGTH) {
      this.searchResults.set([]);
    }
  }

  onSearchSubmit(): void {
    this.searchSubject.next(this.searchQuery);
  }

  onLocationSelected(event: MatAutocompleteSelectedEvent): void {
    const { lat, lon, label } = event.option.value as GeocodingResult;

    const map = this.mapService.getMap();
    if (map) {
      map.flyTo({
        center: [lon, lat],
        zoom: 12,
        duration: 1500
      });
    }

    this.searchQuery = label;
    this.searchResults.set([]);
  }

  // Expose filter config service signals for template
  modeOptions = this.filterConfigService.modeOptions;
  isMapCompareMode = this.filterConfigService.isMapCompareMode;
  isDifferenceView = this.filterConfigService.isDifferenceView;
  isModeSelectionLocked = this.filterConfigService.isModeSelectionLocked;
  canUseMapCompare = this.filterConfigService.canUseMapCompare;
  canUseDifferenceView = this.filterConfigService.canUseDifferenceView;

  toggleMapCompare(): void {
    this.filterConfigService.toggleMapCompare();
  }

  toggleDifferenceView(): void {
    this.filterConfigService.toggleDifferenceView();
  }

  toggleVerkehrsmittel(modeId: number) {
    if (this.isModeSelectionLocked()) {
      return;
    }
    if (this.filterConfigService.isOnlySelectedMode(modeId)) {
      return;
    }
    if (this.isModeDisabled(modeId)) {
      return;
    }
    this.filterConfigService.toggleMode(modeId);
  }

  toggleRightVerkehrsmittel(modeId: number): void {
    if (this.isModeSelectionLocked()) {
      return;
    }
    if (this.filterConfigService.isRightOnlySelectedMode(modeId)) {
      return;
    }
    if (this.isModeDisabled(modeId)) {
      return;
    }
    this.filterConfigService.toggleRightMode(modeId);
  }

  isSelected(modeId: number): boolean {
    return this.filterConfigService.isModeSelected(modeId);
  }

  isOnlySelectedMode(modeId: number): boolean {
    return this.filterConfigService.isOnlySelectedMode(modeId);
  }

  isRightSelected(modeId: number): boolean {
    return this.filterConfigService.isRightModeSelected(modeId);
  }

  isRightOnlySelectedMode(modeId: number): boolean {
    return this.filterConfigService.isRightOnlySelectedMode(modeId);
  }

  isCarMode(profileId: number): boolean {
    const modeOption = this.modeOptions().find(option => option.id === profileId);
    return modeOption?.modeName.toLowerCase() === 'car';
  }

  isModeDisabled(modeId: number): boolean {
    return this.filterConfigService.isModeDisabled(modeId);
  }

  getModeTooltip(option: ProfileOption, isRight = false): string {
    const onlySelected = isRight ? this.isRightOnlySelectedMode(option.id) : this.isOnlySelectedMode(option.id);
    if (onlySelected) {
      const cannotDeselectLast = this.translate.instant('left.transportModes.cannotDeselectLast');
      return `${option.display_name} - ${cannotDeselectLast}`;
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
      this.touchDragging = true;
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.touchDragging || this.isExpanded() || event.touches.length === 0) {
      return;
    }

    const deltaY = this.touchStartY - event.touches[0].clientY;
    if (deltaY >= this.DRAG_THRESHOLD) {
      this.touchDragging = false;
      this.touchStartY = 0;
      this.onClose.emit();
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (!this.touchDragging || this.isExpanded()) {
      this.touchStartY = 0;
      this.touchDragging = false;
      return;
    }

    if (event.changedTouches.length > 0 && this.touchStartY) {
      const deltaY = this.touchStartY - event.changedTouches[0].clientY;
      if (deltaY > this.SWIPE_THRESHOLD) {
        this.onClose.emit();
      }
    }

    this.touchStartY = 0;
    this.touchDragging = false;
  }

  openCreditsDialog(): void {
    void openCreditsDialog(this.dialog);
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

  ngOnDestroy(): void {
    this.searchSubject.complete();
  }
}
