import { Component, inject, effect } from '@angular/core';
import { ProjectsService } from '../../services/project.service';
import { ProfileService } from '../../services/profile.service';
import { SharedModule } from '../../shared/shared.module';
import { MatDialog } from '@angular/material/dialog';
import { FilterDialogComponent, FilterDialogData } from './filter-dialog/filter-dialog.component';
import { Profile, Mode } from '../../interfaces/profile';

@Component({
  selector: 'app-left',
  imports: [SharedModule],
  templateUrl: './left.component.html',
})
export class LeftComponent {
  private projectService = inject(ProjectsService);
  private profileService = inject(ProfileService);
  private dialog = inject(MatDialog);

  // Use the project signal directly - it will reactively update when the project loads
  project = this.projectService.project;
  isLoading = this.projectService.isLoading;
  
  isExpanded = false;
  selectedVerkehrsmittel: number[] = []; // Changed to number[] to store mode IDs
  selectedMobilitatsbewertung: string | null = 'qualitaet';
  selectedActivities: number[] = [];
  selectedPersonas: number[] = [];
  selectedRegioStars: number[] = [];
  selectedStates: number[] = [];

  // Store all available modes and profiles
  allModes: Mode[] = [];
  allProfiles: Profile[] = [];
  modeOptions: Array<{ id: number; name: string; display_name: string; icon: string }> = [];
  
  // Map mode IDs to icon names
  private modeIcons: { [key: string]: string } = {
    'pedestrian': 'directions_walk',
    'bicycle': 'directions_bike',
    'car': 'directions_car',
    'bus': 'directions_bus',
    'transit': 'train',
    'tram': 'tram',
    'default': 'directions'
  };

  constructor() {
    // Initialize project if not already initialized
    if (!this.projectService.isInitialized()) {
      this.projectService.initializeProject();
    }

    // Load profiles and modes
    this.loadProfilesAndModes();

    // React to project changes to update mode selection
    effect(() => {
      const currentProject = this.project();
      if (currentProject && this.allProfiles.length > 0) {
        this.updateModeSelection(currentProject.base_profiles);
      }
    });
  }

  private loadProfilesAndModes(): void {
    this.profileService.getProfiles(1, 1000).subscribe({
      next: (response) => {
        this.allProfiles = response.results;
        this.extractModes();
        // Update mode selection after modes are loaded
        this.updateModeSelectionFromProject();
      },
      error: (error) => {
        console.error('Error loading profiles:', error);
      }
    });
  }

  private updateModeSelectionFromProject(): void {
    const currentProject = this.project();
    if (currentProject && currentProject.base_profiles) {
      this.updateModeSelection(currentProject.base_profiles);
    }
  }

  private extractModes(): void {
    // Extract unique modes from profiles
    const modeMap = new Map<number, Mode>();
    
    this.allProfiles.forEach(profile => {
      if (profile.mode && !modeMap.has(profile.mode.id)) {
        modeMap.set(profile.mode.id, profile.mode);
      }
    });

    this.allModes = Array.from(modeMap.values());
  }

  private updateModeSelection(baseProfiles: number[]): void {
    if (!baseProfiles || baseProfiles.length === 0 || this.allProfiles.length === 0) {
      this.modeOptions = [];
      return;
    }

    // Find which modes are represented in base_profiles
    const modesInProject = new Set<number>();
    const modeMap = new Map<number, Mode>();
    
    baseProfiles.forEach(profileId => {
      const profile = this.allProfiles.find(p => p.id === profileId);
      if (profile && profile.mode) {
        modesInProject.add(profile.mode.id);
        if (!modeMap.has(profile.mode.id)) {
          modeMap.set(profile.mode.id, profile.mode);
        }
      }
    });

    // Preselect modes that have base_profiles
    this.selectedVerkehrsmittel = Array.from(modesInProject);

    // Only show modes that are in base_profiles
    this.modeOptions = Array.from(modeMap.values()).map(mode => ({
      id: mode.id,
      name: mode.name,
      display_name: mode.display_name,
      icon: this.modeIcons[mode.name.toLowerCase()] || this.modeIcons['default']
    }));
  }

  toggleSidebar() {
    this.isExpanded = !this.isExpanded;
  }

  toggleVerkehrsmittel(modeId: number) {
    const index = this.selectedVerkehrsmittel.indexOf(modeId);
    if (index > -1) {
      this.selectedVerkehrsmittel.splice(index, 1);
    } else {
      this.selectedVerkehrsmittel.push(modeId);
    }
  }

  isSelected(modeId: number): boolean {
    return this.selectedVerkehrsmittel.includes(modeId);
  }

  selectMobilitatsbewertung(id: string) {
    this.selectedMobilitatsbewertung = id;
  }

  isMobilitatsbewertungSelected(id: string): boolean {
    return this.selectedMobilitatsbewertung === id;
  }

  openFilterDialog() {
    const dialogData: FilterDialogData = {
      selectedActivities: this.selectedActivities,
      selectedPersonas: this.selectedPersonas,
      selectedRegioStars: this.selectedRegioStars,
      selectedStates: this.selectedStates
    };

    const dialogRef = this.dialog.open(FilterDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.selectedActivities = result.selectedActivities || [];
        this.selectedPersonas = result.selectedPersonas || [];
        this.selectedRegioStars = result.selectedRegioStars || [];
        this.selectedStates = result.selectedStates || [];
      }
    });
  }
}
