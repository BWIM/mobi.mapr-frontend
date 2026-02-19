import { Component, inject, effect } from '@angular/core';
import { ProjectsService } from '../../services/project.service';
import { ProfileService } from '../../services/profile.service';
import { MapService, ContentLayerFilters } from '../../services/map.service';
import { SharedModule } from '../../shared/shared.module';
import { MatDialog } from '@angular/material/dialog';
import { FilterDialogComponent, FilterDialogData } from './filter-dialog/filter-dialog.component';
import { Profile, Mode, ProfileCombination } from '../../interfaces/profile';
import { PreparingProjectDialogComponent } from './preparing-project-dialog/preparing-project-dialog.component';

@Component({
  selector: 'app-left',
  imports: [SharedModule],
  templateUrl: './left.component.html',
})
export class LeftComponent {
  private projectService = inject(ProjectsService);
  private profileService = inject(ProfileService);
  private mapService = inject(MapService);
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
  allProfileCombinations: ProfileCombination[] = [];
  currentProfileCombinationID: number | null = null;
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

    // Load profiles, modes, and profile combinations
    this.loadProfilesAndModes();
    this.loadProfileCombinations();

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

  private loadProfileCombinations(): void {
    this.profileService.getProfileCombinations(1, 1000).subscribe({
      next: (response) => {
        this.allProfileCombinations = response.results;
        // Update profile combination ID after combinations are loaded
        this.updateProfileCombinationID();
      },
      error: (error) => {
        console.error('Error loading profile combinations:', error);
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

    // Update profile combination ID after mode selection is updated
    if (this.allProfileCombinations.length > 0) {
      this.updateProfileCombinationID();
    }
  }

  private updateProfileCombinationID(): void {
    const currentProject = this.project();
    if (!currentProject || !currentProject.base_profiles || this.selectedVerkehrsmittel.length === 0) {
      this.currentProfileCombinationID = null;
      this.updateContentLayer();
      return;
    }

    // Find all profiles that match the selected modes and are in base_profiles
    const selectedProfileIds = this.allProfiles
      .filter(profile => 
        profile.mode && 
        this.selectedVerkehrsmittel.includes(profile.mode.id) &&
        currentProject.base_profiles.includes(profile.id)
      )
      .map(profile => profile.id)
      .sort((a, b) => a - b); // Sort for consistent comparison

    if (selectedProfileIds.length === 0) {
      this.currentProfileCombinationID = null;
      this.updateContentLayer();
      return;
    }

    // Find the profile combination that matches exactly
    const matchingCombination = this.allProfileCombinations.find(combination => {
      const sortedProfileIds = [...combination.profile_ids].sort((a, b) => a - b);
      return sortedProfileIds.length === selectedProfileIds.length &&
             sortedProfileIds.every((id, index) => id === selectedProfileIds[index]);
    });

    this.currentProfileCombinationID = matchingCombination ? matchingCombination.id : null;
    this.updateContentLayer();
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
    // Update profile combination ID when mode selection changes
    this.updateProfileCombinationID();
    // updateProfileCombinationID already calls updateContentLayer
  }

  isSelected(modeId: number): boolean {
    return this.selectedVerkehrsmittel.includes(modeId);
  }

  selectMobilitatsbewertung(id: string) {
    this.selectedMobilitatsbewertung = id;
    this.updateContentLayer();
  }

  isMobilitatsbewertungSelected(id: string): boolean {
    return this.selectedMobilitatsbewertung === id;
  }

  openFilterDialog() {
    const currentProject = this.project();
    const dialogData: FilterDialogData = {
      selectedActivities: this.selectedActivities,
      selectedPersonas: this.selectedPersonas,
      selectedRegioStars: this.selectedRegioStars,
      selectedStates: this.selectedStates,
      is_mid: currentProject?.is_mid ?? true
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
        this.updateContentLayer();
      }
    });
  }

  /**
   * Updates the content layer in the map based on current filter selections
   */
  private async updateContentLayer(): Promise<void> {
    // Don't update if profile combination ID is not available
    if (!this.currentProfileCombinationID) {
      this.mapService.removeContentLayer();
      return;
    }

    // Map "zeit" -> "Score" and "qualität" -> "Index"
    const featureType: 'index' | 'score' = this.selectedMobilitatsbewertung === 'zeit' ? 'score' : 'index';

    // Build filter parameters
    // Note: regiotyp_id accepts a single ID, so we use the first selected RegioStar if any are selected
    const filters: ContentLayerFilters = {
      profile_combination_id: this.currentProfileCombinationID,
      feature_type: featureType,
      state_ids: this.selectedStates.length > 0 ? this.selectedStates : undefined,
      category_ids: this.selectedActivities.length > 0 ? this.selectedActivities : undefined,
      persona_ids: this.selectedPersonas.length > 0 ? this.selectedPersonas : undefined,
      regiotyp_id: this.selectedRegioStars.length === 1 ? this.selectedRegioStars[0] : 
                   (this.selectedRegioStars.length > 1 ? this.selectedRegioStars[0] : undefined)
    };

    let dialogRef: any = null;

    try {
      // Call the ready endpoint first to check if project is ready
      console.log('Calling ready endpoint with filters:', filters);
      const readyResponse = await this.mapService.checkReady(filters);
      console.log('Ready endpoint call completed:', readyResponse);

      // Only open dialog if project is not ready (cache_flag is false)
      if (!readyResponse.cache_flag) {
        // Show preparing dialog (non-closable) for preloading
        dialogRef = this.dialog.open(PreparingProjectDialogComponent, {
          width: '400px',
          disableClose: true,
          hasBackdrop: true,
          panelClass: 'preparing-project-dialog-panel'
        });

        // Wait for preload via websocket
        if (readyResponse.session_id) {
          console.log('Data not cached, waiting for preload via websocket, session_id:', readyResponse.session_id);
          await this.mapService.waitForPreload(readyResponse.session_id);
          console.log('Preload completed via websocket');
        }
      } else {
        // Project is ready, show loading indicator on map instead
        this.mapService.setMapLoading(true);
      }
    } catch (error) {
      console.error('Error checking ready status or waiting for preload:', error);
      // Continue with loading even if ready check fails
    } finally {
      // Close the dialog if it was opened
      if (dialogRef) {
        dialogRef.close();
      }
    }

    // Load the content layer with current filters
    this.mapService.loadContentLayer(filters);
    
    // Clear loading state after a short delay to allow map to render
    const wasLoading = this.mapService.isMapLoading();
    if (wasLoading) {
      setTimeout(() => {
        this.mapService.setMapLoading(false);
      }, 500);
    }
  }
}
