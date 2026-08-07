import { neutrino } from '@versatiles/style';
import type { LayerSpecification, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';

/** Self-hosted Shortbread vector tiles (VersaTiles). */
export const BASEMAP_TILE_URL = 'https://tiles.mapr.mobi/tiles/eu/{z}/{x}/{y}';

/** Glyphs/sprites are served by the public VersaTiles CDN. */
const BASEMAP_ASSETS_BASE_URL = 'https://tiles.versatiles.org';

const STYLE_OPTIONS = {
  tiles: [BASEMAP_TILE_URL],
  baseUrl: BASEMAP_ASSETS_BASE_URL,
  language: 'de' as const,
  colors: {
    // Dark labels + light halo stay readable over choropleth fills
    label: '#1a1a1a',
    labelHalo: '#ffffff',
  },
};

let cachedBasemapStyle: StyleSpecification | null = null;
let cachedBasemapNoLabels: StyleSpecification | null = null;

function isBasemapLabelLayer(layer: LayerSpecification): boolean {
  return layer.type === 'symbol' && !layer.id.startsWith('places-');
}

function cloneStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    sources: { ...style.sources },
    layers: [...style.layers],
  };
}

/**
 * Builds the MapLibre basemap style from Shortbread tiles.
 * Label (symbol) layers are placed last so overlays can be inserted underneath.
 */
export function buildBasemapStyle(options?: { hideLabels?: boolean }): StyleSpecification {
  if (options?.hideLabels) {
    if (!cachedBasemapNoLabels) {
      cachedBasemapNoLabels = neutrino({ ...STYLE_OPTIONS, hideLabels: true }) as StyleSpecification;
    }
    return cloneStyle(cachedBasemapNoLabels);
  }

  if (!cachedBasemapStyle) {
    const base = neutrino({ ...STYLE_OPTIONS, hideLabels: true }) as StyleSpecification;
    const full = neutrino(STYLE_OPTIONS) as StyleSpecification;
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
