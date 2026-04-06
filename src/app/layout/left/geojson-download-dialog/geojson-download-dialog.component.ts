import { Component, OnInit, Inject, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { FilterConfigService } from '../../../services/filter-config.service';
import { ProjectsService } from '../../../services/project.service';
import { SharedModule } from '../../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MapService } from '../../../services/map.service';

export interface GeoJsonDownloadDialogData {
  selectedActivities: number[];
  selectedPersonas: number | null;
  profileIds: number[] | null;
  hasCategories: boolean;
}

export interface GeoJsonDownloadParams {
  resolution: 'hexagon' | 'municipality' | 'county' | 'state';
  state: string;
}

@Component({
  selector: 'app-geojson-download-dialog',
  standalone: true,
  imports: [
    SharedModule,
    TranslateModule,
    MatDialogModule,
  ],
  templateUrl: './geojson-download-dialog.component.html',
  styleUrl: './geojson-download-dialog.component.css'
})
export class GeoJsonDownloadDialogComponent implements OnInit {
  private filterConfigService = inject(FilterConfigService);
  private projectService = inject(ProjectsService);
  private mapService = inject(MapService);
  private translate = inject(TranslateService);

  // Get project for creation date
  project = this.projectService.project;

  // Get data from FilterConfigService
  states = this.filterConfigService.allStates;
  activities = this.filterConfigService.allActivities;
  personas = this.filterConfigService.allPersonas;
  allProfiles = this.filterConfigService.allProfiles;

  // Form values
  selectedResolution: 'hexagon' | 'municipality' | 'county' | 'state' | null = null;
  selectedStateId: number | null = null;

  // Current settings (read-only)
  currentActivities: number[] = [];
  currentPersonaId: number | null = null;
  currentProfileIds: number[] | null = null;
  hasCategories: boolean = false;

  // UI state
  isDownloading = false;
  errorMessage: string | null = null;
  preloadingMessage: string | null = null;
  preloadingProgress: number | null = null;

  // Resolution options
  resolutionOptions = [
    { value: 'hexagon' as const, label: 'geojsonDownload.resolution.hexagon' },
    { value: 'municipality' as const, label: 'geojsonDownload.resolution.municipality' },
    { value: 'county' as const, label: 'geojsonDownload.resolution.county' },
    { value: 'state' as const, label: 'geojsonDownload.resolution.state' },
  ];

  constructor(
    public dialogRef: MatDialogRef<GeoJsonDownloadDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: GeoJsonDownloadDialogData
  ) {
    // Initialize current settings from data
    this.currentActivities = data.selectedActivities || [];
    this.currentPersonaId = data.selectedPersonas ?? null;
    this.currentProfileIds = data.profileIds?.length ? [...data.profileIds] : null;
    this.hasCategories = data.hasCategories ?? false;

    // Set default selected state to first state if available
    const states = this.states();
    if (states.length > 0) {
      this.selectedStateId = states[0].id;
    }
  }

  ngOnInit() {
    // Data is already loaded by FilterConfigService
  }

  getSelectedStateName(): string {
    if (!this.selectedStateId) return '';
    const state = this.states().find(s => s.id === this.selectedStateId);
    return state ? state.name : '';
  }

  getCurrentActivitiesDisplay(): string {
    if (this.currentActivities.length === 0) {
      const key = this.hasCategories ? 'geojsonDownload.currentSettings.none' : 'geojsonDownload.currentSettings.notApplicable';
      return this.translate.instant(key);
    }
    const activityNames = this.currentActivities
      .map(id => {
        const activity = this.activities().find(a => a.id === id);
        return activity ? (activity.display_name || activity.name) : '';
      })
      .filter(name => name !== '');
    
    if (activityNames.length === 0) {
      return this.translate.instant('geojsonDownload.currentSettings.none');
    }
    if (activityNames.length <= 3) {
      return activityNames.join(', ');
    }
    return `${activityNames.slice(0, 3).join(', ')} +${activityNames.length - 3}`;
  }

  getCurrentPersonaDisplay(): string {
    if (!this.currentPersonaId) {
      const key = this.hasCategories ? 'geojsonDownload.currentSettings.none' : 'geojsonDownload.currentSettings.notApplicable';
      return this.translate.instant(key);
    }
    const persona = this.personas().find(p => p.id === this.currentPersonaId);
    return persona ? (persona.display_name || persona.name) : this.translate.instant('geojsonDownload.currentSettings.none');
  }

  getCurrentProfilesDisplay(): string {
    if (!this.currentProfileIds?.length) {
      return this.translate.instant('geojsonDownload.currentSettings.none');
    }
    const names = this.currentProfileIds
      .map(id => {
        const p = this.allProfiles().find(pr => pr.id === id);
        return p ? (p.display_name || p.name) : '';
      })
      .filter(n => n !== '');
    return names.length > 0 ? names.join(', ') : this.translate.instant('geojsonDownload.currentSettings.none');
  }

  isFormValid(): boolean {
    return this.selectedResolution !== null && this.selectedStateId !== null && !!this.currentProfileIds?.length;
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

  getLicenseText(): string {
    const createdDate = this.getFormattedCreatedDate();
    const baseLicense = this.translate.instant('geojsonDownload.license.base', {
      date: createdDate
    });

    if (this.selectedResolution === 'municipality') {
      return baseLicense + ' ' + this.translate.instant('geojsonDownload.license.municipalityNote');
    }

    return baseLicense;
  }

  shouldShowLicenseWarning(): boolean {
    return this.selectedResolution !== null;
  }

  getCcByUrl(): string {
    const lang = this.translate.currentLang || 'en';
    return lang.startsWith('de')
      ? 'https://creativecommons.org/licenses/by/4.0/deed.de'
      : 'https://creativecommons.org/licenses/by/4.0/';
  }

  onCancel() {
    this.dialogRef.close();
  }

  async onDownload() {
    if (!this.isFormValid()) {
      return;
    }

    this.isDownloading = true;
    this.errorMessage = null;
    this.preloadingMessage = null;
    this.preloadingProgress = null;

    try {
      const state = this.states().find(s => s.id === this.selectedStateId);
      if (!state) {
        throw new Error('Selected state not found');
      }

      const params: GeoJsonDownloadParams = {
        resolution: this.selectedResolution!,
        state: state.name,
      };

      const result = await this.mapService.downloadGeoJSON({
        resolution: params.resolution,
        state: params.state,
        categories: this.currentActivities.length > 0 ? this.currentActivities : undefined,
        profile_ids: this.currentProfileIds!,
        persona_id: this.currentPersonaId ?? undefined,
      });

      if (result.status === 'preloading') {
        // Handle preloading case
        this.preloadingMessage = result.message || 'geojsonDownload.preloading.message';
        this.preloadingProgress = result.progress ?? null;
        // Don't close dialog, show message
      } else if (result.status === 'success') {
        // Download was successful
        this.dialogRef.close();
      }
    } catch (error: any) {
      console.error('Error downloading GeoJSON:', error);
      this.errorMessage = error.message || 'geojsonDownload.error.generic';
    } finally {
      this.isDownloading = false;
    }
  }
}
