import { neutrino } from '@versatiles/style';
import type { LayerSpecification, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';

/** Self-hosted Shortbread vector tiles (VersaTiles). */
export const BASEMAP_TILE_URL = 'https://tiles.mapr.mobi/tiles/eu/{z}/{x}/{y}';

/** Glyphs/sprites are served by the public VersaTiles CDN. */
const BASEMAP_ASSETS_BASE_URL = 'https://tiles.versatiles.org';

/** Neutral ground color — avoids green landcover competing with choropleth fills. */
const LAND_COLOR = '#f1efef';

/** Land-use / vegetation fills that add clutter when zoomed in. */
const CLUTTER_LAYER_ID =
  /^(land-park|land-garden|land-forest|land-grass|land-vegetation|land-agriculture|land-leisure|land-burial|land-waste|land-commercial|land-industrial|land-residential)/;

const STYLE_OPTIONS = {
  tiles: [BASEMAP_TILE_URL],
  baseUrl: BASEMAP_ASSETS_BASE_URL,
  language: 'de' as const,
  colors: {
    label: '#1a1a1a',
    labelHalo: '#ffffff',
    land: LAND_COLOR,
    park: LAND_COLOR,
    wood: LAND_COLOR,
    grass: LAND_COLOR,
    agriculture: LAND_COLOR,
    leisure: LAND_COLOR,
    commercial: LAND_COLOR,
    residential: LAND_COLOR,
    industrial: LAND_COLOR,
    burial: LAND_COLOR,
    waste: LAND_COLOR,
  },
  // Pull remaining hue (e.g. leftover greens) toward neutral without washing out water entirely.
  recolor: {
    saturate: -0.3,
  },
};

let cachedBasemapStyle: StyleSpecification | null = null;
let cachedBasemapNoLabels: StyleSpecification | null = null;

function isBasemapLabelLayer(layer: LayerSpecification): boolean {
  return layer.type === 'symbol' && !layer.id.startsWith('places-');
}

function simplifyBasemapLayers(layers: LayerSpecification[]): LayerSpecification[] {
  return layers.filter((layer) => !CLUTTER_LAYER_ID.test(layer.id));
}

function cloneStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    sources: { ...style.sources },
    layers: [...style.layers],
  };
}

function buildNeutrinoStyle(hideLabels: boolean): StyleSpecification {
  const style = neutrino({ ...STYLE_OPTIONS, hideLabels }) as StyleSpecification;
  return {
    ...style,
    layers: simplifyBasemapLayers(style.layers),
  };
}

/**
 * Builds the MapLibre basemap style from Shortbread tiles.
 * Label (symbol) layers are placed last so overlays can be inserted underneath.
 */
export function buildBasemapStyle(options?: { hideLabels?: boolean }): StyleSpecification {
  if (options?.hideLabels) {
    if (!cachedBasemapNoLabels) {
      cachedBasemapNoLabels = buildNeutrinoStyle(true);
    }
    return cloneStyle(cachedBasemapNoLabels);
  }

  if (!cachedBasemapStyle) {
    const base = buildNeutrinoStyle(true);
    const full = buildNeutrinoStyle(false);
    const labelLayers = full.layers.filter(isBasemapLabelLayer);
    cachedBasemapStyle = {
      ...base,
      layers: [...base.layers, ...labelLayers],
    };
  }

  return cloneStyle(cachedBasemapStyle);
}

export function getFirstBasemapLabelLayerId(style: StyleSpecification): string | undefined {
  return style.layers.find(isBasemapLabelLayer)?.id;
}

/** Move basemap label layers above content / overlay layers. */
export function moveBasemapLabelsToTop(style: StyleSpecification): StyleSpecification {
  const labelLayers = style.layers.filter(isBasemapLabelLayer);
  if (labelLayers.length === 0) {
    return style;
  }

  const otherLayers = style.layers.filter((layer) => !isBasemapLabelLayer(layer));
  style.layers = [...otherLayers, ...labelLayers];
  return style;
}

/**
 * Layer id to pass as MapLibre `beforeId` so overlays stay under basemap labels.
 * Prefers the first symbol layer that is not an app-owned places label.
 */
export function findBasemapLabelsBeforeId(map: MapLibreMap): string | undefined {
  const layers = map.getStyle()?.layers;
  if (!layers) {
    return undefined;
  }

  const firstLabel = layers.find(
    (layer) =>
      layer.type === 'symbol' &&
      !layer.id.startsWith('places-') &&
      map.getLayer(layer.id)
  );

  return firstLabel?.id;
}
