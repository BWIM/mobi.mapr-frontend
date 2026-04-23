import { Component, inject, input, output, OnDestroy } from '@angular/core';
import { FilterConfigService } from '../../services/filter-config.service';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../services/project.service';
import { MapService } from '../../services/map.service';
import { MatDialog } from '@angular/material/dialog';
import { CreditsDialogComponent } from '../rail/credits-dialog/credits-dialog.component';
import { InfoOverlayComponent } from '../../shared/info-overlay/info-overlay.component';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { firstValueFrom } from 'rxjs';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

@Component({
  selector: 'app-mobile-filter-panel',
  imports: [SharedModule, TranslateModule, InfoOverlayComponent],
  templateUrl: './mobile-filter-panel.component.html',
  styleUrl: './mobile-filter-panel.component.css',
})
export class MobileFilterPanelComponent implements OnDestroy {
  isExpanded = input.required<boolean>();
  onClose = output<void>();
  private filterConfigService = inject(FilterConfigService);
  private translate = inject(TranslateService);
  private projectService = inject(ProjectsService);
  private mapService = inject(MapService);
  private http = inject(HttpClient);
  private dialog = inject(MatDialog);
  
  project = this.projectService.project;
  isPreparingProject = this.mapService.isPreparingProject;
  searchQuery: string = '';
  searchResults: NominatimResult[] = [];
  private searchSubject = new Subject<string>();
  
  private touchStartY: number = 0;
  private touchStartTime: number = 0;
  private readonly SWIPE_THRESHOLD = 50; // Minimum distance in pixels
  private readonly SWIPE_MAX_TIME = 300; // Maximum time in milliseconds

  constructor() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => this.searchNominatim(query))
    ).subscribe(results => {
      this.searchResults = results;
    });
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const query = input.value.trim();
    this.searchQuery = input.value;
    if (query.length >= 3) {
      this.searchSubject.next(query);
    } else {
      this.searchResults = [];
    }
  }

  onSearchSubmit(): void {
    const query = this.searchQuery.trim();
    if (query.length >= 3) {
      this.searchSubject.next(query);
    }
  }

  onLocationSelected(event: MatAutocompleteSelectedEvent): void {
    const result = event.option.value as NominatimResult;
    const lat = Number.parseFloat(result.lat);
    const lon = Number.parseFloat(result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    const map = this.mapService.getMap();
    if (map) {
      map.flyTo({
        center: [lon, lat],
        zoom: 12,
        duration: 1500
      });
    }

    this.searchQuery = result.display_name;
    this.searchResults = [];
  }

  // Expose filter config service signals for template
  modeOptions = this.filterConfigService.modeOptions;
  selectedModes = this.filterConfigService.selectedModes;
  selectedBewertung = this.filterConfigService.selectedBewertung;

  toggleVerkehrsmittel(modeId: number) {
    if (this.filterConfigService.isOnlySelectedMode(modeId)) {
      return;
    }
    if (this.isModeDisabled(modeId)) {
      return;
    }
    this.filterConfigService.toggleMode(modeId);
  }

  isSelected(modeId: number): boolean {
    return this.filterConfigService.isModeSelected(modeId);
  }

  isOnlySelectedMode(modeId: number): boolean {
    return this.filterConfigService.isOnlySelectedMode(modeId);
  }

  isCarMode(modeId: number): boolean {
    const modeOption = this.modeOptions().find(option => option.id === modeId);
    return modeOption?.name.toLowerCase() === 'car';
  }

  isModeDisabled(modeId: number): boolean {
    return this.filterConfigService.isModeDisabled(modeId);
  }

  getModeTooltip(option: { id: number; display_name: string }): string {
    if (this.isOnlySelectedMode(option.id)) {
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

  private searchNominatim(query: string): Promise<NominatimResult[]> {
    if (!query || query.length < 3) {
      return Promise.resolve([]);
    }

    const params = new HttpParams()
      .set('q', query)
      .set('format', 'json')
      .set('limit', '10')
      .set('addressdetails', '1')
      .set('countrycodes', 'de');

    const headers = {
      'User-Agent': 'MapR-Frontend/1.0'
    };

    return firstValueFrom(
      this.http.get<NominatimResult[]>('https://nominatim.openstreetmap.org/search', { params, headers })
    ).catch(() => []);
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

  ngOnDestroy(): void {
    this.searchSubject.complete();
  }
}
