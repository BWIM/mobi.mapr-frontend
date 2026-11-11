import { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { findBasemapLabelsBeforeId } from '../../services/basemap-style';

/**
 * Shared styling for the places maps (desktop dialog and mobile analyze sheet).
 *
 * The map shows one activity at a time ("focus"): its places are drawn in the theme violet,
 * all other places are small grey dots. The rating itself is shown in the summary and the side
 * panel, so the map only answers "where are the places of this activity?".
 */

/** Grey for places of the activities that are not in focus. */
const DIMMED_COLOR = '#8a8f98';
/** Theme violet (see --secondary-color) for the places in focus and the selected area. */
const FOCUS_COLOR = '#482683';
const AREA_COLOR = FOCUS_COLOR;

const AREA_SOURCE_ID = 'feature-shape';
const AREA_FILL_LAYER_ID = 'feature-shape-fill';
const AREA_CASING_LAYER_ID = 'feature-shape-casing';
const AREA_OUTLINE_LAYER_ID = 'feature-shape-outline';

export function placesCircleLayerId(activityName: string): string {
  return `places-circles-${activityName}`;
}

const RADIUS_NORMAL = ['interpolate', ['linear'], ['zoom'], 5, 6, 10, 9, 14, 12];
const RADIUS_FOCUSED = ['interpolate', ['linear'], ['zoom'], 5, 8, 10, 12, 14, 16];
const RADIUS_DIMMED = ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 4.5, 14, 6];

/** Paint for a newly added circle layer, matching the current focus. */
export function placesCirclePaint(color: string, focused: string | null, activityName: string): Record<string, unknown> {
  return circlePaint(color, focusState(focused, activityName));
}

/**
 * Applies the focus to all places layers: focused activity in its grade colour and on top,
 * the others grey and small. `focused === null` shows every activity in its colour.
 */
export function applyPlacesFocus(
  map: MapLibreMap,
  activities: ReadonlyArray<{ name: string; color: string }>,
  focused: string | null,
): void {
  for (const activity of activities) {
    const layerId = placesCircleLayerId(activity.name);
    if (!map.getLayer(layerId)) {
      continue;
    }
    const paint = circlePaint(activity.color, focusState(focused, activity.name));
    for (const [property, value] of Object.entries(paint)) {
      map.setPaintProperty(layerId, property, value);
    }
  }
  // Draw the focused activity above the grey dots (directly below the basemap labels).
  const focusedLayerId = focused ? placesCircleLayerId(focused) : null;
  if (focusedLayerId && map.getLayer(focusedLayerId)) {
    map.moveLayer(focusedLayerId, findBasemapLabelsBeforeId(map));
  }
}

type FocusState = 'all' | 'focused' | 'dimmed';

function focusState(focused: string | null, activityName: string): FocusState {
  if (focused === null) {
    return 'all';
  }
  return focused === activityName ? 'focused' : 'dimmed';
}

function circlePaint(color: string, state: FocusState): Record<string, unknown> {
  switch (state) {
    case 'focused':
      return {
        'circle-radius': RADIUS_FOCUSED,
        'circle-color': FOCUS_COLOR,
        'circle-opacity': 1,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 1,
      };
    case 'dimmed':
      return {
        'circle-radius': RADIUS_DIMMED,
        'circle-color': DIMMED_COLOR,
        'circle-opacity': 0.6,
        'circle-stroke-width': 0.5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.6,
      };
    default:
      return {
        'circle-radius': RADIUS_NORMAL,
        'circle-color': color,
        'circle-opacity': 1,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(0, 0, 0, 0.55)',
        'circle-stroke-opacity': 1,
      };
  }
}

/**
 * Draws the selected area (the place the analysis is for) in the brand colour with a name label,
 * below the places dots. Returns the label marker so the caller can remove it.
 */
export function addSelectedAreaToMap(map: MapLibreMap, shape: unknown, label: string): Marker | undefined {
  if (!shape) {
    return undefined;
  }
  const data = (
    (shape as { type?: string }).type === 'FeatureCollection'
      ? shape
      : { type: 'FeatureCollection', features: [shape] }
  ) as GeoJSON.FeatureCollection;

  const source = map.getSource(AREA_SOURCE_ID) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource(AREA_SOURCE_ID, { type: 'geojson', data });
  }

  // Below the places dots, so dots inside the area stay visible.
  const beforeId = firstPlacesLayerId(map) ?? findBasemapLabelsBeforeId(map);
  if (!map.getLayer(AREA_FILL_LAYER_ID)) {
    map.addLayer(
      {
        id: AREA_FILL_LAYER_ID,
        type: 'fill',
        source: AREA_SOURCE_ID,
        paint: { 'fill-color': AREA_COLOR, 'fill-opacity': 0.15 },
      },
      beforeId,
    );
    // White casing under the outline keeps it readable on dark and light basemap areas.
    map.addLayer(
      {
        id: AREA_CASING_LAYER_ID,
        type: 'line',
        source: AREA_SOURCE_ID,
        paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.9 },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: AREA_OUTLINE_LAYER_ID,
        type: 'line',
        source: AREA_SOURCE_ID,
        paint: { 'line-color': AREA_COLOR, 'line-width': 2.5 },
      },
      beforeId,
    );
  }

  // Label sits above the area so it doesn't cover the area or the dots inside it (hexagons are small).
  const topCenter = boundsTopCenter(data);
  if (!topCenter) {
    return undefined;
  }
  return new Marker({ element: createAreaLabel(label), anchor: 'bottom', offset: [0, -6] })
    .setLngLat(topCenter)
    .addTo(map);
}

function firstPlacesLayerId(map: MapLibreMap): string | undefined {
  return map.getStyle()?.layers?.find((layer) => layer.id.startsWith('places-circles-'))?.id;
}

function createAreaLabel(text: string): HTMLElement {
  const element = document.createElement('div');
  element.textContent = text;
  // Inline styles: the marker element lives outside Angular's component styles.
  Object.assign(element.style, {
    padding: '2px 10px',
    borderRadius: '999px',
    background: AREA_COLOR,
    color: '#ffffff',
    font: "600 12px 'Corbel', Arial, sans-serif",
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.35)',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  return element;
}

/** Middle of the top edge of the bounding box of all coordinates in the collection. */
function boundsTopCenter(data: GeoJSON.FeatureCollection): [number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) {
      return;
    }
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      minX = Math.min(minX, coords[0]);
      maxX = Math.max(maxX, coords[0]);
      minY = Math.min(minY, coords[1]);
      maxY = Math.max(maxY, coords[1]);
      return;
    }
    coords.forEach(visit);
  };
  for (const feature of data.features ?? []) {
    const geometry = feature?.geometry as { coordinates?: unknown } | null;
    visit(geometry?.coordinates);
  }
  return Number.isFinite(minX) ? [(minX + maxX) / 2, maxY] : null;
}
