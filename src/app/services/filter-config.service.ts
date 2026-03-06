import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { Router } from '@angular/router';
import { ProfileService } from './profile.service';
import { ProjectsService } from './project.service';
import { SettingsService } from './settings.service';
import { MapService, ContentLayerFilters } from './map.service';
import { DashboardSessionService } from './dashboard-session.service';
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
  selectedPersonas: number | null;
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
  private dashboardSessionService = inject(DashboardSessionService);
  private dialog = inject(MatDialog);
  private activityService = inject(ActivityService);
  private personaService = inject(PersonaService);
  private regiostarService = inject(RegioStarService);
  private stateService = inject(StateService);
  private categoryService = inject(CategoryService);
  private router = inject(Router);

  // Internal state signals
  private _isExpanded = signal<boolean>(false);
  private _selectedModes = signal<number[]>([]);
  private _selectedBewertung = signal<'qualitaet' | 'zeit'>('qualitaet');
  private _selectedActivities = signal<number[]>([]);
  private _selectedPersonas = signal<number | null>(null);
  private _selectedRegioStars = signal<number[]>([]);
  private _selectedStates = signal<number[]>([]);
  private _selectedAdminLevel = signal<'state' | 'county' | 'municipality' | 'hexagon' | null>(null);

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
  
  // Track when filter data is loaded (for initialization order)
  private _isFilterDataLoaded = signal<boolean>(false);
  
  // Track if URL params have been applied (to prevent re-applying on every effect run)
  private _urlParamsApplied = signal<boolean>(false);
  
  // Track which projects have had filters initialized (to only preselect on first load)
  private _initializedProjectIds = new Set<number>();
  
  // Track if settings have been loaded from localStorage (to distinguish first load from reload)
  private _settingsLoaded = false;

  // Public readonly signals
  readonly isExpanded = this._isExpanded.asReadonly();
  readonly selectedModes = this._selectedModes.asReadonly();
  readonly selectedBewertung = this._selectedBewertung.asReadonly();
  readonly selectedActivities = this._selectedActivities.asReadonly();
  readonly selectedPersonas = this._selectedPersonas.asReadonly();
  readonly selectedRegioStars = this._selectedRegioStars.asReadonly();
  readonly selectedStates = this._selectedStates.asReadonly();
  readonly selectedAdminLevel = this._selectedAdminLevel.asReadonly();
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

    const selectedAdminLevel = this._selectedAdminLevel();
    
    return {
      profile_combination_id: profileCombinationID,
      feature_type: featureType,
      state_ids: selectedStates.length > 0 ? selectedStates : undefined,
      // Only include category_ids and persona_id if project is MID
      category_ids: (isMid && selectedActivities.length > 0) ? selectedActivities : undefined,
      persona_id: (isMid && selectedPersonas !== null) ? selectedPersonas : undefined,
      regiotyp_id: selectedRegioStars.length === 1 ? selectedRegioStars[0] :
        (selectedRegioStars.length > 1 ? selectedRegioStars[0] : undefined),
      regiostar_ids: selectedRegioStars.length > 0 ? selectedRegioStars : undefined,
      // Only include admin_level if it's not null (null means "automatic" - don't add param)
      admin_level: selectedAdminLevel !== null ? selectedAdminLevel : undefined
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
          this._selectedPersonas.set(null);
          // Reset filter data loaded flag when project changes
          this._isFilterDataLoaded.set(false);
          // Reset URL params applied flag to allow re-applying on project change
          this._urlParamsApplied.set(false);
          // Remove old project from initialized set (new project needs initialization)
          this._initializedProjectIds.delete(previousProjectId);
        }
        previousProjectId = currentProject.id;

        // Set loading states to true by default when project is loaded
        this.mapService.setMapLoading(true);
        
        // Load all filter data when project is loaded
        this.loadAllFilterData(currentProject.is_mid, currentProject.id);
        
        // Update mode selection if profiles are already loaded
        // This will update mode options and validate selection (including URL params)
        if (this._allProfiles().length > 0) {
          this.updateModeSelection(currentProject.base_profiles);
        }
      } else {
        // Reset when project is cleared
        previousProjectId = null;
        this._isFilterDataLoaded.set(false);
        // Reset URL params applied flag when project is cleared
        this._urlParamsApplied.set(false);
        // Reset ready check state when project is cleared
        this.mapService.setReadyCheckComplete(false);
        // Clear initialized project IDs when project is cleared
        this._initializedProjectIds.clear();
      }
    });

    // React to filter changes and update map
    // Track previous filter state to determine if it's a full reload or tile-only update
    let previousFilters: ContentLayerFilters | null = null;
    let isInitialLoad = true;
    effect(() => {
      const filters = this.contentLayerFilters();
      const isFilterDataLoaded = this._isFilterDataLoaded();
      
      if (filters) {
        // Wait for filter data to be loaded before calling ready/loading map
        // This ensures step 1 (load filter options) completes before step 2 (ready request)
        if (!isFilterDataLoaded && isInitialLoad) {
          // Filter data not loaded yet, wait for it
          return;
        }
        
        // On initial load, always do a full reload
        // Otherwise, determine if this is a full reload (filter settings changed) or tile-only update (bewertung changed)
        // Note: profile_combination_id changes (from mode selection) require a full reload to call /ready endpoint
        const isFullReload = isInitialLoad || (previousFilters && (
          previousFilters.profile_combination_id !== filters.profile_combination_id ||
          JSON.stringify(previousFilters.state_ids?.sort()) !== JSON.stringify(filters.state_ids?.sort()) ||
          JSON.stringify(previousFilters.category_ids?.sort()) !== JSON.stringify(filters.category_ids?.sort()) ||
          previousFilters.persona_id !== filters.persona_id ||
          previousFilters.regiotyp_id !== filters.regiotyp_id ||
          previousFilters.admin_level !== filters.admin_level
        ));
        
        if (isFullReload) {
          // Full reload with zoom to bounds
          this.updateMapLayer(filters, true).catch(error => {
            console.error('Error in updateMapLayer (full reload):', error);
          });
        } else {
          // Tile-only update (only bewertung changed) - preserve map position
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

    // React to persona changes and deselect car mode if persona cannot use car
    effect(() => {
      const selectedPersonaId = this._selectedPersonas();
      const allPersonas = this._allPersonas();
      const selectedModes = this._selectedModes();
      
      if (selectedPersonaId !== null) {
        const selectedPersona = allPersonas.find(p => p.id === selectedPersonaId);
        
        if (selectedPersona && selectedPersona.can_use_car === false) {
          // Find the car mode ID
          const carMode = this._allModes().find(mode => mode.name.toLowerCase() === 'car');
          
          if (carMode && selectedModes.includes(carMode.id)) {
            // Deselect car mode
            this._selectedModes.set(selectedModes.filter(id => id !== carMode.id));
            this.saveSettings();
          }
        }
      }
    });

    // Ensure sidebar is collapsed for share_key-only users
    effect(() => {
      if (this.dashboardSessionService.accessMethod() === 'share_key') {
        if (this._isExpanded()) {
          this._isExpanded.set(false);
        }
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
        // Apply URL params - this will set modes if profile_combination_id is in URL
        this.applyUrlParams();
        // Update mode selection from project only if URL params didn't set modes
        // (check if modes are still empty or if URL params weren't applied)
        if (this._selectedModes().length === 0 || !this._urlParamsApplied()) {
          this.updateModeSelectionFromProject();
        }
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
        // Apply URL params after profile combinations are loaded
        this.applyUrlParams();
      },
      error: (error) => {
        console.error('Error loading profile combinations:', error);
      }
    });
  }

  /**
   * Apply URL parameters for profile_combination_id and bewertung
   * This should be called after profiles and profile combinations are loaded
   */
  private applyUrlParams(): void {
    // Only apply URL params once
    if (this._urlParamsApplied()) {
      return;
    }

    // Check if profiles and profile combinations are loaded
    if (this._allProfiles().length === 0 || this._allProfileCombinations().length === 0) {
      return;
    }

    // Read URL query parameters
    const urlTree = this.router.parseUrl(this.router.url);
    const queryParams = urlTree.queryParams;

    // Apply bewertung parameter
    if (queryParams['bewertung']) {
      const bewertung = queryParams['bewertung'];
      if (bewertung === 'zeit' || bewertung === 'qualitaet') {
        this._selectedBewertung.set(bewertung);
        this.saveSettings();
      }
    }

    // Apply profile_combination_id parameter
    if (queryParams['profile_combination_id']) {
      const profileCombinationId = Number(queryParams['profile_combination_id']);
      if (!isNaN(profileCombinationId)) {
        const combination = this._allProfileCombinations().find(c => c.id === profileCombinationId);
        if (combination) {
          // Get profiles for this combination
          const profiles = this._allProfiles().filter(p => 
            combination.profile_ids.includes(p.id)
          );

          // Extract unique mode IDs from these profiles
          const modeIds = new Set<number>();
          profiles.forEach(profile => {
            if (profile.mode) {
              modeIds.add(profile.mode.id);
            }
          });

          // Set the selected modes
          if (modeIds.size > 0) {
            this._selectedModes.set(Array.from(modeIds));
            this.saveSettings();
            
            // Validate against current project if loaded
            const currentProject = this.projectService.project();
            if (currentProject && currentProject.base_profiles) {
              this.validateModeSelection();
            }
          }
        }
      }
    }

    // Mark URL params as applied
    this._urlParamsApplied.set(true);
  }

  /**
   * Load all filter data (RegioStars, States, Categories and Personas if mid)
   * For share_key-only users, skip loading and use defaults (empty arrays = undefined in API = all items)
   * @param isMid - Whether the project is MID
   * @param projectId - The current project ID to track initialization
   */
  private loadAllFilterData(isMid: boolean, projectId?: number): void {
    // For share_key-only users, skip loading filter data and use defaults
    if (this.dashboardSessionService.accessMethod() === 'share_key') {
      // Set empty arrays - this will result in undefined being passed to API (meaning "use all defaults")
      this._allRegioStars.set([]);
      this._allStates.set([]);
      this._allCategories.set([]);
      this._allActivities.set([]);
      this._allPersonas.set([]);
      this._selectedActivities.set([]);
      this._selectedPersonas.set(null);
      this._selectedRegioStars.set([]);
      this._selectedStates.set([]);
      
      // Mark filter data as loaded (step 1 complete) - no actual loading needed
      this._isFilterDataLoaded.set(true);
      return;
    }

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

          // Map categories to activities (categories are used as activities)
          const activities: Activity[] = responses.categories.results.map(category => ({
            id: category.id,
            name: category.name,
            display_name: category.display_name,
            description: category.description
          }));
          this._allActivities.set(activities);

          // Check if this is first load (not initialized) and if settings were loaded from localStorage
          const isFirstLoad = projectId !== undefined && !this._initializedProjectIds.has(projectId);
          const hasLoadedSettings = this._settingsLoaded;
          
          if (isFirstLoad && !hasLoadedSettings) {
            // First load with no saved settings - preselect all items
            this.preselectAllRegioStars();
            this.preselectAllStates();
            this.preselectAllCategories();
            this.preselectAllPersonas();
            // Mark this project as initialized
            this._initializedProjectIds.add(projectId);
          } else {
            // Either not first load or settings were loaded - validate existing selections
            this.validateFilterSelections();
            // Mark as initialized if not already
            if (projectId !== undefined) {
              this._initializedProjectIds.add(projectId);
            }
          }
          
          // Mark filter data as loaded (step 1 complete)
          this._isFilterDataLoaded.set(true);
        },
        error: (error) => {
          console.error('Error loading filter data:', error);
          // Still mark as loaded to allow the flow to continue
          this._isFilterDataLoaded.set(true);
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

          // Check if this is first load (not initialized) and if settings were loaded from localStorage
          const isFirstLoad = projectId !== undefined && !this._initializedProjectIds.has(projectId);
          const hasLoadedSettings = this._settingsLoaded;
          
          if (isFirstLoad && !hasLoadedSettings) {
            // First load with no saved settings - preselect all RegioStars and States
            this.preselectAllRegioStars();
            this.preselectAllStates();
            // Mark this project as initialized
            this._initializedProjectIds.add(projectId);
          } else {
            // Either not first load or settings were loaded - validate existing selections
            this.validateFilterSelections();
            // Mark as initialized if not already
            if (projectId !== undefined) {
              this._initializedProjectIds.add(projectId);
            }
          }

          // Clear categories, activities and personas if not mid
          this._allCategories.set([]);
          this._allActivities.set([]);
          this._allPersonas.set([]);
          // Only clear selections if this is first load with no saved settings
          if (isFirstLoad && !hasLoadedSettings) {
            this._selectedActivities.set([]);
            this._selectedPersonas.set(null);
          }
          
          // Mark filter data as loaded (step 1 complete)
          this._isFilterDataLoaded.set(true);
        },
        error: (error) => {
          console.error('Error loading filter data:', error);
          // Still mark as loaded to allow the flow to continue
          this._isFilterDataLoaded.set(true);
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
   * Preselect default persona (only if no persona is currently selected)
   */
  private preselectAllPersonas(): void {
    const currentSelection = this._selectedPersonas();
    const personas = this._allPersonas();
    
    // If a persona is already selected, validate it exists in the loaded personas
    if (currentSelection !== null) {
      const personaExists = personas.some(p => p.id === currentSelection);
      if (personaExists) {
        // Valid selection, keep it
        return;
      }
      // Invalid selection (e.g., from old localStorage), clear it
      this._selectedPersonas.set(null);
    }
    
    // No valid selection, select the default persona
    const defaultPersona = personas.find(p => p.default === true);
    if (defaultPersona) {
      this._selectedPersonas.set(defaultPersona.id);
    } else if (personas.length > 0) {
      // Fallback to first persona if no default is set
      this._selectedPersonas.set(personas[0].id);
    }
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
   * Validate existing filter selections against loaded data
   * Removes invalid selections but preserves valid ones
   */
  private validateFilterSelections(): void {
    // Validate RegioStars
    const allRegioStarIds = new Set(this._allRegioStars().map(r => r.id));
    const currentRegioStars = this._selectedRegioStars();
    const validRegioStars = currentRegioStars.filter(id => allRegioStarIds.has(id));
    if (validRegioStars.length !== currentRegioStars.length) {
      // Some selections were invalid, update to only valid ones
      // If all were invalid, preselect all (fallback)
      this._selectedRegioStars.set(validRegioStars.length > 0 ? validRegioStars : Array.from(allRegioStarIds));
    }

    // Validate States
    const allStateIds = new Set(this._allStates().map(s => s.id));
    const currentStates = this._selectedStates();
    const validStates = currentStates.filter(id => allStateIds.has(id));
    if (validStates.length !== currentStates.length) {
      // Some selections were invalid, update to only valid ones
      // If all were invalid, preselect all (fallback)
      this._selectedStates.set(validStates.length > 0 ? validStates : Array.from(allStateIds));
    }

    // Validate Activities (only if MID)
    const allActivityIds = new Set(this._allActivities().map(a => a.id));
    const currentActivities = this._selectedActivities();
    const validActivities = currentActivities.filter(id => allActivityIds.has(id));
    if (validActivities.length !== currentActivities.length) {
      // Some selections were invalid, update to only valid ones
      // If all were invalid, preselect all (fallback)
      this._selectedActivities.set(validActivities.length > 0 ? validActivities : Array.from(allActivityIds));
    }

    // Validate Personas (only if MID)
    const allPersonaIds = new Set(this._allPersonas().map(p => p.id));
    const currentPersona = this._selectedPersonas();
    if (currentPersona !== null && !allPersonaIds.has(currentPersona)) {
      // Current persona is invalid, try to find default or first available
      const defaultPersona = this._allPersonas().find(p => p.default === true);
      this._selectedPersonas.set(defaultPersona ? defaultPersona.id : (this._allPersonas().length > 0 ? this._allPersonas()[0].id : null));
    }
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
   * Check if a mode is disabled based on persona selection
   */
  isModeDisabled(modeId: number): boolean {
    const selectedPersonaId = this._selectedPersonas();
    if (selectedPersonaId === null) {
      return false;
    }
    
    const selectedPersona = this._allPersonas().find(p => p.id === selectedPersonaId);
    if (!selectedPersona) {
      return false;
    }
    
    // Check if this is the car mode
    const mode = this._allModes().find(m => m.id === modeId);
    if (mode && mode.name.toLowerCase() === 'car') {
      // Disable car mode if persona cannot use car
      return selectedPersona.can_use_car === false;
    }
    
    return false;
  }

  /**
   * Set mobility evaluation (bewertung)
   */
  setBewertung(bewertung: 'qualitaet' | 'zeit'): void {
    this._selectedBewertung.set(bewertung);
    this.saveSettings();
  }

  setAdminLevel(adminLevel: 'state' | 'county' | 'municipality' | 'hexagon' | null): void {
    this._selectedAdminLevel.set(adminLevel);
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
   * Disabled for share_key-only users
   */
  openFilterDialog(): void {
    // Prevent opening filter dialog for share_key-only users
    if (this.dashboardSessionService.accessMethod() === 'share_key') {
      return;
    }

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
        this._selectedPersonas.set(result.selectedPersonas ?? null);
        this._selectedRegioStars.set(result.selectedRegioStars || []);
        this._selectedStates.set(result.selectedStates || []);
        this.saveSettings();
      }
    });
  }

  /**
   * Reset advanced filters to default (all selected)
   * Does not reset modes, only resets: activities, personas, regiostars, states
   */
  resetAdvancedFilters(): void {
    // Reset RegioStars to all selected
    const allRegioStarIds = this._allRegioStars().map(r => r.id);
    this._selectedRegioStars.set([...allRegioStarIds]);

    // Reset States to all selected
    const allStateIds = this._allStates().map(s => s.id);
    this._selectedStates.set([...allStateIds]);

    // Reset Activities to all selected (only if MID project)
    const currentProject = this.projectService.project();
    if (currentProject?.is_mid) {
      const allActivityIds = this._allActivities().map(a => a.id);
      this._selectedActivities.set([...allActivityIds]);

      // Reset Personas to default
      const defaultPersona = this._allPersonas().find(p => p.default === true);
      if (defaultPersona) {
        this._selectedPersonas.set(defaultPersona.id);
      } else if (this._allPersonas().length > 0) {
        this._selectedPersonas.set(this._allPersonas()[0].id);
      } else {
        this._selectedPersonas.set(null);
      }
    }

    // Save settings after reset
    this.saveSettings();
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
      // Set loading state BEFORE calling ready endpoint (step 0: turn on loading)
      // This ensures the map is in loading state when ready request is made
      this.mapService.setMapLoading(true);

      // Call the ready endpoint first to check if project is ready (step 2)
      // Only check ready for full reloads (filter changes), not for tile-only updates
      if (fullReload) {
        // Mark ready check as not complete yet (prevents rankings from loading)
        this.mapService.setReadyCheckComplete(false);
        
        try {
          const readyResponse = await this.mapService.checkReady(filters);

          // Only open dialog if project is not ready (cache_flag is false)
          if (!readyResponse.cache_flag) {
            // Set preparation state to true before opening dialog
            this.mapService.setPreparingProject(true);
            
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
          // Mark ready check as complete (step 2 done, now step 3 can proceed)
          this.mapService.setReadyCheckComplete(true);
          // Proceed to load content layer below
        } catch (readyError) {
          console.error('Error calling ready endpoint:', readyError);
          // If ready endpoint fails, we can't determine if data is ready
          this.mapService.setMapLoading(false);
          this.mapService.setPreparingProject(false);
          this.mapService.setReadyCheckComplete(false);
          return;
        }
      } else {
        // For tile-only updates, ready check is not needed, so mark as complete
        this.mapService.setReadyCheckComplete(true);
      }

      // Close the dialog if it was opened (before loading content layer)
      if (dialogRef) {
        dialogRef.close();
        dialogRef = null;
        // Set preparation state to false after closing dialog
        this.mapService.setPreparingProject(false);
      }

      // Only load the content layer AFTER we've confirmed data is ready (step 3)
      // (either via cache_flag: true OR websocket completion)
      // Use updateContentLayerTiles for tile-only updates to preserve map position
      if (fullReload) {
        await this.mapService.loadContentLayer(filters, true);
      } else {
        await this.mapService.updateContentLayerTiles(filters);
      }

      // Loading state will be managed by map event listeners (dataloading/idle events)
      // in center.component.ts, so we don't need to manually clear it here
      // Rankings will load automatically when map loading is false and ready check is complete
    } catch (error) {
      console.error('Error in updateMapLayer:', error);
      // Make sure to close dialog and reset loading state on error
      if (dialogRef) {
        dialogRef.close();
        this.mapService.setPreparingProject(false);
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
    this._settingsLoaded = settings !== null && settings !== undefined;
    if (settings) {
      this._isExpanded.set(settings.expanded ?? false);
      this._selectedBewertung.set((settings.bewertung === 'zeit' ? 'zeit' : 'qualitaet') as 'qualitaet' | 'zeit');
      
      // Load admin level
      if (settings.adminLevel !== undefined) {
        this._selectedAdminLevel.set(settings.adminLevel);
      }

      // Load filter settings
      if (settings.filters) {
        this._selectedActivities.set(settings.filters.activities || []);
        // Handle both old array format and new single value format
        // Note: We'll validate the persona ID exists when personas are loaded
        const personasValue = settings.filters.personas;
        if (Array.isArray(personasValue)) {
          // Old array format - ignore it, will be set to default when personas load
          this._selectedPersonas.set(null);
        } else {
          // New single value format - set it, but it will be validated when personas load
          this._selectedPersonas.set(personasValue ?? null);
        }
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
    const selectedPersonas = this._selectedPersonas();
    this.settingsService.saveSettings({
      expanded: this._isExpanded(),
      verkehrsmittel: [...this._selectedModes()],
      bewertung: this._selectedBewertung(),
      adminLevel: this._selectedAdminLevel(),
      filters: {
        activities: [...this._selectedActivities()],
        personas: selectedPersonas !== null ? selectedPersonas : null,
        regiostars: [...this._selectedRegioStars()],
        states: [...this._selectedStates()]
      }
    });
  }
}
