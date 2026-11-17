<script setup lang="ts">
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import type { ExpressionSpecification, FilterSpecification, MapMouseEvent, PointLike, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

type Tier = 'sovereign' | 'defacto' | 'dependencies';
type PlaceStatus = 'selected' | 'right' | 'wrong' | 'reveal';

interface PlaceProperties {
  id: string
  unclaimed?: boolean
  tone?: number
}

interface SpeckProperties {
  id: string
  speckZoom: number
  tone?: number
}

type PlaceCollection = FeatureCollection<Polygon | MultiPolygon, PlaceProperties>;
type SpeckCollection = FeatureCollection<Point, SpeckProperties>;

interface Verdict {
  placeId: string
  tappedPlaceId: string
  outcome: 'right' | 'wrong'
}

const props = defineProps<{ selectedPlaceId?: string | null, verdict?: Verdict | null, fade?: number }>();
const emit = defineEmits<{ drawn: [], tap: [placeId?: string] }>();

const { t } = useI18n();

const tier: Tier = 'sovereign';
const placeSources = ['places', 'specks'] as const;
const tapBoxPx = 8;
const flightMs = 800;
const flightMaxZoom = 4;
const flightPadding = { top: 230, bottom: 60, left: 40, right: 40 };
const hatchName = 'hatch-wrong';
const highestSpeckZoom = 8;

const colours = {
  water: '#cddbe2',
  border: '#a29a86',
  ink: '#141414',
  mustard: '#f2c14e',
  green: '#2f7d4a',
  brick: '#b0442d',
  hatch: '#5e1f12',
};
const landTones = ['#ece6d6', '#e8e1d0', '#efeadc', '#e5dfcd'];

const status: ExpressionSpecification = ['to-string', ['feature-state', 'status']];
const landFill: ExpressionSpecification = ['match', ['get', 'tone'], 1, landTones[1]!, 2, landTones[2]!, 3, landTones[3]!, landTones[0]!];
const fadeState: ExpressionSpecification = ['coalesce', ['feature-state', 'fade'], 0];
const fadingGreen: ExpressionSpecification = ['interpolate', ['linear'], fadeState, 0, colours.green, 1, landFill];
const placeFill: ExpressionSpecification = ['match', status, 'selected', colours.mustard, 'right', fadingGreen, 'wrong', colours.brick, 'reveal', colours.green, landFill];
const statusBorderWidth: ExpressionSpecification = ['match', status, 'selected', 1, 'right', ['*', 0.9, ['-', 1, fadeState]], 'wrong', 0.9, 'reveal', 1.2, 0];
const isPlace: FilterSpecification = ['!', ['has', 'unclaimed']];

// MapLibre only allows ['zoom'] as the input of a top-level interpolate, so the per-place cut-off sits inside each stop.
const speckOpacity = ['interpolate', ['linear'], ['zoom'],
  ...Array.from({ length: highestSpeckZoom + 1 }, (_, stop) => [stop, ['max', 0, ['min', 1, ['-', ['get', 'speckZoom'], stop]]]]).flat(),
] as ExpressionSpecification;

const toneOf = (placeId: string) => [...placeId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % landTones.length;

const fetchJson = async (url: string) => (await fetch(url)).json();

const loadTierMap = async (shownTier: Tier) => {
  const [places, points]: [PlaceCollection, SpeckCollection] = await Promise.all([
    fetchJson(`/data/map-${shownTier}.geojson`),
    fetchJson('/data/points.geojson'),
  ]);
  const tierPlaceIds = new Set(places.features.filter(({ properties }) => !properties.unclaimed).map(({ properties }) => properties.id));
  const specks: SpeckCollection = { ...points, features: points.features.filter(({ properties }) => tierPlaceIds.has(properties.id)) };
  for (const { properties } of [...places.features, ...specks.features]) properties.tone = toneOf(properties.id);
  return { places, specks };
};

const styleFor = ({ places, specks }: Awaited<ReturnType<typeof loadTierMap>>): StyleSpecification => ({
  version: 8,
  sources: {
    places: { type: 'geojson', data: places, promoteId: 'id' },
    specks: { type: 'geojson', data: specks, promoteId: 'id' },
  },
  layers: [
    { id: 'water', type: 'background', paint: { 'background-color': colours.water } },
    { id: 'place-fill', type: 'fill', source: 'places', paint: { 'fill-color': placeFill } },
    { id: 'place-hatch', type: 'fill', source: 'places', paint: { 'fill-pattern': hatchName, 'fill-opacity': ['case', ['==', status, 'wrong'], 1, 0] } },
    { id: 'place-border', type: 'line', source: 'places', paint: { 'line-color': colours.border, 'line-width': 0.6 } },
    { id: 'place-status-border', type: 'line', source: 'places', paint: { 'line-color': colours.ink, 'line-width': statusBorderWidth } },
    {
      id: 'speck',
      type: 'circle',
      source: 'specks',
      paint: {
        'circle-radius': 1,
        'circle-color': placeFill,
        'circle-opacity': speckOpacity,
        'circle-stroke-width': 0.5,
        'circle-stroke-color': colours.border,
        'circle-stroke-opacity': speckOpacity,
      },
    },
  ],
});

const hatchImage = (pixelRatio: number) => {
  const size = 4 * pixelRatio;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.strokeStyle = colours.hatch;
  context.lineWidth = pixelRatio;
  context.lineCap = 'square';
  // Neighbouring copies of the stripe keep the tile seamless.
  for (const offset of [-size, 0, size]) {
    context.beginPath();
    context.moveTo(offset - size, size * 2);
    context.lineTo(offset + size * 2, -size);
    context.stroke();
  }
  return context.getImageData(0, 0, size, size);
};

const mapContainer = useTemplateRef<HTMLDivElement>('mapContainer');
let map: MapLibreMap | undefined;
let loadedPlaces: PlaceCollection | undefined;

const pickPlaceId = (point: MapMouseEvent['point']) => {
  if (!map) return undefined;
  const query = { layers: ['place-fill'], filter: isPlace };
  const tapBox: [PointLike, PointLike] = [[point.x - tapBoxPx, point.y - tapBoxPx], [point.x + tapBoxPx, point.y + tapBoxPx]];
  const picked = map.queryRenderedFeatures(point, query)[0] ?? map.queryRenderedFeatures(tapBox, query)[0];
  return picked?.properties.id as string | undefined;
};

const handleClick = (event: MapMouseEvent) => {
  emit('tap', pickPlaceId(event.point));
};

const setPlaceStatus = (placeId: string, placeStatus: PlaceStatus | null) => {
  for (const source of placeSources) map?.setFeatureState({ source, id: placeId }, { status: placeStatus });
};

const boundsOf = (placeId: string) => {
  const feature = loadedPlaces?.features.find(({ properties }) => properties.id === placeId);
  if (!feature) return undefined;
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  // The largest piece only, so places crossing the antimeridian or owning far islands still frame their main land.
  return polygons.map((polygon) => {
    const longitudes = polygon[0]!.map(([longitude]) => longitude!);
    const latitudes = polygon[0]!.map(([, latitude]) => latitude!);
    return [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]] as [[number, number], [number, number]];
  }).sort(([[west1, south1], [east1, north1]], [[west2, south2], [east2, north2]]) => (east2 - west2) * (north2 - south2) - (east1 - west1) * (north1 - south1))[0];
};

const flyTo = (placeId: string) => {
  const bounds = boundsOf(placeId);
  if (!map || !bounds) return;
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : flightMs;
  map.fitBounds(bounds, { duration, maxZoom: flightMaxZoom, padding: flightPadding });
};

watch(() => props.verdict, (verdict, previousVerdict) => {
  if (previousVerdict) for (const placeId of [previousVerdict.placeId, previousVerdict.tappedPlaceId]) setPlaceStatus(placeId, null);
  if (!verdict) return;
  if (verdict.outcome === 'right') {
    setPlaceStatus(verdict.placeId, 'right');
    return;
  }
  setPlaceStatus(verdict.tappedPlaceId, 'wrong');
  setPlaceStatus(verdict.placeId, 'reveal');
  flyTo(verdict.placeId);
});

watch(() => props.fade, (fadeAmount = 0) => {
  const placeId = props.verdict?.placeId;
  if (!placeId) return;
  for (const source of placeSources) map?.setFeatureState({ source, id: placeId }, { fade: fadeAmount });
});

watch(() => props.selectedPlaceId, (selectedPlaceId, previousPlaceId) => {
  if (previousPlaceId) setPlaceStatus(previousPlaceId, null);
  if (selectedPlaceId) setPlaceStatus(selectedPlaceId, 'selected');
});

onMounted(async () => {
  const tierMap = await loadTierMap(tier);
  loadedPlaces = tierMap.places;
  setWorkerUrl(workerUrl);
  map = new MapLibreMap({
    container: mapContainer.value!,
    style: styleFor(tierMap),
    center: [10, 20],
    zoom: 0,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: false,
    locale: { 'Map.Title': t('map.label') },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.on('click', handleClick);
  map.on('styleimagemissing', ({ id }) => {
    if (id === hatchName && !map!.hasImage(id)) map!.addImage(id, hatchImage(window.devicePixelRatio || 1), { pixelRatio: window.devicePixelRatio || 1 });
  });
  map.once('idle', () => emit('drawn'));
});

onBeforeUnmount(() => map?.remove());

defineExpose({ focus: () => map?.getCanvas().focus() });
</script>

<template>
  <div
    ref="mapContainer"
    class="world-map"
  />
</template>

<style scoped lang="scss">
.world-map {
  position: absolute;
  inset: 0;

  :deep(.maplibregl-canvas):focus-visible {
    outline: none;
    box-shadow: none;
  }

  /* The canvas paints over its own outline, so the ring sits on an overlay inside the map's edge. */
  &:has(.maplibregl-canvas:focus-visible)::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 0 2px $color-paper, inset 0 0 0 4px $color-ink, inset 0 0 0 6px $color-paper;
  }
}
</style>
