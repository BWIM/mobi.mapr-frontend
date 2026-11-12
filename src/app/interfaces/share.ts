/** Feature flags of a share key. Missing flags count as enabled. */
export interface ShareFeatures {
  /** Side-by-side compare view (`compare_profile_ids`). */
  compare: boolean;
  /** Difference map. */
  difference: boolean;
  /** Analyze panel (`/analyze/`). */
  analyze: boolean;
  /** Places dialog and map (`/places/`). */
  places: boolean;
  /** Stats and rankings (`/rankings/`). */
  stats: boolean;
  /** Map export and GeoJSON download. */
  export: boolean;
  /** Viewer may change state / RegioStar filters (within the share's restriction). */
  filters: boolean;
}

export type ShareFeature = keyof ShareFeatures;

export const SHARE_FEATURES: readonly ShareFeature[] = [
  'compare',
  'difference',
  'analyze',
  'places',
  'stats',
  'export',
  'filters',
];

/**
 * Initial dashboard view of a share, using the URL parameter names (see `url-params.ts`),
 * but with typed values (lists instead of comma-separated strings, `diff` as boolean).
 */
export interface ShareDefaultView {
  lang?: string;
  map?: string;
  bewertung?: string;
  profile_ids?: number[];
  compare_profile_ids?: number[];
  diff?: boolean;
  layer?: string;
  quality_brackets?: string[];
  time_brackets?: string[];
  regiostar_ids?: number[];
  state_ids?: number[];
  stats_level?: string;
  feature?: string;
}

/** What a share key grants. Returned as `share` on project responses requested with `?key=`. */
export interface ShareInfo {
  label: string;
  /** The share's own (anchor) project. */
  project_id: number;
  features: ShareFeatures;
  /** Groups visible through the share. */
  group_ids: number[];
  /** All projects reachable with this key. */
  project_ids: number[];
  /** `null` = all project profiles. */
  profile_ids: number[] | null;
  state_ids: number[] | null;
  regiostar_ids: number[] | null;
  default_view: ShareDefaultView;
  expire: string | null;
}

/** Body of the 403 the backend sends when a share disables a feature. */
export interface ShareFeatureForbiddenError {
  error: string;
  feature: ShareFeature;
}
