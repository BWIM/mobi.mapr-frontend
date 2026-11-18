/**
 * Characterization specs for FilterConfigService (F-15 step 1).
 *
 * They pin the current behaviour before the effects are restructured (F-15 step 2), so the
 * refactor can prove it changes nothing user-visible. Expectations describe what the service
 * does today, including quirks; change them only together with a deliberate behaviour change.
 */
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { testProviders } from '../testing/test-providers';
import { FilterConfigService } from './filter-config.service';
import { MapService, ContentLayerFilters } from './map.service';
import { ProfileService } from './profile.service';
import { PersonaService } from './persona.service';
import { RegioStarService } from './regiostar.service';
import { StateService } from './state.service';
import { CategoryService } from './category.service';
import { ProjectsService } from './project.service';
import { DashboardSessionService } from './dashboard-session.service';
import { Project } from '../interfaces/project';

// --- Fixtures -------------------------------------------------------------------------------

const WALK = 1;
const BIKE = 2;
const CAR = 3;
const TRANSIT = 4;

const PROFILES = [
  { id: WALK, name: 'walk', display_name: 'Walk', mode: { id: 1, name: 'pedestrian', display_name: 'Walk' } },
  { id: BIKE, name: 'bike', display_name: 'Bike', mode: { id: 2, name: 'bicycle', display_name: 'Bike' } },
  { id: CAR, name: 'car', display_name: 'Car', mode: { id: 3, name: 'car', display_name: 'Car' } },
  { id: TRANSIT, name: 'transit', display_name: 'Transit', mode: { id: 4, name: 'transit', display_name: 'Transit' } },
];
const REGIOSTARS = [{ id: 11, name: 'a' }, { id: 12, name: 'b' }, { id: 13, name: 'c' }];
const STATES = [{ id: 21, name: 'BW' }, { id: 22, name: 'BY' }];
const PERSONAS = [
  { id: 31, name: 'kid', display_name: 'Kid', can_use_car: false },
  { id: 32, name: 'adult', display_name: 'Adult', can_use_car: true },
];
/** Time brackets: [0, 600), [600, 1200), [1200, ∞) seconds. */
const SCORE_COLORS = { '0': 'rgb(1, 1, 1)', '600': 'rgb(2, 2, 2)', '1200': 'rgb(3, 3, 3)' };

function project(id: number, baseProfiles: number[], share?: { features: Record<string, boolean> }): Project {
  return {
    id,
    display_name: `Project ${id}`,
    base_profiles: baseProfiles,
    groups: [],
    score_colors: SCORE_COLORS,
    ...(share ? { share } : {}),
  } as unknown as Project;
}

const page = <T>(results: T[]) => of({ count: results.length, next: null, previous: null, results });

/** Records what the service asks the map to do. Maps are plain stubs. */
class FakeMapService {
  readonly isMapLoading = signal(false);
  map: { getZoom: () => number; getSource: () => object; resize: () => void } | null = null;
  rightMap: typeof this.map = null;
  zoom = 7;

  getMap() { return this.map; }
  getCompareRightMap() { return this.rightMap; }
  hasCompareMaps() { return !!this.map && !!this.rightMap; }
  hasDifferenceLayers() { return false; }
  setMapLoading = jasmine.createSpy('setMapLoading');
  removeContentLayer = jasmine.createSpy('removeContentLayer');
  loadContentLayer = jasmine.createSpy('loadContentLayer').and.resolveTo();
  updateContentLayerTiles = jasmine.createSpy('updateContentLayerTiles').and.resolveTo();
  loadContentLayerOnMap = jasmine.createSpy('loadContentLayerOnMap').and.resolveTo(true);
  updateContentLayerOnMap = jasmine.createSpy('updateContentLayerOnMap').and.resolveTo();
  loadDifferenceLayersOnMap = jasmine.createSpy('loadDifferenceLayersOnMap').and.resolveTo(true);
  updateDifferenceLayersOnMap = jasmine.createSpy('updateDifferenceLayersOnMap').and.resolveTo();

  attachMap(): void {
    this.map = { getZoom: () => this.zoom, getSource: () => ({}), resize: () => undefined };
  }
}

// --- Harness --------------------------------------------------------------------------------

interface Harness {
  service: FilterConfigService;
  projects: ProjectsService;
  session: DashboardSessionService;
  mapService: FakeMapService;
  /** Sets the project and lets the effects and (synchronous) catalog loads settle. */
  openProject(p: Project): void;
}

function setup(): Harness {
  const mapService = new FakeMapService();
  TestBed.configureTestingModule({
    providers: [
      testProviders(),
      { provide: MapService, useValue: mapService },
      { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
      { provide: ProfileService, useValue: { getProfiles: () => page(PROFILES) } },
      { provide: RegioStarService, useValue: { getRegioStars: () => page(REGIOSTARS) } },
      { provide: StateService, useValue: { getStates: () => page(STATES) } },
      { provide: CategoryService, useValue: { getCategories: () => page([]) } },
      { provide: PersonaService, useValue: { getPersonas: () => page(PERSONAS) } },
    ],
  });
  const service = TestBed.inject(FilterConfigService);
  const projects = TestBed.inject(ProjectsService);
  const session = TestBed.inject(DashboardSessionService);
  return {
    service,
    projects,
    session,
    mapService,
    openProject(p: Project) {
      projects.setProject(p);
      TestBed.tick();
      TestBed.tick();
    },
  };
}

describe('FilterConfigService (characterization)', () => {
  beforeEach(() => localStorage.removeItem('user_settings'));
  afterEach(() => localStorage.removeItem('user_settings'));

  describe('project load and switch', () => {
    it('preselects all project modes and all catalog filters on first load', () => {
      const h = setup();
      h.openProject(project(1, [WALK, BIKE, CAR]));

      expect(h.service.selectedModes()).toEqual([WALK, BIKE, CAR]);
      expect(h.service.selectedRegioStars()).toEqual([11, 12, 13]);
      expect(h.service.selectedStates()).toEqual([21, 22]);
      expect(h.service.selectedQualityBrackets()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
      expect(h.service.selectedTimeBrackets()).toEqual(['0', '600', '1200']);
      expect(h.service.isProjectFilterStateReady()).toBeTrue();
      // "All selected" is sent as no filter at all.
      const filters = h.service.contentLayerFilters()!;
      expect(filters.profile_ids).toEqual([WALK, BIKE, CAR]);
      expect(filters.state_ids).toBeUndefined();
      expect(filters.regiostar_ids).toBeUndefined();
      expect(filters.feature_type).toBe('index');
    });

    it('resets modes, compare, brackets, layer and advanced filters when the project changes', () => {
      const h = setup();
      h.openProject(project(1, [WALK, BIKE, CAR]));

      h.service.toggleMode(CAR);
      h.service.toggleQualityBracket('A');
      h.service.toggleTimeBracket('600');
      h.service.selectLayerFromUi('county');
      h.service.setBewertung('zeit');
      h.service.applyExternalFilterState({ regiostarIds: [12], stateIds: [22] });
      h.service.toggleMapCompare();
      TestBed.tick();
      h.service.confirmEnableMapCompare();
      TestBed.tick();
      expect(h.service.isMapCompareMode()).toBeTrue();

      h.openProject(project(2, [BIKE, TRANSIT]));

      expect(h.service.selectedModes()).toEqual([BIKE, TRANSIT]);
      expect(h.service.rightSelectedModes()).toEqual([BIKE, TRANSIT]);
      expect(h.service.isMapCompareMode()).toBeFalse();
      expect(h.service.isDifferenceView()).toBeFalse();
      expect(h.service.pendingMapCompareEnable()).toBeFalse();
      expect(h.service.selectedQualityBrackets()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
      expect(h.service.selectedTimeBrackets()).toEqual(['0', '600', '1200']);
      expect(h.service.layerMode()).toBe('auto');
      expect(h.service.selectedAdminLevel()).toBeNull();
      expect(h.service.selectedRegioStars()).toEqual([11, 12, 13]);
      expect(h.service.selectedStates()).toEqual([21, 22]);
      // Not reset on a project switch:
      expect(h.service.selectedBewertung()).toBe('zeit');
    });

    it('keeps the last mode selected (cannot deselect all) and ignores modes outside the project', () => {
      const h = setup();
      h.openProject(project(1, [WALK, BIKE]));

      h.service.toggleMode(WALK);
      h.service.toggleMode(BIKE);
      expect(h.service.selectedModes()).toEqual([BIKE]);
      expect(h.service.isOnlySelectedMode(BIKE)).toBeTrue();

      h.service.toggleMode(CAR);
      expect(h.service.selectedModes()).toEqual([BIKE]);
    });

    it('restores the stored selections of a returning user, validated against the project', () => {
      localStorage.setItem('user_settings', JSON.stringify({
        verkehrsmittel: [BIKE, 99],
        bewertung: 'zeit',
        layerMode: 'manual',
        adminLevel: 'municipality',
        legendBrackets: { quality: ['B', 'X'], time: ['600', 'nope'] },
        filters: { regiostars: [12, 999], states: [22] },
      }));
      const h = setup();
      h.openProject(project(1, [WALK, BIKE, CAR]));

      expect(h.service.selectedBewertung()).toBe('zeit');
      // Values that do not exist in the project (profile 99, RegioStar 999, bracket 'X',
      // time bracket 'nope') are dropped.
      expect(h.service.selectedModes()).toEqual([BIKE]);
      expect(h.service.selectedRegioStars()).toEqual([12]);
      expect(h.service.selectedStates()).toEqual([22]);
      expect(h.service.selectedQualityBrackets()).toEqual(['B']);
      expect(h.service.selectedTimeBrackets()).toEqual(['600']);
      expect(h.service.layerMode()).toBe('manual');
      expect(h.service.effectiveAdminLevel()).toBe('municipality');
    });

    it('starts fresh on a project switch even with stored settings', () => {
      localStorage.setItem('user_settings', JSON.stringify({
        verkehrsmittel: [BIKE],
        filters: { regiostars: [12], states: [22] },
      }));
      const h = setup();
      h.openProject(project(1, [WALK, BIKE, CAR]));
      expect(h.service.selectedModes()).toEqual([BIKE]);

      h.openProject(project(2, [BIKE, TRANSIT]));

      expect(h.service.selectedModes()).toEqual([BIKE, TRANSIT]);
      expect(h.service.selectedRegioStars()).toEqual([11, 12, 13]);
      expect(h.service.selectedStates()).toEqual([21, 22]);
    });
  });

  describe('URL parameters (applyExternalFilterState / applyExternalCompareState)', () => {
    it('applies valid values and drops values outside the project or catalogs', () => {
      const h = setup();
      h.openProject(project(1, [WALK, BIKE, CAR]));

      h.service.applyExternalFilterState({
        bewertung: 'zeit',
        profileIds: [BIKE, 99],
        qualityBrackets: ['B', 'C'],
        timeBrackets: ['600', 'nope'],
        regiostarIds: [12, 999],
        stateIds: [22],
        layer: 'municipality',
      });

      expect(h.service.selectedBewertung()).toBe('zeit');
      expect(h.service.selectedModes()).toEqual([BIKE]);
      expect(h.service.selectedQualityBrackets()).toEqual(['B', 'C']);
      expect(h.service.selectedTimeBrackets()).toEqual(['600']);
      expect(h.service.selectedRegioStars()).toEqual([12]);
      expect(h.service.selectedStates()).toEqual([22]);
      expect(h.service.layerMode()).toBe('manual');
      expect(h.service.effectiveAdminLevel()).toBe('municipality');

      const stored = JSON.parse(localStorage.getItem('user_settings')!);
      expect(stored.verkehrsmittel).toEqual([BIKE]);
      expect(stored.layerMode).toBe('manual');
      expect(stored.adminLevel).toBe('municipality');
    });

    it('keeps the current value when nothing in the URL is valid, but accepts empty bracket lists', () => {
      const h = setup();
      h.openProject(project(1, [WALK, BIKE]));

      h.service.applyExternalFilterState({ profileIds: [99], regiostarIds: [999], qualityBrackets: [] });

      expect(h.service.selectedModes()).toEqual([WALK, BIKE]);
      expect(h.service.selectedRegioStars()).toEqual([11, 12, 13]);
      expect(h.service.selectedQualityBrackets()).toEqual([]);
    });

    it('switches a forced layer back to automatic with layer: null', () => {
      const h = setup();
      h.openProject(project(1, [WALK]));
      h.service.applyExternalFilterState({ layer: 'county' });
      expect(h.service.layerMode()).toBe('manual');

      h.service.applyExternalFilterState({ layer: null });
      expect(h.service.layerMode()).toBe('auto');
      expect(h.service.selectedAdminLevel()).toBeNull();
    });

    it('ignores state / RegioStar params for share viewers without the filters feature', () => {
      const h = setup();
      h.session.setShareKey('share-1');
      h.openProject(project(1, [WALK, BIKE], { features: { filters: false } }));

      h.service.applyExternalFilterState({ regiostarIds: [12], stateIds: [22], profileIds: [BIKE] });

      expect(h.service.selectedRegioStars()).toEqual([11, 12, 13]);
      expect(h.service.selectedStates()).toEqual([21, 22]);
      expect(h.service.selectedModes()).toEqual([BIKE]);
    });

    it('requests the compare view with the URL right-hand modes', () => {
      const h = setup();
      h.openProject(project(1, [WALK, BIKE, CAR]));

      expect(h.service.applyExternalCompareState([CAR, 99])).toBeTrue();
      TestBed.tick();

      expect(h.service.pendingMapCompareEnable()).toBeTrue();
      expect(h.service.hasUrlCompareIntent()).toBeTrue();
      expect(h.service.rightSelectedModes()).toEqual([CAR]);
      expect(h.service.canConfirmMapCompare()).toBeTrue();

      h.service.confirmEnableMapCompare();
      expect(h.service.isMapCompareMode()).toBeTrue();
      expect(h.service.hasUrlCompareIntent()).toBeFalse();

      // Already comparing: only the right-hand modes change.
      expect(h.service.applyExternalCompareState([WALK])).toBeTrue();
      expect(h.service.rightSelectedModes()).toEqual([WALK]);
    });

    it('rejects a URL compare view the viewer may not use', () => {
      const h = setup();
      h.session.setShareKey('share-1');
      h.openProject(project(1, [WALK, BIKE], { features: { compare: false } }));

      expect(h.service.applyExternalCompareState([BIKE])).toBeFalse();
      expect(h.service.pendingMapCompareEnable()).toBeFalse();
      expect(h.service.hasUrlCompareIntent()).toBeFalse();
    });
  });

  describe('compare and difference toggles', () => {
    it('goes pending → compare → difference → back to single', () => {
      const h = setup();
      h.openProject(project(1, [WALK, BIKE]));

      h.service.toggleMapCompare();
      expect(h.service.pendingMapCompareEnable()).toBeTrue();
      expect(h.service.isMapCompareMode()).toBeFalse();
      expect(h.service.rightSelectedModes()).toEqual([WALK, BIKE]);

      h.service.confirmEnableMapCompare();
      expect(h.service.isMapCompareMode()).toBeTrue();
      expect(h.service.pendingMapCompareEnable()).toBeFalse();

      h.service.toggleDifferenceView();
      expect(h.service.isDifferenceView()).toBeTrue();
      expect(h.service.isMapModeTransitionInProgress()).toBeTrue();
      expect(h.service.compareMapsReady()).toBeFalse();

      h.service.setMapModeTransitionInProgress(false);
      h.service.toggleMapCompare();
      expect(h.service.isMapCompareMode()).toBeFalse();
      expect(h.service.isDifferenceView()).toBeFalse();
      expect(h.service.isMapModeTransitionInProgress()).toBeTrue();
    });

    it('ignores the difference toggle outside compare mode', () => {
      const h = setup();
      h.openProject(project(1, [WALK]));
      h.service.toggleDifferenceView();
      expect(h.service.isDifferenceView()).toBeFalse();
    });

    it('keeps the last right-hand mode selected', () => {
      const h = setup();
      h.openProject(project(1, [WALK, BIKE]));
      h.service.toggleMapCompare();

      h.service.toggleRightMode(WALK);
      h.service.toggleRightMode(BIKE);
      expect(h.service.rightSelectedModes()).toEqual([BIKE]);
    });

    it('blocks difference for shares without it and leaves difference when it is revoked', () => {
      const h = setup();
      h.session.setShareKey('share-1');
      h.openProject(project(1, [WALK, BIKE], { features: { compare: true, difference: false } }));
      h.service.toggleMapCompare();
      h.service.confirmEnableMapCompare();

      h.service.toggleDifferenceView();
      expect(h.service.isDifferenceView()).toBeFalse();

      // Allowed first, then the share (same project id) drops `difference`.
      h.openProject(project(1, [WALK, BIKE], { features: { compare: true, difference: true } }));
      h.service.toggleDifferenceView();
      expect(h.service.isDifferenceView()).toBeTrue();

      h.openProject(project(1, [WALK, BIKE], { features: { compare: true, difference: false } }));
      expect(h.service.isDifferenceView()).toBeFalse();
      expect(h.service.isMapCompareMode()).toBeTrue();
    });

    it('leaves compare mode when compare is revoked', () => {
      const h = setup();
      h.session.setShareKey('share-1');
      h.openProject(project(1, [WALK, BIKE], { features: { compare: true } }));
      h.service.toggleMapCompare();
      h.service.confirmEnableMapCompare();
      expect(h.service.isMapCompareMode()).toBeTrue();

      h.openProject(project(1, [WALK, BIKE], { features: { compare: false } }));

      expect(h.service.isMapCompareMode()).toBeFalse();
      expect(h.service.isMapModeTransitionInProgress()).toBeTrue();
      h.service.toggleMapCompare();
      expect(h.service.pendingMapCompareEnable()).toBeFalse();
    });
  });

  describe('layer mode per zoom', () => {
    it('picks the automatic layer from the rounded zoom', () => {
      const h = setup();
      h.openProject(project(1, [WALK]));
      const levelAt = (zoom: number) => {
        h.service.setCurrentMapZoom(zoom);
        return h.service.effectiveAdminLevel();
      };

      expect(levelAt(6)).toBe('state');
      expect(levelAt(7)).toBe('state');
      expect(levelAt(8.4)).toBe('county');
      expect(levelAt(8.6)).toBe('municipality');
      expect(levelAt(9)).toBe('municipality');
      expect(levelAt(10)).toBe('hexagon');
      expect(levelAt(14)).toBe('hexagon');
      expect(h.service.contentLayerFilters()!.admin_level).toBe('hexagon');
    });

    it('skips state and county while only some RegioStars are selected', () => {
      const h = setup();
      h.openProject(project(1, [WALK]));
      h.service.applyExternalFilterState({ regiostarIds: [11] });
      TestBed.tick();

      h.service.setCurrentMapZoom(7);
      expect(h.service.effectiveAdminLevel()).toBe('municipality');
      h.service.setCurrentMapZoom(9);
      expect(h.service.effectiveAdminLevel()).toBe('hexagon');
    });

    it('forces a layer from the UI and toggles back to automatic on a second click', () => {
      const h = setup();
      h.openProject(project(1, [WALK]));
      h.service.setCurrentMapZoom(12);

      h.service.selectLayerFromUi('county');
      expect(h.service.layerMode()).toBe('manual');
      expect(h.service.effectiveAdminLevel()).toBe('county');

      h.service.selectLayerFromUi('county');
      expect(h.service.layerMode()).toBe('auto');
      expect(h.service.effectiveAdminLevel()).toBe('hexagon');
    });

    it('drops a forced layer when zooming out past it, but keeps it when zooming in', () => {
      const h = setup();
      h.openProject(project(1, [WALK]));
      h.service.setCurrentMapZoom(9);
      h.service.selectLayerFromUi('municipality');

      h.service.setCurrentMapZoom(12);
      expect(h.service.layerMode()).toBe('manual');
      expect(h.service.effectiveAdminLevel()).toBe('municipality');

      h.service.setCurrentMapZoom(8);
      expect(h.service.layerMode()).toBe('auto');
      expect(h.service.effectiveAdminLevel()).toBe('county');
    });

    it('limits share viewers to one level finer than automatic and falls back with a notice', () => {
      const h = setup();
      h.session.setShareKey('share-1');
      h.openProject(project(1, [WALK], { features: {} }));

      h.service.setCurrentMapZoom(7);
      expect(h.service.availableAdminLevels()).toEqual(['state']);
      h.service.setCurrentMapZoom(8);
      expect(h.service.availableAdminLevels()).toEqual(['state', 'county', 'municipality']);

      h.service.selectLayerFromUi('municipality');
      expect(h.service.effectiveAdminLevel()).toBe('municipality');
      h.service.selectLayerFromUi('hexagon');
      expect(h.service.effectiveAdminLevel()).toBe('municipality');

      const noticeBefore = h.service.layerFallbackNoticeNonce();
      expect(h.service.setCurrentMapZoom(7)).toBeTrue();
      expect(h.service.layerMode()).toBe('auto');
      expect(h.service.layerFallbackNoticeNonce()).toBe(noticeBefore + 1);
    });
  });

  describe('applying filters to the map', () => {
    function lastFilters(spy: jasmine.Spy): ContentLayerFilters {
      return spy.calls.mostRecent().args[1] as ContentLayerFilters;
    }

    it('loads the content layer once after the grace period, then updates it per filter change', fakeAsync(() => {
      const h = setup();
      h.mapService.attachMap();
      h.mapService.zoom = 12;
      h.service.setCurrentMapZoom(12);
      h.openProject(project(1, [WALK, BIKE]));

      tick(499);
      expect(h.mapService.loadContentLayerOnMap).not.toHaveBeenCalled();
      tick(1);
      flushMicrotasks();
      TestBed.tick();
      expect(h.mapService.loadContentLayerOnMap).toHaveBeenCalledTimes(1);
      expect(lastFilters(h.mapService.loadContentLayerOnMap).profile_ids).toEqual([WALK, BIKE]);
      expect(lastFilters(h.mapService.loadContentLayerOnMap).admin_level).toBe('hexagon');

      // Mode change: one in-place update, no reload.
      h.service.toggleMode(BIKE);
      TestBed.tick();
      flushMicrotasks();
      TestBed.tick();
      expect(h.mapService.updateContentLayerOnMap).toHaveBeenCalledTimes(1);
      expect(lastFilters(h.mapService.updateContentLayerOnMap).profile_ids).toEqual([WALK]);
      expect(h.mapService.loadContentLayerOnMap).toHaveBeenCalledTimes(1);

      // Legend bracket: one more in-place update.
      h.service.toggleQualityBracket('F');
      TestBed.tick();
      flushMicrotasks();
      TestBed.tick();
      expect(h.mapService.updateContentLayerOnMap).toHaveBeenCalledTimes(2);
      expect(lastFilters(h.mapService.updateContentLayerOnMap).selected_quality_brackets)
        .toEqual(['A', 'B', 'C', 'D', 'E']);

      // Zooming within the same layer changes nothing.
      h.mapService.zoom = 13;
      h.service.setCurrentMapZoom(13);
      TestBed.tick();
      flushMicrotasks();
      expect(h.mapService.updateContentLayerOnMap).toHaveBeenCalledTimes(2);
      expect(h.mapService.loadContentLayerOnMap).toHaveBeenCalledTimes(1);

      // Crossing into another layer: full reload with the new admin level.
      h.mapService.zoom = 9;
      h.service.setCurrentMapZoom(9);
      TestBed.tick();
      flushMicrotasks();
      TestBed.tick();
      expect(h.mapService.loadContentLayerOnMap).toHaveBeenCalledTimes(2);
      expect(lastFilters(h.mapService.loadContentLayerOnMap).admin_level).toBe('municipality');
    }));

    /** Lets effects run and the (resolved) MapService promises settle. */
    function settle(): void {
      TestBed.tick();
      flushMicrotasks();
      TestBed.tick();
      flushMicrotasks();
    }

    it('loads both compare maps once, then updates only the side that changed', fakeAsync(() => {
      const h = setup();
      h.mapService.attachMap();
      h.mapService.zoom = 12;
      h.service.setCurrentMapZoom(12);
      h.openProject(project(1, [WALK, BIKE]));
      tick(500);
      settle();
      h.mapService.loadContentLayerOnMap.calls.reset();

      h.service.toggleMapCompare();
      h.service.confirmEnableMapCompare();
      // The map host replaces the single map with two compare maps.
      h.service.resetMapLayerUpdateState();
      const left = h.mapService.map;
      h.mapService.attachMap();
      const leftMap = h.mapService.map;
      h.mapService.rightMap = { getZoom: () => 12, getSource: () => ({}), resize: () => undefined };
      expect(leftMap).not.toBe(left);
      h.service.setCompareMapsReady(true);
      settle();
      tick(500);
      settle();

      expect(h.mapService.loadContentLayerOnMap).toHaveBeenCalledTimes(2);
      const targets = h.mapService.loadContentLayerOnMap.calls.allArgs().map(args => args[0]);
      expect(targets).toContain(leftMap);
      expect(targets).toContain(h.mapService.rightMap);

      h.service.toggleRightMode(BIKE);
      settle();
      expect(h.mapService.loadContentLayerOnMap).toHaveBeenCalledTimes(3);
      expect(h.mapService.loadContentLayerOnMap.calls.mostRecent().args[0]).toBe(h.mapService.rightMap);
      expect(lastFilters(h.mapService.loadContentLayerOnMap).profile_ids).toEqual([WALK]);
    }));

    it('loads difference layers once and reloads the normal layer when leaving the difference view', fakeAsync(() => {
      const h = setup();
      h.mapService.attachMap();
      h.mapService.zoom = 12;
      h.service.setCurrentMapZoom(12);
      h.openProject(project(1, [WALK, BIKE]));
      tick(500);
      settle();

      h.service.toggleMapCompare();
      h.service.confirmEnableMapCompare();
      h.service.toggleDifferenceView();
      // The map host creates one map for the difference view, then reports it ready.
      h.service.resetMapLayerUpdateState();
      h.mapService.attachMap();
      const differenceMap = h.mapService.map;
      h.service.setMapModeTransitionInProgress(false);
      h.service.setCompareMapsReady(true);
      settle();
      tick(500);
      settle();

      expect(h.mapService.loadDifferenceLayersOnMap).toHaveBeenCalledTimes(1);
      expect(h.mapService.loadDifferenceLayersOnMap.calls.mostRecent().args[0]).toBe(differenceMap);

      // Compare off: the difference map is kept as the single map and must get normal layers.
      h.mapService.loadContentLayerOnMap.calls.reset();
      h.service.toggleMapCompare();
      h.service.setMapModeTransitionInProgress(false);
      h.service.refreshMapLayers();
      settle();

      expect(h.mapService.loadContentLayerOnMap).toHaveBeenCalledTimes(1);
      expect(h.mapService.loadContentLayerOnMap.calls.mostRecent().args[0]).toBe(differenceMap);
    }));

    it('does not touch the map before the project filter data is ready', fakeAsync(() => {
      const h = setup();
      h.mapService.attachMap();
      tick(1000);
      TestBed.tick();
      expect(h.mapService.loadContentLayerOnMap).not.toHaveBeenCalled();
      expect(h.mapService.updateContentLayerOnMap).not.toHaveBeenCalled();
    }));
  });
});
