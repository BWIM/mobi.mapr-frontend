import { Params } from '@angular/router';

/**
 * Single source of truth for every query parameter the dashboard understands.
 *
 * Parsing and serialisation are pure functions so they can be unit-tested
 * without Angular. Wiring to the application state lives in UrlStateService.
 */

export type Bewertung = 'qualitaet' | 'zeit';
export type UrlAdminLevel = 'state' | 'county' | 'municipality' | 'hexagon';
export type UrlStatsLevel = 'state' | 'county' | 'municipality';
export type UrlQualityBracket = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type FeatureTileType = 'h' | 'm' | 'c' | 's';

export interface UrlViewport {
  zoom: number;
  lat: number;
  lng: number;
}

/** A map feature, identified by its tile type (property `t`) and id. */
export interface FeatureRef {
  type: FeatureTileType;
  id: number;
}

/** Dashboard view state that is mirrored into the URL (everything except project access). */
export interface DashboardUrlState {
  lang?: string;
  viewport?: UrlViewport;
  bewertung?: Bewertung;
  profileIds?: number[];
  /** Right-hand profiles; presence means "compare view on". */
  compareProfileIds?: number[];
  diff?: boolean;
  /** Forced map layer; absent means automatic layer by zoom. */
  layer?: UrlAdminLevel;
  /** Absent means all; empty array means none. */
  qualityBrackets?: UrlQualityBracket[];
  /** Absent means all; empty array means none. */
  timeBrackets?: string[];
  /** Absent means all. */
  regiostarIds?: number[];
  /** Absent means all. */
  stateIds?: number[];
  statsLevel?: UrlStatsLevel;
  feature?: FeatureRef;
  /** Side of the compare view the primary feature was picked on (default left). */
  featureSide?: 'left' | 'right';
  /** Second feature for comparison. */
  feature2?: FeatureRef;
}

export type DashboardUrlStateKey = keyof DashboardUrlState;

/** Query parameter names. */
export const URL_PARAM = {
  // Project access (owned by DashboardComponent / ProjectNavigationService)
  projectId: 'project_id',
  shareKey: 'share_key',
  overview: 'overview',
  // View state (owned by UrlStateService)
  lang: 'lang',
  viewport: 'map',
  bewertung: 'bewertung',
  profileIds: 'profile_ids',
  compareProfileIds: 'compare_profile_ids',
  diff: 'diff',
  layer: 'layer',
  qualityBrackets: 'quality_brackets',
  timeBrackets: 'time_brackets',
  regiostarIds: 'regiostar_ids',
  stateIds: 'state_ids',
  statsLevel: 'stats_level',
  feature: 'feature',
  featureSide: 'feature_side',
  feature2: 'feature2',
} as const;

/** Old parameter names that are still accepted when reading (never written). */
export const LEGACY_URL_PARAM = {
  /** Mixed list of quality (A–F) and time bracket ids. Replaced by quality_brackets / time_brackets. */
  legendBrackets: 'legend_brackets',
} as const;

const STATE_KEYS = [
  'lang',
  'viewport',
  'bewertung',
  'profileIds',
  'compareProfileIds',
  'diff',
  'layer',
  'qualityBrackets',
  'timeBrackets',
  'regiostarIds',
  'stateIds',
  'statsLevel',
  'feature',
  'featureSide',
  'feature2',
] as const satisfies readonly DashboardUrlStateKey[];

/** Every query parameter written by UrlStateService. */
export const VIEW_STATE_PARAMS: readonly string[] = [
  ...STATE_KEYS.map((key) => URL_PARAM[key]),
  LEGACY_URL_PARAM.legendBrackets,
];

/**
 * View state that only makes sense inside one project. Dropped when switching to another project;
 * viewport, language, rating mode and stats level are carried over.
 */
export const PROJECT_SCOPED_KEYS: readonly DashboardUrlStateKey[] = [
  'profileIds',
  'compareProfileIds',
  'diff',
  'layer',
  'qualityBrackets',
  'timeBrackets',
  'regiostarIds',
  'stateIds',
  'feature',
  'featureSide',
  'feature2',
];

export const PROJECT_SCOPED_PARAMS: readonly string[] = [
  ...PROJECT_SCOPED_KEYS.map((key) => URL_PARAM[key]),
  LEGACY_URL_PARAM.legendBrackets,
];

export const ALL_QUALITY_BRACKETS: readonly UrlQualityBracket[] = ['A', 'B', 'C', 'D', 'E', 'F'];
const ADMIN_LEVELS: readonly UrlAdminLevel[] = ['state', 'county', 'municipality', 'hexagon'];
const STATS_LEVELS: readonly UrlStatsLevel[] = ['state', 'county', 'municipality'];
const FEATURE_TILE_TYPES: readonly FeatureTileType[] = ['h', 'm', 'c', 's'];
const LANG_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;
const BRACKET_ID_PATTERN = /^[A-Za-z0-9_.-]{1,32}$/;
const NONE = 'none';

const MAX_ZOOM = 24;

// ---------------------------------------------------------------------------
// Value codecs
// ---------------------------------------------------------------------------

function firstString(value: unknown): string | null {
  if (Array.isArray(value)) {
    return firstString(value[0]);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseIdList(value: unknown): number[] | undefined {
  const raw = firstString(value);
  if (raw === null) {
    return undefined;
  }
  const ids = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^\d+$/.test(part))
    .map(Number)
    .filter((id) => Number.isSafeInteger(id));
  const unique = [...new Set(ids)];
  return unique.length > 0 ? unique : undefined;
}

export function formatIdList(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(',');
}

function parseStringList(value: unknown, isValid: (item: string) => boolean): string[] | undefined {
  const raw = firstString(value);
  if (raw === null) {
    return undefined;
  }
  if (raw === NONE) {
    return [];
  }
  const items = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && isValid(part));
  const unique = [...new Set(items)];
  return unique.length > 0 ? unique : undefined;
}

function formatStringList(items: readonly string[]): string {
  return items.length === 0 ? NONE : [...new Set(items)].join(',');
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** `zoom/lat/lng`, e.g. `9.5/49.3201/9.2157`. */
export function parseViewport(value: unknown): UrlViewport | undefined {
  const raw = firstString(value);
  if (raw === null) {
    return undefined;
  }
  const parts = raw.split('/');
  if (parts.length !== 3) {
    return undefined;
  }
  const [zoom, lat, lng] = parts.map((part) => Number(part));
  if (![zoom, lat, lng].every(Number.isFinite)) {
    return undefined;
  }
  if (zoom < 0 || zoom > MAX_ZOOM || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return undefined;
  }
  return { zoom, lat, lng };
}

export function formatViewport(viewport: UrlViewport): string {
  return `${round(viewport.zoom, 2)}/${round(viewport.lat, 5)}/${round(viewport.lng, 5)}`;
}

/** `type:id`, e.g. `m:8111000`. */
export function parseFeatureRef(value: unknown): FeatureRef | undefined {
  const raw = firstString(value);
  if (raw === null) {
    return undefined;
  }
  const match = /^([hmcs]):(\d+)$/.exec(raw);
  if (!match) {
    return undefined;
  }
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return undefined;
  }
  return { type: match[1] as FeatureTileType, id };
}

export function formatFeatureRef(ref: FeatureRef): string {
  return `${ref.type}:${ref.id}`;
}

/** Builds a FeatureRef from a MapLibre feature (tile property `t` plus id). */
export function featureRefFromFeature(
  feature: { id?: unknown; properties?: Record<string, unknown> | null } | null | undefined
): FeatureRef | undefined {
  if (!feature) {
    return undefined;
  }
  const type = feature.properties?.['t'];
  if (typeof type !== 'string' || !FEATURE_TILE_TYPES.includes(type as FeatureTileType)) {
    return undefined;
  }
  const rawId = feature.properties?.['id'] ?? feature.id;
  const id = typeof rawId === 'number' ? rawId : Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return undefined;
  }
  return { type: type as FeatureTileType, id };
}

export function featureRefsEqual(a: FeatureRef | undefined, b: FeatureRef | undefined): boolean {
  if (!a || !b) {
    return a === b;
  }
  return a.type === b.type && a.id === b.id;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const raw = firstString(value);
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

function parseFlag(value: unknown): boolean | undefined {
  const raw = firstString(value);
  if (raw === null) {
    return undefined;
  }
  if (raw === '1' || raw === 'true') {
    return true;
  }
  if (raw === '0' || raw === 'false') {
    return false;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Whole-state parse / serialise
// ---------------------------------------------------------------------------

/**
 * Parses the view state from query params. Invalid values are dropped silently.
 * Only keys that are present (and valid) in the URL are set on the result.
 */
export function parseDashboardUrlState(params: Params): DashboardUrlState {
  const state: DashboardUrlState = {};

  const lang = firstString(params[URL_PARAM.lang]);
  if (lang !== null && LANG_PATTERN.test(lang)) {
    state.lang = lang;
  }

  const viewport = parseViewport(params[URL_PARAM.viewport]);
  if (viewport) {
    state.viewport = viewport;
  }

  const bewertung = oneOf<Bewertung>(params[URL_PARAM.bewertung], ['qualitaet', 'zeit']);
  if (bewertung) {
    state.bewertung = bewertung;
  }

  const profileIds = parseIdList(params[URL_PARAM.profileIds]);
  if (profileIds) {
    state.profileIds = profileIds;
  }

  const compareProfileIds = parseIdList(params[URL_PARAM.compareProfileIds]);
  if (compareProfileIds) {
    state.compareProfileIds = compareProfileIds;
  }

  const diff = parseFlag(params[URL_PARAM.diff]);
  if (diff !== undefined) {
    state.diff = diff;
  }

  const layer = oneOf(params[URL_PARAM.layer], ADMIN_LEVELS);
  if (layer) {
    state.layer = layer;
  }

  const quality = parseStringList(params[URL_PARAM.qualityBrackets], (item) =>
    (ALL_QUALITY_BRACKETS as readonly string[]).includes(item)
  );
  const time = parseStringList(params[URL_PARAM.timeBrackets], (item) => BRACKET_ID_PATTERN.test(item));
  if (quality !== undefined) {
    state.qualityBrackets = quality as UrlQualityBracket[];
  }
  if (time !== undefined) {
    state.timeBrackets = time;
  }
  if (quality === undefined && time === undefined) {
    const legacy = parseStringList(params[LEGACY_URL_PARAM.legendBrackets], (item) =>
      BRACKET_ID_PATTERN.test(item)
    );
    if (legacy && legacy.length > 0) {
      const legacyQuality = legacy.filter((item) => (ALL_QUALITY_BRACKETS as readonly string[]).includes(item));
      const legacyTime = legacy.filter((item) => !(ALL_QUALITY_BRACKETS as readonly string[]).includes(item));
      if (legacyQuality.length > 0) {
        state.qualityBrackets = legacyQuality as UrlQualityBracket[];
      }
      if (legacyTime.length > 0) {
        state.timeBrackets = legacyTime;
      }
    }
  }

  const regiostarIds = parseIdList(params[URL_PARAM.regiostarIds]);
  if (regiostarIds) {
    state.regiostarIds = regiostarIds;
  }

  const stateIds = parseIdList(params[URL_PARAM.stateIds]);
  if (stateIds) {
    state.stateIds = stateIds;
  }

  const statsLevel = oneOf(params[URL_PARAM.statsLevel], STATS_LEVELS);
  if (statsLevel) {
    state.statsLevel = statsLevel;
  }

  const feature = parseFeatureRef(params[URL_PARAM.feature]);
  if (feature) {
    state.feature = feature;
    const side = oneOf<'left' | 'right'>(params[URL_PARAM.featureSide], ['left', 'right']);
    if (side) {
      state.featureSide = side;
    }
    const feature2 = parseFeatureRef(params[URL_PARAM.feature2]);
    if (feature2 && !featureRefsEqual(feature, feature2)) {
      state.feature2 = feature2;
    }
  }

  return state;
}

/**
 * Serialises view state into query params. Every view-state param is present in the result;
 * `null` removes it from the URL (use with `queryParamsHandling: 'merge'`).
 */
export function serializeDashboardUrlState(state: DashboardUrlState): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const name of VIEW_STATE_PARAMS) {
    out[name] = null;
  }

  if (state.lang) {
    out[URL_PARAM.lang] = state.lang;
  }
  if (state.viewport) {
    out[URL_PARAM.viewport] = formatViewport(state.viewport);
  }
  if (state.bewertung) {
    out[URL_PARAM.bewertung] = state.bewertung;
  }
  if (state.profileIds?.length) {
    out[URL_PARAM.profileIds] = formatIdList(state.profileIds);
  }
  if (state.compareProfileIds?.length) {
    out[URL_PARAM.compareProfileIds] = formatIdList(state.compareProfileIds);
    if (state.diff) {
      out[URL_PARAM.diff] = '1';
    }
  }
  if (state.layer) {
    out[URL_PARAM.layer] = state.layer;
  }
  if (state.qualityBrackets) {
    out[URL_PARAM.qualityBrackets] = formatStringList(
      ALL_QUALITY_BRACKETS.filter((bracket) => state.qualityBrackets!.includes(bracket))
    );
  }
  if (state.timeBrackets) {
    out[URL_PARAM.timeBrackets] = formatStringList(state.timeBrackets);
  }
  if (state.regiostarIds?.length) {
    out[URL_PARAM.regiostarIds] = formatIdList(state.regiostarIds);
  }
  if (state.stateIds?.length) {
    out[URL_PARAM.stateIds] = formatIdList(state.stateIds);
  }
  if (state.statsLevel) {
    out[URL_PARAM.statsLevel] = state.statsLevel;
  }
  if (state.feature) {
    out[URL_PARAM.feature] = formatFeatureRef(state.feature);
    if (state.featureSide === 'right') {
      out[URL_PARAM.featureSide] = 'right';
    }
    if (state.feature2) {
      out[URL_PARAM.feature2] = formatFeatureRef(state.feature2);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Share default view
// ---------------------------------------------------------------------------

/** True when the params carry any view state (as opposed to only project access params). */
export function hasViewStateParams(params: Params): boolean {
  return VIEW_STATE_PARAMS.some((name) => firstString(params[name]) !== null);
}

/**
 * Turns a share's `default_view` (URL param names with typed values: lists, `diff` as boolean)
 * into query params. Unknown keys and values of the wrong type are dropped; the result is then
 * validated by `parseDashboardUrlState` like any other URL.
 */
export function shareDefaultViewToParams(defaultView: Record<string, unknown> | null | undefined): Params {
  const params: Params = {};
  if (!defaultView || typeof defaultView !== 'object') {
    return params;
  }
  const known = new Set<string>(VIEW_STATE_PARAMS);
  for (const [name, value] of Object.entries(defaultView)) {
    if (!known.has(name)) {
      continue;
    }
    if (typeof value === 'string') {
      params[name] = value;
    } else if (typeof value === 'boolean') {
      params[name] = value ? '1' : '0';
    } else if (Array.isArray(value)) {
      const items = value.filter(
        (item): item is string | number => typeof item === 'string' || typeof item === 'number'
      );
      // An explicit empty bracket list means "none"; empty id lists mean "all" and are skipped.
      if (items.length > 0) {
        params[name] = items.join(',');
      } else if (name === URL_PARAM.qualityBrackets || name === URL_PARAM.timeBrackets) {
        params[name] = NONE;
      }
    }
  }
  return params;
}

/**
 * The URL query params for a share's default view: only valid values, normalised by the regular
 * parse/serialise round trip. Empty when there is nothing to apply.
 */
export function shareDefaultViewQueryParams(
  defaultView: Record<string, unknown> | null | undefined
): Record<string, string> {
  const state = parseDashboardUrlState(shareDefaultViewToParams(defaultView));
  const serialized = serializeDashboardUrlState(state);
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(serialized)) {
    if (value !== null) {
      out[name] = value;
    }
  }
  return out;
}
