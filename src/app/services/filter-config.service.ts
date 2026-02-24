import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { ProfileService } from './profile.service';
import { ProjectsService } from './project.service';
import { SettingsService } from './settings.service';
import { MapService, ContentLayerFilters } from './map.service';
import { Profile, Mode, ProfileCombination } from '../interfaces/profile';
import { MatDialog } from '@angular/material/dialog';
import { FilterDialogComponent, FilterDialogData } from '../layout/left/filter-dialog/filter-dialog.component';
import { PreparingProjectDialogComponent } from '../layout/left/preparing-project-dialog/preparing-project-dialog.component';
import { ActivityService } from './activity.service';
import { PersonaService } from './persona.service';
import { RegioStarService } from './regiostar.service';
import { StateService } from './state.service';
import { CategoryService } from './category.service';
import { Activity } from '../interfaces/activity';
import { Persona } from '../interfaces/persona';
import { RegioStar } from '../interfaces/regiostar';
import { Category } from '../interfaces/category';
import { State } from '../interfaces/features';
import { forkJoin } from 'rxjs';

export interface FilterState {
  // UI state
  isExpanded: boolean;
  
  // Mode selection (verkehrsmittel)
  selectedModes: number[];
  
  // Mobility evaluation (bewertung)
  selectedBewertung: 'qualitaet' | 'zeit';
  
  // Advanced filters
  selectedActivities: number[];
  selectedPersonas: number[];
  selectedRegioStars: number[];
  selectedStates: number[];
}

@Injectable({
  providedIn: 'root'
})
export class FilterConfigService {
  private profileService = inject(ProfileService);
  private projectService = inject(ProjectsService);
  private settingsService = inject(SettingsService);
  private mapService = inject(MapService);
  private dialog = inject(MatDialog);
  private activityService = inject(ActivityService);
  private personaService = inject(PersonaService);
  private regiostarService = inject(RegioStarService);
  private stateService = inject(StateService);
  private categoryService = inject(CategoryService);

  // Internal state signals
  private _isExpanded = signal<boolean>(false);
  private _selectedModes = signal<number[]>([]);
  private _selectedBewertung = signal<'qualitaet' | 'zeit'>('qualitaet');
  private _selectedActivities = signal<number[]>([]);
  private _selectedPersonas = signal<number[]>([]);
  private _selectedRegioStars = signal<number[]>([]);
  private _selectedStates = signal<number[]>([]);

  // Metadata for mode selection
  private _allModes = signal<Mode[]>([]);
  private _allProfiles = signal<Profile[]>([]);
  private _allProfileCombinations = signal<ProfileCombination[]>([]);
  private _modeOptions = signal<Array<{ id: number; name: string; display_name: string; icon: string }>>([]);

  // Filter data
  private _allActivities = signal<Activity[]>([]);
  private _allCategories = signal<Category[]>([]);
  private _allPersonas = signal<Persona[]>([]);
  private _allRegioStars = signal<RegioStar[]>([]);
  private _allStates = signal<State[]>([]);

  // Public readonly signals
  readonly isExpanded = this._isExpanded.asReadonly();
  readonly selectedModes = this._selectedModes.asReadonly();
  readonly selectedBewertung = this._selectedBewertung.asReadonly();
  readonly selectedActivities = this._selectedActivities.asReadonly();
  readonly selectedPersonas = this._selectedPersonas.asReadonly();
  readonly selectedRegioStars = this._selectedRegioStars.asReadonly();
  readonly selectedStates = this._selectedStates.asReadonly();
  readonly modeOptions = this._modeOptions.asReadonly();
  readonly allModes = this._allModes.asReadonly();
  readonly allProfiles = this._allProfiles.asReadonly();
  readonly allProfileCombinations = this._allProfileCombinations.asReadonly();
  readonly allActivities = this._allActivities.asReadonly();
  readonly allCategories = this._allCategories.asReadonly();
  readonly allPersonas = this._allPersonas.asReadonly();
  readonly allRegioStars = this._allRegioStars.asReadonly();
  readonly allStates = this._allStates.asReadonly();

  // Grouped data for nested selects
  readonly groupedCategories = computed(() => {
    const categories = this._allCategories();
    const grouped = new Map<string, Category[]>();
    
    categories.forEach(category => {
      const key = (category.wegezweck && String(category.wegezweck)) || 'Other';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(category);
    });
    
    return Array.from(grouped.entries()).map(([wegezweck, items]) => ({
      wegezweck,
      categories: items.sort((a, b) => {
        const aName = (a.display_name || a.name || '');
        const bName = (b.display_name || b.name || '');
        return aName.localeCompare(bName);
      })
    })).sort((a, b) => {
      const aName = a.wegezweck || '';
      const bName = b.wegezweck || '';
      return aName.localeCompare(bName);
    });
  });

  readonly groupedRegioStars = computed(() => {
    const regiostars = this._allRegioStars();
    const grouped = new Map<string, RegioStar[]>();
    
    regiostars.forEach(regiostar => {
      const key = (regiostar.class_name?.display_name) || 'Other';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(regiostar);
    });
    
    return Array.from(grouped.entries()).map(([class_name, items]) => ({
      class_name,
      regiostars: items.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    })).sort((a, b) => {
      const aName = a.class_name || '';
      const bName = b.class_name || '';
      return aName.localeCompare(bName);
    });
  });

  // Computed signal for current profile combination ID
  readonly currentProfileCombinationID = computed(() => {
    const project = this.projectService.project();
    const selectedModes = this._selectedModes();
    const allProfiles = this._allProfiles();
    const allProfileCombinations = this._allProfileCombinations();

    if (!project || !project.base_profiles || selectedModes.length === 0) {
      return null;
    }

    // Find all profiles that match the selected modes and are in base_profiles
    const selectedProfileIds = allProfiles
      .filter(profile =>
        profile.mode &&
        selectedModes.includes(profile.mode.id) &&
        project.base_profiles.includes(profile.id)
      )
      .map(profile => profile.id)
      .sort((a, b) => a - b);

    if (selectedProfileIds.length === 0) {
      return null;
    }

    // Find the profile combination that matches exactly
    const matchingCombination = allProfileCombinations.find(combination => {
      const sortedProfileIds = [...combination.profile_ids].sort((a, b) => a - b);
      return sortedProfileIds.length === selectedProfileIds.length &&
        sortedProfileIds.every((id, index) => id === selectedProfileIds[index]);
    });

    return matchingCombination ? matchingCombination.id : null;
  });

  // Computed signal for ContentLayerFilters
  readonly contentLayerFilters = computed<ContentLayerFilters | null>(() => {
    const profileCombinationID = this.currentProfileCombinationID();
    if (!profileCombinationID) {
      return null;
    }

    const currentProject = this.projectService.project();
    const isMid = currentProject?.is_mid ?? false;

    const featureType: 'index' | 'score' = this._selectedBewertung() === 'zeit' ? 'score' : 'index';
    const selectedStates = this._selectedStates();
    const selectedActivities = this._selectedActivities();
    const selectedPersonas = this._selectedPersonas();
    const selectedRegioStars = this._selectedRegioStars();

    return {
      profile_combination_id: profileCombinationID,
      feature_type: featureType,
      state_ids: selectedStates.length > 0 ? selectedStates : undefined,
      // Only include category_ids and persona_ids if project is MID
      category_ids: (isMid && selectedActivities.length > 0) ? selectedActivities : undefined,
      persona_ids: (isMid && selectedPersonas.length > 0) ? selectedPersonas : undefined,
      regiotyp_id: selectedRegioStars.length === 1 ? selectedRegioStars[0] :
        (selectedRegioStars.length > 1 ? selectedRegioStars[0] : undefined),
      regiostar_ids: selectedRegioStars.length > 0 ? selectedRegioStars : undefined
    };
  });

  // Map mode IDs to icon names
  private readonly modeIcons: { [key: string]: string } = {
    'pedestrian': 'directions_walk',
    'bicycle': 'directions_bike',
    'car': 'directions_car',
    'bus': 'directions_bus',
    'transit': 'train',
    'tram': 'tram',
    'default': 'directions'
  };

  // Guard to prevent concurrent updateMapLayer calls
  private updateMapLayerInProgress = false;

  constructor() {
    // Initialize data loading
    this.loadProfilesAndModes();
    this.loadProfileCombinations();

    // Track previous project ID to detect project changes
    let previousProjectId: number | null = null;

    // React to project changes to load all filter data and update mode selection
    effect(() => {
      const currentProject = this.projectService.project();
      if (currentProject) {
        // Reset activities and personas when project changes
        if (previousProjectId !== null && previousProjectId !== currentProject.id) {
          this._selectedActivities.set([]);
          this._selectedPersonas.set([]);
        }
        previousProjectId = currentProject.id;

        // Load all filter data when project is loaded
        this.loadAllFilterData(currentProject.is_mid);
        
        // Update mode selection if profiles are already loaded
        if (this._allProfiles().length > 0) {
          this.updateModeSelection(currentProject.base_profiles);
        }
      } else {
        // Reset when project is cleared
        previousProjectId = null;
      }
    });

    // React to filter changes and update map
    // Track previous filter state to determine if it's a full reload or tile-only update
    let previousFilters: ContentLayerFilters | null = null;
    let isInitialLoad = true;
    effect(() => {
      const filters = this.contentLayerFilters();
      if (filters) {
        // On initial load, always do a full reload
        // Otherwise, determine if this is a full reload (filter settings changed) or tile-only update (modes/bewertung changed)
        const isFullReload = isInitialLoad || (previousFilters && (
          JSON.stringify(previousFilters.state_ids?.sort()) !== JSON.stringify(filters.state_ids?.sort()) ||
          JSON.stringify(previousFilters.category_ids?.sort()) !== JSON.stringify(filters.category_ids?.sort()) ||
          JSON.stringify(previousFilters.persona_ids?.sort()) !== JSON.stringify(filters.persona_ids?.sort()) ||
          previousFilters.regiotyp_id !== filters.regiotyp_id
        ));
        
        if (isFullReload) {
          // Full reload with zoom to bounds
          this.updateMapLayer(filters, true).catch(error => {
            console.error('Error in updateMapLayer (full reload):', error);
          });
        } else {
          // Tile-only update (modes or bewertung changed) - preserve map position
          this.updateMapLayer(filters, false).catch(error => {
            console.error('Error in updateMapLayer (tile update):', error);
          });
        }
        
        previousFilters = { ...filters };
        isInitialLoad = false;
      } else {
        this.mapService.removeContentLayer();
        previousFilters = null;
        isInitialLoad = true;
      }
    });

    // Load settings from localStorage
    this.loadSettings();
  }

  /**
   * Load profiles and modes from API
   */
  private loadProfilesAndModes(): void {
    this.profileService.getProfiles(1, 1000).subscribe({
      next: (response) => {
        this._allProfiles.set(response.results);
        this.extractModes();
        this.updateModeSelectionFromProject();
        // Validate and update mode selection after modes are loaded
        this.validateModeSelection();
      },
      error: (error) => {
        console.error('Error loading profiles:', error);
      }
    });
  }

  /**
   * Load profile combinations from API
   */
  private loadProfileCombinations(): void {
    this.profileService.getProfileCombinations(1, 1000).subscribe({
      next: (response) => {
        this._allProfileCombinations.set(response.results);
      },
      error: (error) => {
        console.error('Error loading profile combinations:', error);
      }
    });
  }

  /**
   * Load all filter data (RegioStars, States, Categories and Personas if mid)
   */
  private loadAllFilterData(isMid: boolean): void {
    // Always load RegioStars and States
    const regiostars$ = this.regiostarService.getRegioStars(1, 100);
    const states$ = this.stateService.getStates(1, 100);

    if (isMid) {
      // Load Categories and Personas only if mid
      const categories$ = this.categoryService.getCategories(1, 100, isMid);
      const personas$ = this.personaService.getPersonas(1, 100);

      forkJoin({
        regiostars: regiostars$,
        states: states$,
        categories: categories$,
        personas: personas$
      }).subscribe({
        next: (responses) => {
          this._allRegioStars.set(responses.regiostars.results);
          this._allStates.set(responses.states.results);
          this._allCategories.set(responses.categories.results);
          this._allPersonas.set(responses.personas.results);

          // Preselect all items
          this.preselectAllRegioStars();
          this.preselectAllStates();
          this.preselectAllCategories();
          this.preselectAllPersonas();
        },
        error: (error) => {
          console.error('Error loading filter data:', error);
        }
      });
    } else {
      // Load only RegioStars and States if not mid
      forkJoin({
        regiostars: regiostars$,
        states: states$
      }).subscribe({
        next: (responses) => {
          this._allRegioStars.set(responses.regiostars.results);
          this._allStates.set(responses.states.results);

          // Preselect all RegioStars and States
          this.preselectAllRegioStars();
          this.preselectAllStates();

          // Clear categories, activities and personas if not mid
          this._allCategories.set([]);
          this._allActivities.set([]);
          this._allPersonas.set([]);
          this._selectedActivities.set([]);
          this._selectedPersonas.set([]);
        },
        error: (error) => {
          console.error('Error loading filter data:', error);
        }
      });
    }
  }

  /**
   * Preselect all categories
   */
  private preselectAllCategories(): void {
    const allCategoryIds = this._allCategories().map(c => c.id);
    this._selectedActivities.set([...allCategoryIds]);
  }

  /**
   * Preselect all activities
   */
  private preselectAllActivities(): void {
    const allActivityIds = this._allActivities().map(a => a.id);
    this._selectedActivities.set([...allActivityIds]);
  }

  /**
   * Preselect all personas
   */
  private preselectAllPersonas(): void {
    const allPersonaIds = this._allPersonas().map(p => p.id);
    this._selectedPersonas.set([...allPersonaIds]);
  }

  /**
   * Preselect all regiostars
   */
  private preselectAllRegioStars(): void {
    const allRegioStarIds = this._allRegioStars().map(r => r.id);
    this._selectedRegioStars.set([...allRegioStarIds]);
  }

  /**
   * Preselect all states
   */
  private preselectAllStates(): void {
    const allStateIds = this._allStates().map(s => s.id);
    this._selectedStates.set([...allStateIds]);
  }

  /**
   * Extract unique modes from profiles
   */
  private extractModes(): void {
    const modeMap = new Map<number, Mode>();
    this._allProfiles().forEach(profile => {
      if (profile.mode && !modeMap.has(profile.mode.id)) {
        modeMap.set(profile.mode.id, profile.mode);
      }
    });
    this._allModes.set(Array.from(modeMap.values()));
  }

  /**
   * Update mode selection based on project base_profiles
   */
  private updateModeSelectionFromProject(): void {
    const currentProject = this.projectService.project();
    if (currentProject && currentProject.base_profiles) {
      this.updateModeSelection(currentProject.base_profiles);
    }
  }

  /**
   * Update available mode options and validate selection
   */
  private updateModeSelection(baseProfiles: number[]): void {
    if (!baseProfiles || baseProfiles.length === 0 || this._allProfiles().length === 0) {
      this._modeOptions.set([]);
      return;
    }

    // Find which modes are represented in base_profiles
    const modesInProject = new Set<number>();
    const modeMap = new Map<number, Mode>();

    baseProfiles.forEach(profileId => {
      const profile = this._allProfiles().find(p => p.id === profileId);
      if (profile && profile.mode) {
        modesInProject.add(profile.mode.id);
        if (!modeMap.has(profile.mode.id)) {
          modeMap.set(profile.mode.id, profile.mode);
        }
      }
    });

    // Only show modes that are in base_profiles
    this._modeOptions.set(Array.from(modeMap.values()).map(mode => ({
      id: mode.id,
      name: mode.name,
      display_name: mode.display_name,
      icon: this.modeIcons[mode.name.toLowerCase()] || this.modeIcons['default']
    })));

    // Validate current selection against available modes
    this.validateModeSelection();
  }

  /**
   * Validate and update mode selection against available modes
   */
  private validateModeSelection(): void {
    const currentProject = this.projectService.project();
    if (!currentProject || !currentProject.base_profiles) {
      return;
    }

    const modesInProject = new Set<number>();
    currentProject.base_profiles.forEach(profileId => {
      const profile = this._allProfiles().find(p => p.id === profileId);
      if (profile && profile.mode) {
        modesInProject.add(profile.mode.id);
      }
    });

    const currentModes = this._selectedModes();
    
    // If no modes selected, preselect all available modes
    if (currentModes.length === 0) {
      this._selectedModes.set(Array.from(modesInProject));
      return;
    }

    // Filter out any selected modes that are not available in the current project
    const validModes = currentModes.filter(modeId => modesInProject.has(modeId));
    
    // If all selected modes were invalid, fall back to all available modes
    if (validModes.length === 0 && modesInProject.size > 0) {
      this._selectedModes.set(Array.from(modesInProject));
    } else if (validModes.length !== currentModes.length) {
      // Update if some modes were filtered out
      this._selectedModes.set(validModes);
    }
  }

  /**
   * Toggle sidebar expansion
   */
  toggleSidebar(): void {
    this._isExpanded.update(expanded => !expanded);
    this.saveSettings();
  }

  /**
   * Set sidebar expansion state
   */
  setSidebarExpanded(expanded: boolean): void {
    this._isExpanded.set(expanded);
    this.saveSettings();
  }

  /**
   * Toggle mode selection
   */
  toggleMode(modeId: number): void {
    const currentModes = this._selectedModes();
    const index = currentModes.indexOf(modeId);
    if (index > -1) {
      this._selectedModes.set(currentModes.filter(id => id !== modeId));
    } else {
      this._selectedModes.set([...currentModes, modeId]);
    }
    this.saveSettings();
  }

  /**
   * Check if mode is selected
   */
  isModeSelected(modeId: number): boolean {
    return this._selectedModes().includes(modeId);
  }

  /**
   * Set mobility evaluation (bewertung)
   */
  setBewertung(bewertung: 'qualitaet' | 'zeit'): void {
    this._selectedBewertung.set(bewertung);
    this.saveSettings();
  }

  /**
   * Check if bewertung is selected
   */
  isBewertungSelected(bewertung: 'qualitaet' | 'zeit'): boolean {
    return this._selectedBewertung() === bewertung;
  }

  /**
   * Open filter dialog for advanced filters
   */
  openFilterDialog(): void {
    const currentProject = this.projectService.project();
    const dialogData: FilterDialogData = {
      selectedActivities: this._selectedActivities(),
      selectedPersonas: this._selectedPersonas(),
      selectedRegioStars: this._selectedRegioStars(),
      selectedStates: this._selectedStates(),
      is_mid: currentProject?.is_mid ?? true
    };

    const dialogRef = this.dialog.open(FilterDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this._selectedActivities.set(result.selectedActivities || []);
        this._selectedPersonas.set(result.selectedPersonas || []);
        this._selectedRegioStars.set(result.selectedRegioStars || []);
        this._selectedStates.set(result.selectedStates || []);
        this.saveSettings();
      }
    });
  }


  /**
   * Update map layer with current filters
   * @param filters - The filter parameters
   * @param fullReload - Whether to do a full reload with zoom to bounds (default: true)
   */
  private async updateMapLayer(filters: ContentLayerFilters, fullReload: boolean = true): Promise<void> {
    // Prevent concurrent calls - if one is already in progress, skip this one
    if (this.updateMapLayerInProgress) {
      console.log('updateMapLayer already in progress, skipping concurrent call');
      return;
    }

    this.updateMapLayerInProgress = true;
    let dialogRef: any = null;

    try {
      // Set loading state immediately to prevent race conditions
      // This ensures other components (like stats) don't call APIs before project is ready
      this.mapService.setMapLoading(true);

      // Call the ready endpoint first to check if project is ready
      // Only check ready for full reloads (filter changes), not for tile-only updates
      if (fullReload) {
        console.log('Calling ready endpoint with filters:', filters);
        try {
          const readyResponse = await this.mapService.checkReady(filters);
          console.log('Ready endpoint call completed:', readyResponse);

          // Only open dialog if project is not ready (cache_flag is false)
          if (!readyResponse.cache_flag) {
            // Show preparing dialog (non-closable) for preloading
            dialogRef = this.dialog.open(PreparingProjectDialogComponent, {
              width: '80%',
              maxWidth: '900px',
              disableClose: true,
              hasBackdrop: true,
              panelClass: 'preparing-project-dialog-panel',
              data: { sessionId: readyResponse.session_id }
            });

            if (readyResponse.session_id) {
              console.log('Data not cached, waiting for preload via websocket, session_id:', readyResponse.session_id);
              try {
                await this.mapService.waitForPreload(readyResponse.session_id);
                console.log('Preload completed via websocket');
              } catch (preloadError) {
                console.error('Error waiting for preload via websocket:', preloadError);
              }
            } else {
              console.warn('No session_id provided, cannot wait for preload');
            }
          }
          // If cache_flag is true, the endpoint was successful and data is ready
          // Proceed to load content layer below
        } catch (readyError) {
          console.error('Error calling ready endpoint:', readyError);
          // If ready endpoint fails, we can't determine if data is ready
          this.mapService.setMapLoading(false);
          return;
        }
      }

      // Close the dialog if it was opened (before loading content layer)
      if (dialogRef) {
        dialogRef.close();
        dialogRef = null;
      }

      // Only load the content layer AFTER we've confirmed data is ready
      // (either via cache_flag: true OR websocket completion)
      // Use updateContentLayerTiles for tile-only updates to preserve map position
      console.log('Loading content layer after ready check/websocket completion');
      if (fullReload) {
        await this.mapService.loadContentLayer(filters, true);
      } else {
        await this.mapService.updateContentLayerTiles(filters);
      }

      // Loading state will be managed by map event listeners (dataloading/idle events)
      // in center.component.ts, so we don't need to manually clear it here
    } catch (error) {
      console.error('Error in updateMapLayer:', error);
      // Make sure to close dialog and reset loading state on error
      if (dialogRef) {
        dialogRef.close();
      }
      this.mapService.setMapLoading(false);
    } finally {
      // Always reset the guard, even if an error occurred
      this.updateMapLayerInProgress = false;
    }
  }

  /**
   * Load settings from localStorage
   */
  private loadSettings(): void {
    const settings = this.settingsService.loadSettings();
    if (settings) {
      this._isExpanded.set(settings.expanded ?? false);
      this._selectedBewertung.set((settings.bewertung === 'zeit' ? 'zeit' : 'qualitaet') as 'qualitaet' | 'zeit');

      // Load filter settings
      if (settings.filters) {
        this._selectedActivities.set(settings.filters.activities || []);
        this._selectedPersonas.set(settings.filters.personas || []);
        this._selectedRegioStars.set(settings.filters.regiostars || []);
        this._selectedStates.set(settings.filters.states || []);
      }

      // Load mode selection (will be validated later)
      if (settings.verkehrsmittel && settings.verkehrsmittel.length > 0) {
        this._selectedModes.set([...settings.verkehrsmittel]);
      }
    }
  }

  /**
   * Save current settings to localStorage
   */
  private saveSettings(): void {
    this.settingsService.saveSettings({
      expanded: this._isExpanded(),
      verkehrsmittel: [...this._selectedModes()],
      bewertung: this._selectedBewertung(),
      filters: {
        activities: [...this._selectedActivities()],
        personas: [...this._selectedPersonas()],
        regiostars: [...this._selectedRegioStars()],
        states: [...this._selectedStates()]
      }
    });
  }
}
