import { Component, inject } from '@angular/core';
import { ProjectsService } from '../../services/project.service';
import { FilterConfigService } from '../../services/filter-config.service';
import { SharedModule } from '../../shared/shared.module';
import { InfoOverlayComponent } from '../../shared/info-overlay/info-overlay.component';
import { InfoDialogComponent } from '../../shared/info-overlay/info-dialog.component';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-left',
  imports: [SharedModule, InfoOverlayComponent],
  templateUrl: './left.component.html',
  styleUrl: './left.component.css',
})
export class LeftComponent {
  private projectService = inject(ProjectsService);
  private filterConfigService = inject(FilterConfigService);
  private dialog = inject(MatDialog);

  // Use the project signal directly - it will reactively update when the project loads
  project = this.projectService.project;
  isLoading = this.projectService.isLoading;
  
  // Expose filter config service signals for template
  isExpanded = this.filterConfigService.isExpanded;
  modeOptions = this.filterConfigService.modeOptions;
  selectedModes = this.filterConfigService.selectedModes;
  selectedBewertung = this.filterConfigService.selectedBewertung;
  selectedActivities = this.filterConfigService.selectedActivities;
  selectedPersonas = this.filterConfigService.selectedPersonas;
  selectedRegioStars = this.filterConfigService.selectedRegioStars;
  selectedStates = this.filterConfigService.selectedStates;

  constructor() {
    // Initialize project if not already initialized
    if (!this.projectService.isInitialized()) {
      this.projectService.initializeProject();
    }
  }

  toggleSidebar() {
    this.filterConfigService.toggleSidebar();
  }

  toggleVerkehrsmittel(modeId: number) {
    this.filterConfigService.toggleMode(modeId);
  }

  isSelected(modeId: number): boolean {
    return this.filterConfigService.isModeSelected(modeId);
  }

  selectMobilitatsbewertung(bewertung: 'qualitaet' | 'zeit') {
    this.filterConfigService.setBewertung(bewertung);
  }

  isMobilitatsbewertungSelected(bewertung: 'qualitaet' | 'zeit'): boolean {
    return this.filterConfigService.isBewertungSelected(bewertung);
  }

  openFilterDialog() {
    this.filterConfigService.openFilterDialog();
  }

  openDialog() {
    this.dialog.open(InfoDialogComponent, {
      width: '80vw',
      height: '80vh',
      maxWidth: '80vw',
      maxHeight: '80vh',
    });
  }

}
