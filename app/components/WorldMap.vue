<script setup lang="ts">
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import type { ExpressionSpecification, FilterSpecification, MapMouseEvent, PointLike, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

type Tier = 'sovereign' | 'defacto' | 'dependencies';
type PlaceStatus = 'selected';

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

const props = defineProps<{ selectedPlaceId?: string | null }>();
const emit = defineEmits<{ drawn: [], tap: [placeId: string] }>();

const { t } = useI18n();

const tier: Tier = 'sovereign';
const placeSources = ['places', 'specks'] as const;
const tapBoxPx = 8;
const highestSpeckZoom = 8;

const colours = {
  water: '#cddbe2',
  border: '#a29a86',
  ink: '#141414',
  mustard: '#f2c14e',
};
const landTones = ['#ece6d6', '#e8e1d0', '#efeadc', '#e5dfcd'];

const status: ExpressionSpecification = ['to-string', ['feature-state', 'status']];
const landFill: ExpressionSpecification = ['match', ['get', 'tone'], 1, landTones[1]!, 2, landTones[2]!, 3, landTones[3]!, landTones[0]!];
const placeFill: ExpressionSpecification = ['match', status, 'selected', colours.mustard, landFill];
const statusBorderWidth: ExpressionSpecification = ['match', status, 'selected', 1, 0];
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

const mapContainer = useTemplateRef<HTMLDivElement>('mapContainer');
let map: MapLibreMap | undefined;

const pickPlaceId = (point: MapMouseEvent['point']) => {
  if (!map) return undefined;
  const query = { layers: ['place-fill'], filter: isPlace };
  const tapBox: [PointLike, PointLike] = [[point.x - tapBoxPx, point.y - tapBoxPx], [point.x + tapBoxPx, point.y + tapBoxPx]];
  const picked = map.queryRenderedFeatures(point, query)[0] ?? map.queryRenderedFeatures(tapBox, query)[0];
  return picked?.properties.id as string | undefined;
};

const handleClick = (event: MapMouseEvent) => {
  const placeId = pickPlaceId(event.point);
  if (placeId) emit('tap', placeId);
};

const setPlaceStatus = (placeId: string, placeStatus: PlaceStatus | null) => {
  for (const source of placeSources) map?.setFeatureState({ source, id: placeId }, { status: placeStatus });
};

watch(() => props.selectedPlaceId, (selectedPlaceId, previousPlaceId) => {
  if (previousPlaceId) setPlaceStatus(previousPlaceId, null);
  if (selectedPlaceId) setPlaceStatus(selectedPlaceId, 'selected');
});

onMounted(async () => {
  const tierMap = await loadTierMap(tier);
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
  map.once('idle', () => emit('drawn'));
});

onBeforeUnmount(() => map?.remove());
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
}
</style>
