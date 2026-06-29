import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MOBILE_MEDIA_QUERY } from './mobile-ui.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProfileService } from './profile.service';
import { ProjectsService } from './project.service';
import { SettingsService } from './settings.service';
import { Map as MapLibreMap } from 'maplibre-gl';
import { MapService, ContentLayerFilters } from './map.service';
import { DashboardSessionService } from './dashboard-session.service';
import { AuthService } from '../auth/auth.service';
import { Profile, Mode } from '../interfaces/profile';
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
import { ScoreColorsService } from './score-colors.service';
import { map } from 'rxjs/operators';

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

export type QualityBracket = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type TimeBracket = string;
export type AdminLevel = 'state' | 'county' | 'municipality' | 'hexagon';
export type LayerMode = 'auto' | 'manual';

const ALL_QUALITY_BRACKETS: QualityBracket[] = ['A', 'B', 'C', 'D', 'E', 'F'];
const ADMIN_LEVEL_RANK: Record<AdminLevel, number> = {
  state: 0,
  county: 1,
  municipality: 2,
  hexagon: 3,
};

@Injectable({
  providedIn: 'root'
})
export class FilterConfigService {
  private profileService = inject(ProfileService);
  private projectService = inject(ProjectsService);
  private settingsService = inject(SettingsService);
  private mapService = inject(MapService);
  private dashboardSessionService = inject(DashboardSessionService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private activityService = inject(ActivityService);
  private personaService = inject(PersonaService);
  private regiostarService = inject(RegioStarService);
  private stateService = inject(StateService);
  private categoryService = inject(CategoryService);
  private scoreColorsService = inject(ScoreColorsService);
  private router = inject(Router);
  private breakpointObserver = inject(BreakpointObserver);

  private isMobile = toSignal(
    this.breakpointObserver
      .observe(MOBILE_MEDIA_QUERY)
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  // Internal state signals
  private _isExpanded = signal<boolean>(true);
  private _selectedModes = signal<number[]>([]);
  private _selectedBewertung = signal<'qualitaet' | 'zeit'>('qualitaet');
  private _selectedActivities = signal<number[]>([]);
  private _selectedPersonas = signal<number | null>(null);
  private _selectedRegioStars = signal<number[]>([]);
  private _selectedStates = signal<number[]>([]);
  private _selectedAdminLevel = signal<'state' | 'county' | 'municipality' | 'hexagon' | null>(null);
  private _layerMode = signal<LayerMode>('auto');
  private _currentMapZoom = signal<number>(7);
  private _layerFallbackNoticeNonce = signal<number>(0);
  private _selectedQualityBrackets = signal<QualityBracket[]>([...ALL_QUALITY_BRACKETS]);
  private _selectedTimeBrackets = signal<TimeBracket[]>([]);
  private _isMapCompareMode = signal<boolean>(false);
  private _pendingMapCompareEnable = signal<boolean>(false);
  private _rightSelectedModes = signal<number[]>([]);
  private _mapLayerRefreshNonce = signal<number>(0);
  private _mapModeTransitionInProgress = signal<boolean>(false);
  private _urlCompareIntent = signal<boolean>(false);
  private _urlCompareModeIds = signal<number[]>([]);
  private _compareMapsReady = signal<boolean>(false);

  // Metadata for mode selection
  private _allModes = signal<Mode[]>([]);
  private _allProfiles = signal<Profile[]>([]);
  private _modeOptions = signal<Array<{ id: number; name: string; display_name: string; icon: string }>>([]);

  // Filter data
  private _allActivities = signal<Activity[]>([]);
  private _allCategories = signal<Category[]>([]);
  private _allPersonas = signal<Persona[]>([]);
  private _allRegioStars = signal<RegioStar[]>([]);
  private _allStates = signal<State[]>([]);
  
  // Track when filter data is loaded (for initialization order)
  private _isFilterDataLoaded = signal<boolean>(false);
  /** Project id that the loaded filter data belongs to (guards stale async completions). */
  private _filterDataProjectId = signal<number | null>(null);
  /** Bumped on every project switch to invalidate in-flight map/ready work. */
  private projectLoadGeneration = 0;
  
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
  readonly layerMode = this._layerMode.asReadonly();
  readonly currentMapZoom = this._currentMapZoom.asReadonly();
  readonly layerFallbackNoticeNonce = this._layerFallbackNoticeNonce.asReadonly();
  readonly selectedQualityBrackets = this._selectedQualityBrackets.asReadonly();
  readonly selectedTimeBrackets = this._selectedTimeBrackets.asReadonly();
  readonly modeOptions = this._modeOptions.asReadonly();
  readonly allModes = this._allModes.asReadonly();
  readonly allProfiles = this._allProfiles.asReadonly();
  readonly allActivities = this._allActivities.asReadonly();
  readonly allCategories = this._allCategories.asReadonly();
  readonly allPersonas = this._allPersonas.asReadonly();
  readonly allRegioStars = this._allRegioStars.asReadonly();
  readonly allStates = this._allStates.asReadonly();
  readonly isMapCompareMode = this._isMapCompareMode.asReadonly();
  readonly pendingMapCompareEnable = this._pendingMapCompareEnable.asReadonly();
  readonly canUseMapCompare = computed(
    () =>
      this.dashboardSessionService.isAuthenticated() ||
      !!this.projectService.project()?.group
  );
  readonly hasUrlCompareIntent = this._urlCompareIntent.asReadonly();
  readonly compareMapsReady = this._compareMapsReady.asReadonly();
  readonly canConfirmMapCompare = computed(() => {
    if (!this._pendingMapCompareEnable()) {
      return false;
    }
    if (!this.canUseMapCompare()) {
      return false;
    }
    if (!this.projectService.project()) {
      return false;
    }
    if (this._allProfiles().length === 0) {
      return false;
    }
    if (!this._isFilterDataLoaded()) {
      return false;
    }
    if (!this.contentLayerFilters() || !this.rightContentLayerFilters()) {
      return false;
    }
    if (this._selectedModes().length === 0 || this._rightSelectedModes().length === 0) {
      return false;
    }
    return true;
  });
  readonly rightSelectedModes = this._rightSelectedModes.asReadonly();
  readonly isMapModeTransitionInProgress = this._mapModeTransitionInProgress.asReadonly();
  readonly isModeSelectionLocked = computed(
    () => this._mapModeTransitionInProgress() || this.mapService.isMapLoading()
  );

  // Computed signal to check if project is MID (replaces is_mid check)
  // A project is MID if category length != 1 (i.e., 0 or 2+ categories)
  readonly hasCategories = computed(() => this._allCategories().length !== 1);
  readonly isShareKeyOnly = computed(() => this.dashboardSessionService.accessMethod() === 'share_key');
  readonly isRegiostarFilterMode = computed(() => {
    const all = this._allRegioStars();
    const selected = this._selectedRegioStars();
    return all.length > 0 && selected.length > 0 && selected.length < all.length;
  });
  readonly availableAdminLevels = computed<AdminLevel[]>(() => {
    if (!this.isShareKeyOnly()) {
      return ['state', 'county', 'municipality', 'hexagon'];
    }

    return this.getShareKeySelectableAdminLevels(this.getZoomForAdminLevel());
  });
  readonly effectiveAdminLevel = computed<AdminLevel>(() => {
    if (this._layerMode() === 'manual' && this._selectedAdminLevel()) {
      return this._selectedAdminLevel()!;
    }
    return this.determineDefaultAdminLevel(this.getZoomForAdminLevel(), this.isRegiostarFilterMode());
  });

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

  /** Sorted profile IDs for selected modes within project base_profiles (API profile_ids). */
  readonly currentProfileIds = computed((): number[] | null => {
    return this.getProfileIdsForModes(this._selectedModes());
  });

  readonly rightCurrentProfileIds = computed((): number[] | null => {
    return this.getProfileIdsForModes(this._rightSelectedModes());
  });

  readonly contentLayerFilters = computed<ContentLayerFilters | null>(() => {
    const profileIds = this.currentProfileIds();
    return this.buildContentLayerFilters(profileIds);
  });

  readonly rightContentLayerFilters = computed<ContentLayerFilters | null>(() => {
    const profileIds = this.rightCurrentProfileIds();
    return this.buildContentLayerFilters(profileIds);
  });

  private buildContentLayerFilters(profileIds: number[] | null): ContentLayerFilters | null {
    if (!profileIds || profileIds.length === 0) {
      return null;
    }

    const hasCategories = this.hasCategories();
    const featureType: 'index' | 'score' = this._selectedBewertung() === 'zeit' ? 'score' : 'index';
    const selectedStates = this._selectedStates();
    const selectedActivities = this._selectedActivities();
    const selectedPersonas = this._selectedPersonas();
    const selectedRegioStars = this._selectedRegioStars();
    const selectedAdminLevel = this.effectiveAdminLevel();

    return {
      profile_ids: profileIds,
      feature_type: featureType,
      state_ids: selectedStates.length > 0 ? selectedStates : undefined,
      category_ids: (hasCategories && selectedActivities.length > 0) ? selectedActivities : undefined,
      persona_id: (hasCategories && selectedPersonas !== null) ? selectedPersonas : undefined,
      regiostar_ids: selectedRegioStars.length > 0 ? selectedRegioStars : undefined,
      admin_level: selectedAdminLevel,
      selected_quality_brackets: [...this._selectedQualityBrackets()],
      selected_time_brackets: [...this._selectedTimeBrackets()]
    };
  }

  private getProfileIdsForModes(selectedModes: number[]): number[] | null {
    const project = this.projectService.project();
    const allProfiles = this._allProfiles();

    if (!project || !project.base_profiles || selectedModes.length === 0) {
      return null;
    }

    const selectedProfileIds = allProfiles
      .filter(profile =>
        profile.mode &&
        selectedModes.includes(profile.mode.id) &&
        project.base_profiles.includes(profile.id)
      )
      .map(profile => profile.id)
      .sort((a, b) => a - b);

    return selectedProfileIds.length > 0 ? selectedProfileIds : null;
  }

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
  /** Set when a single-map update was skipped; flushed after the in-flight update completes. */
  private mapUpdateRetryNeeded = false;
  /** Set when a compare update was skipped; flushed after the in-flight update completes. */
  private compareUpdateRetryNeeded = false;
  private compareLayerSyncRetries = 0;
  private compareLayerSyncScheduled = false;
  private readonly maxCompareLayerSyncRetries = 5;

  constructor() {
    // Initialize data loading
    this.loadProfilesAndModes();

    // Track previous project ID to detect project changes
    let previousProjectId: number | null = null;

    // React to project changes to load all filter data and update mode selection
    effect(() => {
      const currentProject = this.projectService.project();
      if (currentProject) {
        // Reset filters when loading a (new) project so selections come from project data,
        // not from previously stored localStorage settings.
        if (previousProjectId === null || previousProjectId !== currentProject.id) {
          // Force all advanced filter selections to be re-preselected from freshly loaded project data.
          // validateFilterSelections preselects "all" when these signals are empty / null.
          this._selectedModes.set([]);
          this._rightSelectedModes.set([]);
          this._isMapCompareMode.set(false);
          this._pendingMapCompareEnable.set(false);
          this._compareMapsReady.set(false);
          this._selectedActivities.set([]);
          this._selectedPersonas.set(null);
          this._selectedRegioStars.set([]);
          this._selectedStates.set([]);

          // "Automatic" admin level by default on project load.
          this._selectedAdminLevel.set(null);
          this._layerMode.set('auto');
          this._selectedQualityBrackets.set([...ALL_QUALITY_BRACKETS]);
          this._selectedTimeBrackets.set([...this.scoreColorsService.bracketIds()]);

          // Reset filter-data gating so the map waits for the new project's filter options.
          this._isFilterDataLoaded.set(false);
          this._filterDataProjectId.set(null);
          this.projectLoadGeneration++;
          this.updateMapLayerInProgress = false;
          this.compareUpdateRetryNeeded = false;
          this.mapUpdateRetryNeeded = false;

          // Allow URL params to be re-applied when switching projects.
          this._urlParamsApplied.set(false);

          // Remove old project from initialized set (new project needs initialization)
          if (previousProjectId !== null) {
            this._initializedProjectIds.delete(previousProjectId);
          }

          // If profiles are already loaded, re-apply URL params now.
          if (this._allProfiles().length > 0) {
            this.applyUrlParams();
          }
        }
        previousProjectId = currentProject.id;

        // Set loading states to true by default when project is loaded
        this.mapService.setMapLoading(true);
        
        // Load all filter data when project is loaded
        this.loadAllFilterData(currentProject.id);
        
        // Update mode selection if profiles are already loaded
        // This will update mode options and validate selection (including URL params)
        if (this._allProfiles().length > 0) {
          this.updateModeSelection(currentProject.base_profiles);
          this.tryEnableCompareFromUrl();
        }
      } else {
        // Reset when project is cleared
        previousProjectId = null;
        this._isFilterDataLoaded.set(false);
        this._filterDataProjectId.set(null);
        this.projectLoadGeneration++;
        this.updateMapLayerInProgress = false;
        this.compareUpdateRetryNeeded = false;
        this.mapUpdateRetryNeeded = false;
        this._compareMapsReady.set(false);
        // Reset URL params applied flag when project is cleared
        this._urlParamsApplied.set(false);
        // Reset ready check state when project is cleared
        this.mapService.setReadyCheckComplete(false);
        // Clear initialized project IDs when project is cleared
        this._initializedProjectIds.clear();
      }
    });

    effect(() => {
      this.dashboardSessionService.accessMethod();
      this.tryEnableCompareFromUrl();
    });

    effect(() => {
      this.dashboardSessionService.accessMethod();
      this._currentMapZoom();
      this._layerMode();
      this._selectedRegioStars();
      this._allRegioStars();
      this.syncLayerForZoomInternal({ emitFallbackNotice: false, persist: false });
    });

    // React to filter changes and update map
    let previousFilters: ContentLayerFilters | null = null;
    let previousLeftFilters: ContentLayerFilters | null = null;
    let previousRightFilters: ContentLayerFilters | null = null;
    let isInitialLoad = true;
    let compareInitialLoad = true;
    effect(() => {
      const compareMode = this._isMapCompareMode();
      const filters = this.contentLayerFilters();
      const rightFilters = this.rightContentLayerFilters();
      const isFilterDataLoaded = this._isFilterDataLoaded();
      const filterDataProjectId = this._filterDataProjectId();
      const currentProjectId = this.projectService.project()?.id ?? null;
      const filterDataReadyForProject =
        isFilterDataLoaded &&
        filterDataProjectId !== null &&
        filterDataProjectId === currentProjectId;
      const compareMapsReady = this._compareMapsReady();
      this._mapLayerRefreshNonce();
      this.effectiveAdminLevel();
      this._currentMapZoom();
      this._layerMode();
      this._selectedAdminLevel();

      if (compareMode) {
        // Explicitly track mode selections so side-specific updates always re-run.
        this._selectedModes();
        this._rightSelectedModes();

        const scheduleRetryIfNeeded = () => {
          if (compareInitialLoad) {
            this.scheduleCompareLayerSync();
          }
        };

        if (this._mapModeTransitionInProgress()) {
          scheduleRetryIfNeeded();
          return;
        }
        if (!filters || !rightFilters) {
          scheduleRetryIfNeeded();
          return;
        }
        if (!filterDataReadyForProject && compareInitialLoad) {
          scheduleRetryIfNeeded();
          return;
        }
        if (!compareMapsReady || !this.mapService.hasCompareMaps()) {
          scheduleRetryIfNeeded();
          return;
        }

        const leftMap = this.mapService.getMap();
        const rightMap = this.mapService.getCompareRightMap();
        if (!leftMap || !rightMap) {
          scheduleRetryIfNeeded();
          return;
        }
        if (this.updateMapLayerInProgress) {
          scheduleRetryIfNeeded();
          return;
        }

        const leftChanged = compareInitialLoad || this.filtersDiffer(previousLeftFilters, filters);
        const rightChanged = compareInitialLoad || this.filtersDiffer(previousRightFilters, rightFilters);
        const leftFullReload = leftChanged && (
          compareInitialLoad ||
          this.needsContentLayerFullReload(previousLeftFilters, filters)
        );
        const rightFullReload = rightChanged && (
          compareInitialLoad ||
          this.needsContentLayerFullReload(previousRightFilters, rightFilters)
        );
        const onlyLeftChanged = leftChanged && !rightChanged;
        const onlyRightChanged = rightChanged && !leftChanged;

        if (!leftChanged && !rightChanged) {
          if (compareInitialLoad && (!this.mapHasContentLayer(leftMap) || !this.mapHasContentLayer(rightMap))) {
            scheduleRetryIfNeeded();
          }
          return;
        }

        void this.updateCompareMapLayers(
          filters,
          rightFilters,
          leftFullReload,
          rightFullReload,
          onlyLeftChanged,
          onlyRightChanged,
          leftChanged,
          rightChanged,
          compareInitialLoad
        ).then(applied => {
          const leftOk = this.mapHasContentLayer(leftMap);
          const rightOk = this.mapHasContentLayer(rightMap);

          if (applied && leftOk && rightOk) {
            previousLeftFilters = this.cloneContentLayerFilters(filters);
            previousRightFilters = this.cloneContentLayerFilters(rightFilters);
            compareInitialLoad = false;
            this.compareLayerSyncRetries = 0;
          } else if (compareInitialLoad) {
            this.scheduleCompareLayerSync();
          }
          if (this.compareUpdateRetryNeeded) {
            this.compareUpdateRetryNeeded = false;
            this.scheduleCompareLayerSync();
          }
        }).catch(error => {
          console.error('Error in updateCompareMapLayers:', error);
          if (compareInitialLoad) {
            this.scheduleCompareLayerSync();
          }
        });
        return;
      }

      previousLeftFilters = null;
      previousRightFilters = null;
      compareInitialLoad = true;
      this.compareLayerSyncRetries = 0;
      isInitialLoad = true;

      if (filters) {
        if (this._mapModeTransitionInProgress()) {
          return;
        }
        if (!filterDataReadyForProject && isInitialLoad) {
          return;
        }
        if (this.updateMapLayerInProgress) {
          this.mapUpdateRetryNeeded = true;
          return;
        }

        const adminLevelChanged =
          previousFilters !== null && previousFilters.admin_level !== filters.admin_level;
        const isFullReload = isInitialLoad || adminLevelChanged;
        const wasInitialLoad = isInitialLoad;

        void this.updateMapLayer(filters, isFullReload, false).then(applied => {
          if (!applied) {
            return;
          }
          const latestFilters = this.contentLayerFilters();
          if (latestFilters) {
            previousFilters = this.cloneContentLayerFilters(latestFilters);
          }
          if (wasInitialLoad) {
            isInitialLoad = false;
          }
        }).catch(error => {
          if (isFullReload) {
            console.error('Error in updateMapLayer (full reload):', error);
          } else {
            console.error('Error in updateMapLayer (tile update):', error);
          }
        });
      } else {
        this.mapService.removeContentLayer();
        previousFilters = null;
        isInitialLoad = true;
      }
    });

    effect(() => {
      if (!this.canUseMapCompare()) {
        this._pendingMapCompareEnable.set(false);
        if (this._isMapCompareMode()) {
          this._mapModeTransitionInProgress.set(true);
          this._isMapCompareMode.set(false);
        }
      }
    });

    // React to persona changes and deselect car mode if persona cannot use car
    effect(() => {
      const selectedPersonaId = this._selectedPersonas();
      const allPersonas = this._allPersonas();
      const selectedModes = this._selectedModes();
      const rightSelectedModes = this._rightSelectedModes();

      if (selectedPersonaId !== null) {
        const selectedPersona = allPersonas.find(p => p.id === selectedPersonaId);

        if (selectedPersona && selectedPersona.can_use_car === false) {
          const carMode = this._allModes().find(mode => mode.name.toLowerCase() === 'car');

          if (carMode && selectedModes.includes(carMode.id)) {
            this._selectedModes.set(selectedModes.filter(id => id !== carMode.id));
            this.validateModeSelection();
            this.saveSettings();
          }

          if (carMode && rightSelectedModes.includes(carMode.id)) {
            this._rightSelectedModes.set(rightSelectedModes.filter(id => id !== carMode.id));
            this.validateRightModeSelection();
          }
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
        // Apply URL params - this will set modes if profile_ids is in URL
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

  private getModeIdsFromProfileIdsParam(param: string): number[] {
    const ids = param
      .split(',')
      .map(s => Number(s.trim()))
      .filter(n => !isNaN(n));
    if (ids.length === 0) {
      return [];
    }
    const modeIds = new Set<number>();
    this._allProfiles()
      .filter(p => ids.includes(p.id))
      .forEach(p => {
        if (p.mode) {
          modeIds.add(p.mode.id);
        }
      });
    return Array.from(modeIds);
  }

  /**
   * Apply URL parameters for profile_ids, compare_profile_ids, and bewertung
   * Called after profiles are loaded
   */
  private applyUrlParams(): void {
    // Only apply URL params once
    if (this._urlParamsApplied()) {
      return;
    }

    if (this._allProfiles().length === 0) {
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

    // Apply profile_ids parameter (comma-separated integers)
    const profileIdsParam = queryParams['profile_ids'];
    if (profileIdsParam && typeof profileIdsParam === 'string') {
      const modeIds = this.getModeIdsFromProfileIdsParam(profileIdsParam);
      if (modeIds.length > 0) {
        this._selectedModes.set(modeIds);
        this.saveSettings();
        const currentProject = this.projectService.project();
        if (currentProject && currentProject.base_profiles) {
          this.validateModeSelection();
        }
      }
    }

    this.parseUrlCompareIntent(queryParams);

    // Apply legend_brackets parameter (comma-separated values)
    // If the parameter is missing, default to "all selected".
    const legendBracketsParam = queryParams['legend_brackets'];
    if (legendBracketsParam && typeof legendBracketsParam === 'string') {
      const values = legendBracketsParam
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);

      const qualityValues = values.filter((v): v is QualityBracket => ALL_QUALITY_BRACKETS.includes(v as QualityBracket));
      const availableTimeBrackets = this.scoreColorsService.bracketIds();
      const timeValues = values.filter((v): v is TimeBracket => availableTimeBrackets.includes(v));

      if (qualityValues.length > 0) {
        this._selectedQualityBrackets.set([...new Set(qualityValues)]);
      }
      if (timeValues.length > 0) {
        this._selectedTimeBrackets.set([...new Set(timeValues)]);
      }
      this.saveSettings();
    } else {
      this._selectedQualityBrackets.set([...ALL_QUALITY_BRACKETS]);
      this._selectedTimeBrackets.set([...this.scoreColorsService.bracketIds()]);
      this.saveSettings();
    }

    // Mark URL params as applied
    this._urlParamsApplied.set(true);

    this.tryEnableCompareFromUrl();
  }

  private parseUrlCompareIntent(queryParams?: Record<string, unknown>): void {
    if (this._allProfiles().length === 0) {
      return;
    }

    const params = queryParams ?? this.router.parseUrl(this.router.url).queryParams;
    const compareProfileIdsParam = params['compare_profile_ids'];
    if (compareProfileIdsParam && typeof compareProfileIdsParam === 'string') {
      const compareModeIds = this.getModeIdsFromProfileIdsParam(compareProfileIdsParam);
      if (compareModeIds.length > 0) {
        this._urlCompareIntent.set(true);
        this._urlCompareModeIds.set(compareModeIds);
      }
    }
  }

  private tryEnableCompareFromUrl(): void {
    if (!this._urlCompareIntent() || !this.canUseMapCompare()) {
      return;
    }

    const project = this.projectService.project();
    if (!project || this._allProfiles().length === 0) {
      return;
    }

    const modeIds = this._urlCompareModeIds();
    if (modeIds.length === 0) {
      return;
    }

    if (this._isMapCompareMode()) {
      return;
    }

    if (this._pendingMapCompareEnable()) {
      this._rightSelectedModes.set(modeIds);
      this.validateRightModeSelection();
      return;
    }

    this.requestEnableMapCompare(modeIds);
  }

  private scheduleCompareLayerSync(): void {
    if (this.compareLayerSyncScheduled || this.compareLayerSyncRetries >= this.maxCompareLayerSyncRetries) {
      return;
    }
    this.compareLayerSyncScheduled = true;
    this.compareLayerSyncRetries++;
    requestAnimationFrame(() => {
      this.compareLayerSyncScheduled = false;
      this.refreshMapLayers();
    });
  }

  /**
   * Load all filter data (RegioStars, States, Categories and Personas)
   * Always tries to load categories - if none are returned, the project doesn't support categories
   * For share_key-only users, skip loading and use defaults (empty arrays = undefined in API = all items)
   * @param projectId - The current project ID to track initialization
   */
  private loadAllFilterData(projectId?: number): void {
    const loadGeneration = this.projectLoadGeneration;
    const expectedProjectId = projectId;
    const isShareKeyOnly = this.dashboardSessionService.accessMethod() === 'share_key';
    
    // Always load RegioStars, States, Categories and Personas (including for share_key users so they can see the data)
    const regiostars$ = this.regiostarService.getRegioStars(1, 100);
    const states$ = this.stateService.getStates(1, 100);
    const categories$ = this.categoryService.getCategories(1, 100);
    const personas$ = this.personaService.getPersonas(1, 100);

    forkJoin({
      regiostars: regiostars$,
      states: states$,
      categories: categories$,
      personas: personas$
    }).subscribe({
      next: (responses) => {
        if (!this.isProjectLoadCurrent(loadGeneration, expectedProjectId)) {
          return;
        }

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

        // For share_key users, always preselect all items (they can't modify anyway)
        if (isShareKeyOnly) {
          if (responses.categories.results.length > 0) {
            this.preselectAllCategories();
          }
          if (responses.personas.results.length > 0) {
            this.preselectAllPersonas();
          }
          this.preselectAllRegioStars();
          this.preselectAllStates();
          
          if (expectedProjectId !== undefined) {
            this._initializedProjectIds.add(expectedProjectId);
          }
          this.markFilterDataLoadedForProject(expectedProjectId);
          return;
        }

        // Check if this is first load (not initialized) and if settings were loaded from localStorage
        const isFirstLoad = projectId !== undefined && !this._initializedProjectIds.has(projectId);
        const hasLoadedSettings = this._settingsLoaded;
        
        if (isFirstLoad && !hasLoadedSettings) {
          // First load with no saved settings - preselect all items (same logic for all filters)
          // This ensures consistent behavior: preselect all unless URL params or localStorage say otherwise
          if (responses.categories.results.length > 0) {
            this.preselectAllCategories();
          }
          if (responses.personas.results.length > 0) {
            this.preselectAllPersonas();
          }
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
        
        this.markFilterDataLoadedForProject(expectedProjectId);
      },
      error: (error) => {
        console.error('Error loading filter data:', error);
        if (!this.isProjectLoadCurrent(loadGeneration, expectedProjectId)) {
          return;
        }
        // Still mark as loaded to allow the flow to continue
        this.markFilterDataLoadedForProject(expectedProjectId);
      }
    });
  }

  private isProjectLoadCurrent(loadGeneration: number, expectedProjectId?: number): boolean {
    if (loadGeneration !== this.projectLoadGeneration) {
      return false;
    }

    if (expectedProjectId === undefined) {
      return true;
    }

    return this.projectService.project()?.id === expectedProjectId;
  }

  private markFilterDataLoadedForProject(projectId?: number): void {
    const currentProjectId = this.projectService.project()?.id;
    if (projectId !== undefined && currentProjectId !== projectId) {
      return;
    }

    this._filterDataProjectId.set(currentProjectId ?? null);
    this._isFilterDataLoaded.set(true);
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
   * If selections are empty, preselects all available items
   */
  private validateFilterSelections(): void {
    // Validate RegioStars
    const allRegioStarIds = new Set(this._allRegioStars().map(r => r.id));
    const currentRegioStars = this._selectedRegioStars();
    // If no regiostars selected and regiostars are available, preselect all
    if (currentRegioStars.length === 0 && allRegioStarIds.size > 0) {
      this._selectedRegioStars.set(Array.from(allRegioStarIds));
    } else {
      const validRegioStars = currentRegioStars.filter(id => allRegioStarIds.has(id));
      if (validRegioStars.length !== currentRegioStars.length) {
        // Some selections were invalid, update to only valid ones
        // If all were invalid, preselect all (fallback)
        this._selectedRegioStars.set(validRegioStars.length > 0 ? validRegioStars : Array.from(allRegioStarIds));
      }
    }

    // Validate States
    const allStateIds = new Set(this._allStates().map(s => s.id));
    const currentStates = this._selectedStates();
    // If no states selected and states are available, preselect all
    if (currentStates.length === 0 && allStateIds.size > 0) {
      this._selectedStates.set(Array.from(allStateIds));
    } else {
      const validStates = currentStates.filter(id => allStateIds.has(id));
      if (validStates.length !== currentStates.length) {
        // Some selections were invalid, update to only valid ones
        // If all were invalid, preselect all (fallback)
        this._selectedStates.set(validStates.length > 0 ? validStates : Array.from(allStateIds));
      }
    }

    // Validate Activities (only if MID)
    const allActivityIds = new Set(this._allActivities().map(a => a.id));
    const currentActivities = this._selectedActivities();
    // If no activities selected and activities are available, preselect all
    if (currentActivities.length === 0 && allActivityIds.size > 0) {
      this._selectedActivities.set(Array.from(allActivityIds));
    } else {
      const validActivities = currentActivities.filter(id => allActivityIds.has(id));
      if (validActivities.length !== currentActivities.length) {
        // Some selections were invalid, update to only valid ones
        // If all were invalid, preselect all (fallback)
        this._selectedActivities.set(validActivities.length > 0 ? validActivities : Array.from(allActivityIds));
      }
    }

    // Validate Personas (only if MID)
    const allPersonaIds = new Set(this._allPersonas().map(p => p.id));
    const currentPersona = this._selectedPersonas();
    // If no persona selected and personas are available, preselect default
    if (currentPersona === null && allPersonaIds.size > 0) {
      const defaultPersona = this._allPersonas().find(p => p.default === true);
      this._selectedPersonas.set(defaultPersona ? defaultPersona.id : (this._allPersonas().length > 0 ? this._allPersonas()[0].id : null));
    } else if (currentPersona !== null && !allPersonaIds.has(currentPersona)) {
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
    this.validateRightModeSelection();
  }

  private getModesInProject(): Set<number> {
    const currentProject = this.projectService.project();
    const modesInProject = new Set<number>();
    if (!currentProject?.base_profiles) {
      return modesInProject;
    }

    currentProject.base_profiles.forEach(profileId => {
      const profile = this._allProfiles().find(p => p.id === profileId);
      if (profile?.mode) {
        modesInProject.add(profile.mode.id);
      }
    });
    return modesInProject;
  }

  private validateModesForSignal(
    currentModes: number[],
    setter: (modes: number[]) => void,
    modesInProject: Set<number>
  ): void {
    if (modesInProject.size === 0) {
      return;
    }

    if (currentModes.length === 0) {
      setter(Array.from(modesInProject));
      return;
    }

    const validModes = currentModes.filter(modeId => modesInProject.has(modeId));
    if (validModes.length === 0) {
      setter(Array.from(modesInProject));
    } else if (validModes.length !== currentModes.length) {
      setter(validModes);
    }
  }

  /**
   * Validate and update mode selection against available modes
   */
  private validateModeSelection(): void {
    const modesInProject = this.getModesInProject();
    if (modesInProject.size === 0) {
      return;
    }
    this.validateModesForSignal(this._selectedModes(), modes => this._selectedModes.set(modes), modesInProject);
  }

  private validateRightModeSelection(): void {
    const modesInProject = this.getModesInProject();
    if (modesInProject.size === 0) {
      return;
    }
    this.validateModesForSignal(this._rightSelectedModes(), modes => this._rightSelectedModes.set(modes), modesInProject);
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
   * Toggle mode selection. At least one mode must remain selected.
   */
  toggleMode(modeId: number): void {
    const currentModes = this._selectedModes();
    const index = currentModes.indexOf(modeId);
    if (index > -1) {
      if (currentModes.length === 1) {
        return;
      }
      this._selectedModes.set(currentModes.filter(id => id !== modeId));
    } else {
      this._selectedModes.set([...currentModes, modeId]);
    }
    this.saveSettings();
  }

  /**
   * True when this mode is selected and it is the only selected mode (cannot deselect).
   */
  isOnlySelectedMode(modeId: number): boolean {
    const modes = this._selectedModes();
    return modes.length === 1 && modes.includes(modeId);
  }

  /**
   * Check if mode is selected
   */
  isModeSelected(modeId: number): boolean {
    return this._selectedModes().includes(modeId);
  }

  requestEnableMapCompare(rightModeIds?: number[]): void {
    if (!this.canUseMapCompare() || this._isMapCompareMode() || this._pendingMapCompareEnable()) {
      return;
    }

    if (rightModeIds?.length) {
      this._rightSelectedModes.set(rightModeIds);
    } else {
      this._rightSelectedModes.set([...this._selectedModes()]);
    }
    this.validateRightModeSelection();
    this._pendingMapCompareEnable.set(true);
  }

  confirmEnableMapCompare(): void {
    if (!this._pendingMapCompareEnable()) {
      return;
    }
    this._pendingMapCompareEnable.set(false);
    this._isMapCompareMode.set(true);
  }

  toggleMapCompare(): void {
    if (!this.canUseMapCompare()) {
      return;
    }

    if (this._isMapCompareMode()) {
      this._mapModeTransitionInProgress.set(true);
      this._pendingMapCompareEnable.set(false);
      this._isMapCompareMode.set(false);
      this._urlCompareIntent.set(false);
      this._urlCompareModeIds.set([]);
      this.clearCompareProfileIdsFromUrl();
      return;
    }

    this.requestEnableMapCompare();
  }

  private clearCompareProfileIdsFromUrl(): void {
    const urlTree = this.router.parseUrl(this.router.url);
    if (!urlTree.queryParams['compare_profile_ids']) {
      return;
    }
    const { compare_profile_ids: _, ...remaining } = urlTree.queryParams;
    void this.router.navigate([], {
      queryParams: remaining,
      replaceUrl: true,
    });
  }

  setMapModeTransitionInProgress(inProgress: boolean): void {
    this._mapModeTransitionInProgress.set(inProgress);
  }

  setCompareMapsReady(ready: boolean): void {
    this._compareMapsReady.set(ready);
    if (ready) {
      this.refreshMapLayers();
    }
  }

  resetMapLayerUpdateState(): void {
    this.updateMapLayerInProgress = false;
    this.mapUpdateRetryNeeded = false;
  }

  refreshMapLayers(): void {
    this._mapLayerRefreshNonce.update(value => value + 1);
  }

  toggleRightMode(modeId: number): void {
    const currentModes = this._rightSelectedModes();
    const index = currentModes.indexOf(modeId);
    if (index > -1) {
      if (currentModes.length === 1) {
        return;
      }
      this._rightSelectedModes.set(currentModes.filter(id => id !== modeId));
    } else {
      this._rightSelectedModes.set([...currentModes, modeId]);
    }
  }

  isRightOnlySelectedMode(modeId: number): boolean {
    const modes = this._rightSelectedModes();
    return modes.length === 1 && modes.includes(modeId);
  }

  isRightModeSelected(modeId: number): boolean {
    return this._rightSelectedModes().includes(modeId);
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

  toggleQualityBracket(bracket: QualityBracket): void {
    const current = this._selectedQualityBrackets();
    if (current.includes(bracket)) {
      this._selectedQualityBrackets.set(current.filter(b => b !== bracket));
    } else {
      this._selectedQualityBrackets.set([...current, bracket]);
    }
    this.saveSettings();
  }

  toggleTimeBracket(bracket: TimeBracket): void {
    const current = this._selectedTimeBrackets();
    if (current.includes(bracket)) {
      this._selectedTimeBrackets.set(current.filter(b => b !== bracket));
    } else {
      this._selectedTimeBrackets.set([...current, bracket]);
    }
    this.saveSettings();
  }

  isQualityBracketSelected(bracket: QualityBracket): boolean {
    return this._selectedQualityBrackets().includes(bracket);
  }

  isTimeBracketSelected(bracket: TimeBracket): boolean {
    return this._selectedTimeBrackets().includes(bracket);
  }

  setAdminLevel(adminLevel: 'state' | 'county' | 'municipality' | 'hexagon' | null): void {
    if (adminLevel === null) {
      this.setLayerModeAuto();
      return;
    }
    this.selectLayerFromUi(adminLevel);
  }

  setCurrentMapZoom(zoom: number): boolean {
    const previousZoom = this._currentMapZoom();
    const previousEffectiveLevel = this.effectiveAdminLevel();
    this._currentMapZoom.set(zoom);
    const fallbackTriggered = this.syncLayerForZoom(previousZoom);

    const effectiveLevelChanged = this.effectiveAdminLevel() !== previousEffectiveLevel;
    const roundedZoomChanged = Math.round(zoom) !== Math.round(previousZoom);
    if (effectiveLevelChanged || roundedZoomChanged) {
      this.refreshMapLayers();
    }

    return fallbackTriggered;
  }

  selectLayerFromUi(adminLevel: AdminLevel): void {
    if (!this.availableAdminLevels().includes(adminLevel)) {
      return;
    }

    if (this._layerMode() === 'manual' && this._selectedAdminLevel() === adminLevel) {
      this.setLayerModeAuto();
      return;
    }

    this._layerMode.set('manual');
    this._selectedAdminLevel.set(adminLevel);
    this.saveSettings();
    this.refreshMapLayers();
  }

  setLayerModeAuto(): void {
    this._layerMode.set('auto');
    this._selectedAdminLevel.set(null);
    this.syncLayerForZoomInternal({ emitFallbackNotice: false, persist: true });
    this.refreshMapLayers();
  }

  syncLayerForZoom(previousZoom?: number): boolean {
    return this.syncLayerForZoomInternal({ emitFallbackNotice: true, persist: true }, previousZoom);
  }

  private syncLayerForZoomInternal(
    options: { emitFallbackNotice: boolean; persist: boolean },
    previousZoom?: number
  ): boolean {
    const availableLevels = this.availableAdminLevels();
    const currentSelected = this._selectedAdminLevel();
    const zoom = this._currentMapZoom();
    const zoomingOut = previousZoom !== undefined && zoom < previousZoom;
    let fallbackTriggered = false;
    let changed = false;

    if (this._layerMode() === 'manual') {
      if (!currentSelected || !availableLevels.includes(currentSelected)) {
        this._layerMode.set('auto');
        this._selectedAdminLevel.set(null);
        fallbackTriggered = true;
        changed = true;
      } else if (zoomingOut) {
        const defaultAtZoom = this.determineDefaultAdminLevel(zoom, this.isRegiostarFilterMode());
        if (this.isAdminLevelCoarserThan(defaultAtZoom, currentSelected)) {
          this._layerMode.set('auto');
          this._selectedAdminLevel.set(null);
          changed = true;
        }
      }
    } else if (currentSelected !== null) {
      this._selectedAdminLevel.set(null);
      changed = true;
    }

    if (fallbackTriggered && options.emitFallbackNotice) {
      this._layerFallbackNoticeNonce.update(value => value + 1);
    }

    if (changed && options.persist) {
      this.saveSettings();
    }

    return fallbackTriggered;
  }

  private isAdminLevelCoarserThan(coarse: AdminLevel, fine: AdminLevel): boolean {
    return ADMIN_LEVEL_RANK[coarse] < ADMIN_LEVEL_RANK[fine];
  }

  /**
   * Share-key users may lock municipality/hexagon one admin level above the automatic layer.
   */
  private getShareKeySelectableAdminLevels(zoom: number): AdminLevel[] {
    const regiostarFilterMode = this.isRegiostarFilterMode();
    const defaultLevel = this.determineDefaultAdminLevel(zoom, regiostarFilterMode);

    if (regiostarFilterMode) {
      const levels: AdminLevel[] = ['municipality'];
      if (defaultLevel === 'municipality' || defaultLevel === 'hexagon') {
        levels.push('hexagon');
      }
      return levels;
    }

    const levels = this.getAdminLevelsUpTo(defaultLevel);
    const nextFiner = this.getNextFinerAdminLevel(defaultLevel);
    if (nextFiner === 'municipality' || nextFiner === 'hexagon') {
      levels.push(nextFiner);
    }
    return [...new Set(levels)];
  }

  private getAdminLevelsUpTo(level: AdminLevel): AdminLevel[] {
    const order: AdminLevel[] = ['state', 'county', 'municipality', 'hexagon'];
    const index = order.indexOf(level);
    return order.slice(0, index + 1);
  }

  private getNextFinerAdminLevel(level: AdminLevel): AdminLevel | null {
    const order: AdminLevel[] = ['state', 'county', 'municipality', 'hexagon'];
    const index = order.indexOf(level);
    if (index < 0 || index >= order.length - 1) {
      return null;
    }
    return order[index + 1];
  }

  getAdminLevelDisabledHintKey(adminLevel: AdminLevel): string | null {
    if (this.availableAdminLevels().includes(adminLevel)) {
      return null;
    }

    if (!this.isShareKeyOnly()) {
      return 'map.layerSwitcher.disabledGeneric';
    }

    if (this.isRegiostarFilterMode() && (adminLevel === 'state' || adminLevel === 'county')) {
      return 'map.layerSwitcher.disabledRegiostarFilter';
    }

    if (adminLevel === 'municipality') {
      return 'map.layerSwitcher.disabledEnforceMunicipality';
    }

    if (adminLevel === 'hexagon') {
      return 'map.layerSwitcher.disabledEnforceHexagon';
    }

    if (adminLevel === 'county') {
      return 'map.layerSwitcher.disabledZoom';
    }

    return 'map.layerSwitcher.disabledGeneric';
  }

  /** Mirrors backend `determine_admin_level` when no admin_level override is sent. */
  private determineDefaultAdminLevel(zoom: number, regiostarFilterMode: boolean): AdminLevel {
    const z = Math.round(zoom);
    if (regiostarFilterMode) {
      return z < 9 ? 'municipality' : 'hexagon';
    }
    if (z <= 7) {
      return 'state';
    }
    if (z <= 8) {
      return 'county';
    }
    if (z <= 9) {
      return 'municipality';
    }
    return 'hexagon';
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

    const dialogData: FilterDialogData = {
      selectedActivities: this._selectedActivities(),
      selectedPersonas: this._selectedPersonas(),
      selectedRegioStars: this._selectedRegioStars(),
      selectedStates: this._selectedStates(),
      hasCategories: this.hasCategories()
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

    // Reset Activities to all selected (only if project has categories)
    if (this.hasCategories()) {
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

  private getZoomForAdminLevel(): number {
    // Keep reactive dependency on zoom sync even when the map instance is not ready yet.
    const trackedZoom = this._currentMapZoom();
    const liveZoom = this.mapService.getMap()?.getZoom();
    if (typeof liveZoom === 'number' && Number.isFinite(liveZoom)) {
      return liveZoom;
    }
    return trackedZoom;
  }

  private resolveFiltersForMapApply(filters: ContentLayerFilters): ContentLayerFilters {
    return {
      ...filters,
      admin_level: this.effectiveAdminLevel(),
    };
  }

  private needsContentLayerFullReload(
    previousFilters: ContentLayerFilters | null,
    filters: ContentLayerFilters
  ): boolean {
    if (!previousFilters) {
      return true;
    }

    if (previousFilters.admin_level !== filters.admin_level) {
      return true;
    }

    if (previousFilters.feature_type !== filters.feature_type) {
      return true;
    }

    const previousProfileIds = [...previousFilters.profile_ids].sort((a, b) => a - b).join(',');
    const profileIds = [...filters.profile_ids].sort((a, b) => a - b).join(',');
    return previousProfileIds !== profileIds;
  }

  private filtersDiffer(
    previousFilters: ContentLayerFilters | null,
    filters: ContentLayerFilters
  ): boolean {
    if (!previousFilters) {
      return true;
    }

    return (
      JSON.stringify([...previousFilters.profile_ids].sort((a, b) => a - b)) !== JSON.stringify([...filters.profile_ids].sort((a, b) => a - b)) ||
      previousFilters.feature_type !== filters.feature_type ||
      JSON.stringify(previousFilters.state_ids?.sort()) !== JSON.stringify(filters.state_ids?.sort()) ||
      JSON.stringify(previousFilters.category_ids?.sort()) !== JSON.stringify(filters.category_ids?.sort()) ||
      previousFilters.persona_id !== filters.persona_id ||
      JSON.stringify(previousFilters.regiostar_ids?.sort()) !== JSON.stringify(filters.regiostar_ids?.sort()) ||
      previousFilters.admin_level !== filters.admin_level ||
      JSON.stringify(previousFilters.selected_quality_brackets) !== JSON.stringify(filters.selected_quality_brackets) ||
      JSON.stringify(previousFilters.selected_time_brackets) !== JSON.stringify(filters.selected_time_brackets)
    );
  }

  private cloneContentLayerFilters(filters: ContentLayerFilters): ContentLayerFilters {
    return {
      ...filters,
      profile_ids: [...filters.profile_ids],
      state_ids: filters.state_ids ? [...filters.state_ids] : undefined,
      category_ids: filters.category_ids ? [...filters.category_ids] : undefined,
      regiostar_ids: filters.regiostar_ids ? [...filters.regiostar_ids] : undefined,
      selected_quality_brackets: filters.selected_quality_brackets
        ? [...filters.selected_quality_brackets]
        : undefined,
      selected_time_brackets: filters.selected_time_brackets
        ? [...filters.selected_time_brackets]
        : undefined,
    };
  }

  private mapHasContentLayer(targetMap: MapLibreMap): boolean {
    return !!targetMap.getSource('content-layer');
  }

  private async ensureProjectReady(
    filters: ContentLayerFilters,
    loadGeneration: number
  ): Promise<boolean> {
    if (!this.isProjectLoadCurrent(loadGeneration)) {
      return false;
    }

    let dialogRef: ReturnType<MatDialog['open']> | null = null;

    try {
      const readyResponse = await this.mapService.checkReady(filters);

      if (!this.isProjectLoadCurrent(loadGeneration)) {
        return false;
      }

      if (!readyResponse.cache_flag) {
        this.mapService.setPreparingProject(true);

        dialogRef = this.dialog.open(PreparingProjectDialogComponent, {
          width: '80%',
          maxWidth: '900px',
          disableClose: true,
          hasBackdrop: true,
          panelClass: 'preparing-project-dialog-panel',
          data: { sessionId: readyResponse.session_id }
        });

        if (readyResponse.session_id) {
          try {
            await this.mapService.waitForPreload(readyResponse.session_id);
          } catch (preloadError) {
            console.error('Error waiting for preload via websocket:', preloadError);
          }
        } else {
          console.warn('No session_id provided, cannot wait for preload');
        }
      }

      return this.isProjectLoadCurrent(loadGeneration);
    } catch (readyError) {
      console.error('Error calling ready endpoint:', readyError);
      this.mapService.setPreparingProject(false);
      return false;
    } finally {
      if (dialogRef) {
        dialogRef.close();
        this.mapService.setPreparingProject(false);
      }
    }
  }

  private async updateCompareMapLayers(
    leftFilters: ContentLayerFilters,
    rightFilters: ContentLayerFilters,
    leftFullReload: boolean,
    rightFullReload: boolean,
    onlyLeftChanged: boolean = false,
    onlyRightChanged: boolean = false,
    leftChanged: boolean = true,
    rightChanged: boolean = true,
    sequentialInitialLoad: boolean = false
  ): Promise<boolean> {
    const leftMap = this.mapService.getMap();
    const rightMap = this.mapService.getCompareRightMap();
    if (!leftMap || !rightMap) {
      return false;
    }

    if (this.updateMapLayerInProgress) {
      this.compareUpdateRetryNeeded = true;
      return false;
    }

    const shouldUpdateLeft = leftChanged && !onlyRightChanged;
    const shouldUpdateRight = rightChanged && !onlyLeftChanged;
    const loadGeneration = this.projectLoadGeneration;

    this.updateMapLayerInProgress = true;
    try {
      this.mapService.setMapLoading(true);

      const needsReadyCheck =
        (shouldUpdateLeft && leftFullReload) || (shouldUpdateRight && rightFullReload);
      if (needsReadyCheck) {
        this.mapService.setReadyCheckComplete(false);
        if (shouldUpdateLeft && leftFullReload) {
          const leftReady = await this.ensureProjectReady(leftFilters, loadGeneration);
          if (!leftReady) {
            this.mapService.setReadyCheckComplete(false);
            return false;
          }
        }
        if (shouldUpdateRight && rightFullReload) {
          const rightReady = await this.ensureProjectReady(rightFilters, loadGeneration);
          if (!rightReady) {
            this.mapService.setReadyCheckComplete(false);
            return false;
          }
        }
        if (!this.isProjectLoadCurrent(loadGeneration)) {
          this.mapService.setReadyCheckComplete(false);
          return false;
        }
        this.mapService.setReadyCheckComplete(true);
      }

      let success = false;

      if (sequentialInitialLoad && shouldUpdateLeft && shouldUpdateRight) {
        const leftOk = await this.updateMapLayer(leftFilters, leftFullReload, false, leftMap, true);
        const rightOk = leftOk
          ? await this.updateMapLayer(rightFilters, rightFullReload, false, rightMap, true)
          : false;
        success = leftOk && rightOk;
      } else {
        const loadTasks: Promise<boolean>[] = [];
        if (shouldUpdateLeft) {
          loadTasks.push(
            this.updateMapLayer(leftFilters, leftFullReload, false, leftMap, true)
          );
        }
        if (shouldUpdateRight) {
          loadTasks.push(
            this.updateMapLayer(rightFilters, rightFullReload, false, rightMap, true)
          );
        }

        const results = await Promise.all(loadTasks);
        success = loadTasks.length > 0 && results.every(Boolean);
      }

      if (shouldUpdateRight && !this.mapHasContentLayer(rightMap)) {
        const rightRetryOk = await this.updateMapLayer(
          rightFilters,
          true,
          false,
          rightMap,
          true
        );
        success = rightRetryOk;
      }

      if (success) {
        leftMap.resize();
        rightMap.resize();
      }

      return success;
    } finally {
      this.updateMapLayerInProgress = false;
    }
  }

  /**
   * Update map layer with current filters
   * @param filters - The filter parameters
   * @param fullReload - Whether to do a full reload with zoom to bounds (default: true)
   */
  private async updateMapLayer(
    filters: ContentLayerFilters,
    fullReload: boolean = true,
    zoomToBounds: boolean = false,
    targetMap?: MapLibreMap,
    skipReadyCheck: boolean = false
  ): Promise<boolean> {
    const loadGeneration = this.projectLoadGeneration;

    if (!targetMap) {
      if (this.updateMapLayerInProgress) {
        console.log('updateMapLayer already in progress, skipping concurrent call');
        return false;
      }
      this.updateMapLayerInProgress = true;
    }

    try {
      // Set loading state BEFORE calling ready endpoint (step 0: turn on loading)
      // This ensures the map is in loading state when ready request is made
      this.mapService.setMapLoading(true);

      // Call the ready endpoint first to check if project is ready (step 2)
      // Only check ready for full reloads (filter changes), not for tile-only updates
      if (fullReload && !skipReadyCheck) {
        // Mark ready check as not complete yet (prevents rankings from loading)
        this.mapService.setReadyCheckComplete(false);

        const ready = await this.ensureProjectReady(filters, loadGeneration);
        if (!ready) {
          this.mapService.setMapLoading(false);
          this.mapService.setReadyCheckComplete(false);
          return false;
        }

        this.mapService.setReadyCheckComplete(true);
      } else if (!skipReadyCheck) {
        // For tile-only updates, ready check is not needed, so mark as complete
        this.mapService.setReadyCheckComplete(true);
      }

      if (!this.isProjectLoadCurrent(loadGeneration)) {
        return false;
      }

      const filtersToApply = this.resolveFiltersForMapApply(filters);

      // Only load the content layer AFTER we've confirmed data is ready (step 3)
      // (either via cache_flag: true OR websocket completion)
      const activeMap = targetMap ?? this.mapService.getMap();
      if (activeMap) {
        if (fullReload) {
          const loaded = await this.mapService.loadContentLayerOnMap(activeMap, filtersToApply, zoomToBounds, false);
          if (!this.isProjectLoadCurrent(loadGeneration)) {
            return false;
          }
          if (loaded) {
            activeMap.resize();
          }
          return loaded;
        }
        await this.mapService.updateContentLayerOnMap(activeMap, filtersToApply);
        return this.isProjectLoadCurrent(loadGeneration);
      } else if (fullReload) {
        await this.mapService.loadContentLayer(filtersToApply, zoomToBounds);
      } else {
        await this.mapService.updateContentLayerTiles(filtersToApply);
      }
      return this.isProjectLoadCurrent(loadGeneration);
    } catch (error) {
      console.error('Error in updateMapLayer:', error);
      this.mapService.setPreparingProject(false);
      this.mapService.setMapLoading(false);
      return false;
    } finally {
      if (!targetMap) {
        this.updateMapLayerInProgress = false;
        if (this.mapUpdateRetryNeeded) {
          this.mapUpdateRetryNeeded = false;
          this.refreshMapLayers();
        }
      }
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
      
      this._layerMode.set(settings.layerMode === 'manual' ? 'manual' : 'auto');
      if (settings.layerMode === 'manual' && settings.adminLevel !== undefined && settings.adminLevel !== null) {
        this._selectedAdminLevel.set(settings.adminLevel);
      } else {
        this._selectedAdminLevel.set(null);
      }

      const allQuality = settings.legendBrackets?.quality;
      if (Array.isArray(allQuality) && allQuality.length > 0) {
        const validQuality = allQuality.filter((v): v is QualityBracket => ALL_QUALITY_BRACKETS.includes(v as QualityBracket));
        this._selectedQualityBrackets.set(validQuality.length > 0 ? [...new Set(validQuality)] : [...ALL_QUALITY_BRACKETS]);
      } else {
        this._selectedQualityBrackets.set([...ALL_QUALITY_BRACKETS]);
      }

      const allTime = settings.legendBrackets?.time;
      const availableTimeBrackets = this.scoreColorsService.bracketIds();
      if (Array.isArray(allTime) && allTime.length > 0) {
        const validTime = allTime.filter((v): v is TimeBracket => availableTimeBrackets.includes(v));
        this._selectedTimeBrackets.set(
          validTime.length > 0 ? [...new Set(validTime)] : [...availableTimeBrackets]
        );
      } else {
        this._selectedTimeBrackets.set([...availableTimeBrackets]);
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
      adminLevel: this._layerMode() === 'manual' ? this._selectedAdminLevel() : null,
      layerMode: this._layerMode(),
      legendBrackets: {
        quality: [...this._selectedQualityBrackets()],
        time: [...this._selectedTimeBrackets()]
      },
      filters: {
        activities: [...this._selectedActivities()],
        personas: selectedPersonas !== null ? selectedPersonas : null,
        regiostars: [...this._selectedRegioStars()],
        states: [...this._selectedStates()]
      }
    });
  }
}
