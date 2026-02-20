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

  setSidebarExpanded(expanded: boolean) {
    this.filterConfigService.setSidebarExpanded(expanded);
  }

  toggleVerkehrsmittel(modeId: number) {
    // Find the mode option to check if it's pedestrian
    const modeOption = this.modeOptions().find(option => option.id === modeId);
    
    // Prevent deselecting pedestrian mode if it's currently selected
    if (modeOption && modeOption.name.toLowerCase() === 'pedestrian' && this.isSelected(modeId)) {
      return; // Don't allow deselecting pedestrian mode
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

  getModeTooltip(option: { id: number; display_name: string }): string {
    if (this.isPedestrianMode(option.id) && this.isSelected(option.id)) {
      return `${option.display_name} - Kann nicht deaktiviert werden`;
    }
    return option.display_name;
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
