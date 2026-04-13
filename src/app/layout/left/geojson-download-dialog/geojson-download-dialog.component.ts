import { Component, Inject, inject } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { FilterConfigService } from '../../../services/filter-config.service';
import { SharedModule } from '../../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MapService } from '../../../services/map.service';

export interface GeoJsonDownloadDialogData {
  selectedActivities: number[];
  selectedPersonas: number | null;
  profileIds: number[] | null;
  hasCategories: boolean;
}

function requiredTrimmedEmail(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) {
    return { required: true };
  }
  return Validators.email(new FormControl(raw, { nonNullable: true }));
}

@Component({
  selector: 'app-geojson-download-dialog',
  standalone: true,
  imports: [
    SharedModule,
    TranslateModule,
    MatDialogModule,
    ReactiveFormsModule,
  ],
  templateUrl: './geojson-download-dialog.component.html',
  styleUrl: './geojson-download-dialog.component.css'
})
export class GeoJsonDownloadDialogComponent {
  private filterConfigService = inject(FilterConfigService);
  private mapService = inject(MapService);
  private translate = inject(TranslateService);

  states = this.filterConfigService.allStates;
  activities = this.filterConfigService.allActivities;
  personas = this.filterConfigService.allPersonas;
  allProfiles = this.filterConfigService.allProfiles;

  selectedExportFormat: 'geojson' | 'csv' = 'geojson';
  selectedResolution: 'hexagon' | 'municipality' | 'county' | 'state' | null = null;
  selectedStateId: number | null = null;
  includePopulation = false;

  emailControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [requiredTrimmedEmail],
  });

  currentActivities: number[] = [];
  currentPersonaId: number | null = null;
  currentProfileIds: number[] | null = null;
  hasCategories = false;

  /** Short request in flight */
  isSubmitting = false;
  /** User acknowledged the “check your email” step */
  exportConfirmed = false;
  submittedEmail = '';

  errorMessage: string | null = null;

  formatOptions = [
    { value: 'geojson' as const, label: 'geojsonDownload.format.geojson' },
    { value: 'csv' as const, label: 'geojsonDownload.format.csv' },
  ];

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
    this.currentActivities = data.selectedActivities || [];
    this.currentPersonaId = data.selectedPersonas ?? null;
    this.currentProfileIds = data.profileIds?.length ? [...data.profileIds] : null;
    this.hasCategories = data.hasCategories ?? false;

    const states = this.states();
    if (states.length > 0) {
      this.selectedStateId = states[0].id;
    }
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
    return (
      this.selectedResolution !== null &&
      this.selectedStateId !== null &&
      !!this.currentProfileIds?.length &&
      this.emailControl.valid
    );
  }

  shouldShowLicenseWarning(): boolean {
    return this.selectedResolution !== null && !this.exportConfirmed;
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

  onAcknowledgeSuccess() {
    this.dialogRef.close();
  }

  async onDownload() {
    if (!this.isFormValid()) {
      return;
    }

    this.emailControl.markAsTouched();
    if (this.emailControl.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;

    try {
      const state = this.states().find(s => s.id === this.selectedStateId);
      if (!state) {
        throw new Error('Selected state not found');
      }

      const emailTrimmed = this.emailControl.value.trim();

      await this.mapService.exportMapData({
        export_format: this.selectedExportFormat,
        resolution: this.selectedResolution!,
        state: state.name,
        profile_ids: this.currentProfileIds!,
        email: emailTrimmed,
        categories: this.currentActivities.length > 0 ? this.currentActivities : undefined,
        persona_id: this.currentPersonaId ?? undefined,
        include_population: this.includePopulation || undefined,
      });

      this.submittedEmail = emailTrimmed;
      this.exportConfirmed = true;
    } catch (error: unknown) {
      console.error('Error exporting map data:', error);
      const message = error instanceof Error ? error.message : '';
      this.errorMessage = message || 'geojsonDownload.error.generic';
    } finally {
      this.isSubmitting = false;
    }
  }
}
