<script setup lang="ts">
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, MapMouseEvent, PointLike, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

type Tier = 'sovereign' | 'defacto' | 'dependencies';
type RegionChoice = 'world' | 'Africa' | 'Asia' | 'Europe' | 'North America' | 'South America' | 'Oceania';
type PlaceStatus = 'selected' | 'right' | 'wrong' | 'reveal' | 'missed';

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

type Verdict
  = | { placeId: string, tappedPlaceId: string, outcome: 'right' | 'wrong' }
    | { placeId: string, outcome: 'missed' };

interface ResultPlace {
  placeId: string
  outcome: 'right' | 'wrong' | 'missed'
}

const props = withDefaults(defineProps<{
  selectedPlaceId?: string | null
  verdict?: Verdict | null
  resultPlaces?: ResultPlace[] | null
  fade?: number
  tier?: Tier
  poolPlaceIds?: string[] | null
  frameRegion?: RegionChoice | null
  frameInset?: number
  isRoundPlay?: boolean
  foundPlaceIds?: string[]
  highlightedPlaceId?: string | null
  keyboardInset?: number
}>(), { selectedPlaceId: null, verdict: null, resultPlaces: null, fade: 0, tier: 'sovereign', poolPlaceIds: null, frameRegion: null, frameInset: 0, isRoundPlay: false, foundPlaceIds: () => [], highlightedPlaceId: null, keyboardInset: 0 });
const emit = defineEmits<{ drawn: [], tap: [placeId?: string], announce: [text: string] }>();

const { t, locale } = useI18n();

const placeSources = ['places', 'specks'] as const;
const tapBoxPx = 8;
const flightMs = 800;
const flightMaxZoom = 4;
const flightPadding = { top: 230, bottom: 60, left: 40, right: 40 };
const minimumFlightFramePx = 120;
const keyboardGapPx = 16;
const minZoom = -1;
const maxZoom = 10;
const cursorFollowMarginPx = 40;
const cursorMinStepPx = 2;
const cursorAcrossWeight = 2.5;
const cursorSpeckRadius = 3;
const arrowDirections: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const hatchName = 'hatch-wrong';
const missedHatchName = 'hatch-missed';
const highestSpeckZoom = 8;
const regionFrames: Record<RegionChoice, [[number, number], [number, number]]> = {
  'world': [[-170, -58], [190, 78]],
  'Africa': [[-20, -36], [52, 38]],
  'Asia': [[25, -11], [150, 78]],
  'Europe': [[-25, 34], [45, 72]],
  'North America': [[-170, 7], [-50, 72]],
  'South America': [[-82, -56], [-34, 13]],
  'Oceania': [[112, -48], [190, 12]],
};
const regionFramePadding = { top: 20, left: 20, right: 20 };
const dimmedNone: FilterSpecification = ['==', ['get', 'id'], ''];

const colours = {
  water: '#cddbe2',
  border: '#a29a86',
  ink: '#141414',
  mustard: '#f2c14e',
  green: '#2f7d4a',
  brick: '#b0442d',
  hatch: '#5e1f12',
  sand: '#d6cdbd',
};
const landTones = ['#ece6d6', '#e8e1d0', '#efeadc', '#e5dfcd'];

const status: ExpressionSpecification = ['to-string', ['feature-state', 'status']];
const isCursor: ExpressionSpecification = ['boolean', ['feature-state', 'cursor'], false];
const landFill: ExpressionSpecification = ['match', ['get', 'tone'], 1, landTones[1]!, 2, landTones[2]!, 3, landTones[3]!, landTones[0]!];
const fadeState: ExpressionSpecification = ['coalesce', ['feature-state', 'fade'], 0];
const fadingGreen: ExpressionSpecification = ['interpolate', ['linear'], fadeState, 0, colours.green, 1, landFill];
const placeFill: ExpressionSpecification = ['case', isCursor, colours.mustard, ['match', status, 'selected', colours.mustard, 'right', fadingGreen, 'wrong', colours.brick, 'reveal', colours.green, 'missed', colours.sand, landFill]];
const statusBorderWidth: ExpressionSpecification = ['case', isCursor, 2, ['match', status, 'selected', 1, 'right', ['*', 0.9, ['-', 1, fadeState]], 'wrong', 0.9, 'reveal', 1.2, 'missed', 0.9, 0]];
const isPlace: FilterSpecification = ['!', ['has', 'unclaimed']];
const isSpeckMarked: ExpressionSpecification = ['any', isCursor, ['==', status, 'selected']];

// MapLibre only allows ['zoom'] as the input of a top-level interpolate, so the per-place cut-off sits inside each stop.
const speckOpacityWithin = (extraZoom: number) => ['interpolate', ['linear'], ['zoom'],
  ...Array.from({ length: highestSpeckZoom + extraZoom + 1 }, (_, stop) => [stop, ['max', 0, ['min', 1, ['-', ['+', ['get', 'speckZoom'], extraZoom], stop]]]]).flat(),
] as ExpressionSpecification;
const speckOpacity = speckOpacityWithin(0);
const highlightSpeckExtraZoom = 3;

const dimColour = colours.water;
const dimmedFilterFor = (poolPlaceIds: string[] | null | undefined): FilterSpecification => poolPlaceIds
  ? ['all', isPlace, ['!', ['in', ['get', 'id'], ['literal', poolPlaceIds]]]]
  : dimmedNone;

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
    { id: 'place-hatch-missed', type: 'fill', source: 'places', paint: { 'fill-pattern': missedHatchName, 'fill-opacity': ['case', ['==', status, 'missed'], 1, 0] } },
    { id: 'place-dim', type: 'fill', source: 'places', filter: dimmedFilterFor(props.poolPlaceIds), paint: { 'fill-color': dimColour, 'fill-opacity': 0.7 } },
    { id: 'place-border', type: 'line', source: 'places', paint: { 'line-color': colours.border, 'line-width': 0.6 } },
    { id: 'place-status-border', type: 'line', source: 'places', paint: { 'line-color': colours.ink, 'line-width': statusBorderWidth } },
    {
      id: 'speck',
      type: 'circle',
      source: 'specks',
      paint: {
        'circle-radius': ['case', isSpeckMarked, cursorSpeckRadius, 1],
        'circle-color': placeFill,
        'circle-opacity': speckOpacity,
        'circle-stroke-width': ['case', isCursor, 2, isSpeckMarked, 1, 0.5],
        'circle-stroke-color': ['case', isSpeckMarked, colours.ink, colours.border],
        'circle-stroke-opacity': speckOpacity,
      },
    },
    {
      id: 'speck-highlight',
      type: 'circle',
      source: 'specks',
      filter: dimmedNone,
      paint: {
        'circle-radius': cursorSpeckRadius,
        'circle-color': colours.mustard,
        'circle-opacity': speckOpacityWithin(highlightSpeckExtraZoom),
        'circle-stroke-width': 1,
        'circle-stroke-color': colours.ink,
        'circle-stroke-opacity': speckOpacityWithin(highlightSpeckExtraZoom),
      },
    },
    {
      id: 'speck-dim',
      type: 'circle',
      source: 'specks',
      filter: dimmedFilterFor(props.poolPlaceIds),
      paint: { 'circle-radius': 1.5, 'circle-color': dimColour, 'circle-opacity': 0.7 },
    },
  ],
});

const hatchImage = (pixelRatio: number, stripeColour: string) => {
  const size = 4 * pixelRatio;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.strokeStyle = stripeColour;
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
let loadedSpecks: SpeckCollection | undefined;
let labelPoints = new Map<string, [number, number]>();
const isAtMinZoom = ref(false);
const isAtMaxZoom = ref(false);
let cursorPlaceId: string | null = null;
let lastSelectedPlaceId: string | null = null;

const pickPlaceId = (point: MapMouseEvent['point']) => {
  if (!map) return undefined;
  const query = { layers: ['place-fill'], filter: isPlace };
  const tapBox: [PointLike, PointLike] = [[point.x - tapBoxPx, point.y - tapBoxPx], [point.x + tapBoxPx, point.y + tapBoxPx]];
  const picked = map.queryRenderedFeatures(point, query)[0] ?? map.queryRenderedFeatures(tapBox, query)[0];
  return picked?.properties.id as string | undefined;
};

const labelPointsOf = (specks: SpeckCollection) => new Map(specks.features.map(({ properties, geometry }) => [properties.id, geometry.coordinates as [number, number]]));

const loadedTierMaps = new Map<Tier, ReturnType<typeof loadTierMap>>();
const tierMapOf = (shownTier: Tier) => {
  if (!loadedTierMaps.has(shownTier)) loadedTierMaps.set(shownTier, loadTierMap(shownTier));
  return loadedTierMaps.get(shownTier)!;
};
let shownTier: Tier | undefined;

const swapTierMap = async (nextTier: Tier) => {
  const tierMap = await tierMapOf(nextTier);
  if (!map || nextTier !== props.tier) return;
  loadedPlaces = tierMap.places;
  loadedSpecks = tierMap.specks;
  labelPoints = labelPointsOf(tierMap.specks);
  shownTier = nextTier;
  (map.getSource('places') as GeoJSONSource).setData(tierMap.places);
  (map.getSource('specks') as GeoJSONSource).setData(tierMap.specks);
};

const handleClick = (event: MapMouseEvent) => {
  emit('tap', pickPlaceId(event.point));
};

const setPlaceStatus = (placeId: string, placeStatus: PlaceStatus | null) => {
  for (const source of placeSources) map?.setFeatureState({ source, id: placeId }, { status: placeStatus });
};

const boundsOf = (placeId: string) => {
  const feature = loadedPlaces?.features.find(({ properties }) => properties.id === placeId);
  if (!feature) {
    const [longitude, latitude] = loadedSpecks?.features.find(({ properties }) => properties.id === placeId)?.geometry.coordinates ?? [];
    return longitude === undefined || latitude === undefined ? undefined : [[longitude, latitude], [longitude, latitude]] as [[number, number], [number, number]];
  }
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
  const bottom = Math.max(flightPadding.bottom, props.keyboardInset + keyboardGapPx);
  const top = Math.max(0, Math.min(flightPadding.top, map.getContainer().clientHeight - bottom - minimumFlightFramePx));
  map.fitBounds(bounds, { duration, maxZoom: flightMaxZoom, padding: { ...flightPadding, top, bottom } });
};

watch(() => props.verdict, (verdict, previousVerdict) => {
  if (previousVerdict) setPlaceStatus(previousVerdict.placeId, null);
  if (previousVerdict && 'tappedPlaceId' in previousVerdict) setPlaceStatus(previousVerdict.tappedPlaceId, null);
  if (!verdict) return;
  if (verdict.outcome === 'right') {
    setPlaceStatus(verdict.placeId, 'right');
    return;
  }
  if (verdict.outcome === 'wrong') setPlaceStatus(verdict.tappedPlaceId, 'wrong');
  setPlaceStatus(verdict.placeId, 'reveal');
  flyTo(verdict.placeId);
});

// After the verdict and results watchers, so a place they just cleared or coloured is not overwritten.
const applyHighlight = (placeId: string | null | undefined, previousPlaceId?: string | null) => {
  if (previousPlaceId && map?.getFeatureState({ source: 'places', id: previousPlaceId }).status === 'selected') setPlaceStatus(previousPlaceId, null);
  if (placeId) setPlaceStatus(placeId, 'selected');
  map?.setFilter('speck-highlight', placeId ? ['==', ['get', 'id'], placeId] : dimmedNone);
};

watch(() => props.highlightedPlaceId, applyHighlight, { flush: 'post' });

watch([() => props.highlightedPlaceId, () => props.keyboardInset], ([placeId]) => {
  if (placeId) flyTo(placeId);
}, { flush: 'post' });

watch(() => props.resultPlaces, (resultPlaces, previousResultPlaces) => {
  for (const { placeId } of previousResultPlaces ?? []) setPlaceStatus(placeId, null);
  for (const { placeId, outcome } of resultPlaces ?? []) setPlaceStatus(placeId, outcome);
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

const flyToRegion = () => {
  if (!map || !props.frameRegion) return;
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : flightMs;
  const resultBounds = props.resultPlaces?.map(({ placeId }) => boundsOf(placeId)).filter(bounds => !!bounds);
  if (resultBounds?.length) {
    const west = Math.min(...resultBounds.map(([[placeWest]]) => placeWest));
    const south = Math.min(...resultBounds.map(([[, placeSouth]]) => placeSouth));
    const east = Math.max(...resultBounds.map(([, [placeEast]]) => placeEast));
    const north = Math.max(...resultBounds.map(([, [, placeNorth]]) => placeNorth));
    map.fitBounds([[west, south], [east, north]], { duration, maxZoom: flightMaxZoom, padding: { ...regionFramePadding, top: 60, bottom: props.frameInset } });
    return;
  }
  map.fitBounds(regionFrames[props.frameRegion], { duration, padding: { ...regionFramePadding, bottom: props.frameInset } });
};

const dimOutsidePool = () => {
  if (!map) return;
  for (const layer of ['place-dim', 'speck-dim']) map.setFilter(layer, dimmedFilterFor(props.poolPlaceIds));
};

const reducedMotionDuration = (duration: number) => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration;

const setCursorState = (placeId: string, isOn: boolean) => {
  for (const source of placeSources) map?.setFeatureState({ source, id: placeId }, { cursor: isOn });
};

const clearCursor = () => {
  if (cursorPlaceId) setCursorState(cursorPlaceId, false);
  cursorPlaceId = null;
};

const followCursor = (placeId: string) => {
  const lngLat = labelPoints.get(placeId);
  if (!map || !lngLat) return;
  const { x, y } = map.project(lngLat);
  const { clientWidth, clientHeight } = map.getContainer();
  const top = Math.min(flightPadding.top, clientHeight / 2.5);
  const bottom = Math.min(flightPadding.bottom, clientHeight / 8);
  const isInView = x >= cursorFollowMarginPx && x <= clientWidth - cursorFollowMarginPx
    && y >= top + cursorFollowMarginPx && y <= clientHeight - bottom - cursorFollowMarginPx;
  if (!isInView) map.easeTo({ center: map.unproject([x, y - (top - bottom) / 2]), duration: reducedMotionDuration(300) });
};

const placeCursor = (placeId: string, shouldAnnounce: boolean) => {
  clearCursor();
  cursorPlaceId = placeId;
  setCursorState(placeId, true);
  followCursor(placeId);
  if (shouldAnnounce) emit('announce', props.foundPlaceIds.includes(placeId) ? t('live.placeFound') : t('live.place'));
};

const startingPlaceId = () => {
  if (lastSelectedPlaceId && labelPoints.has(lastSelectedPlaceId)) return lastSelectedPlaceId;
  const [[west, south], [east, north]] = regionFrames[props.frameRegion ?? 'world'];
  const [centreLongitude, centreLatitude] = [(west + east) / 2, (south + north) / 2];
  let nearest: string | null = null;
  let nearestDistance = Infinity;
  for (const [placeId, [longitude, latitude]] of labelPoints) {
    const distance = (longitude - centreLongitude) ** 2 + (latitude - centreLatitude) ** 2;
    if (distance < nearestDistance) [nearest, nearestDistance] = [placeId, distance];
  }
  return nearest;
};

const neighbourInDirection = ([directionX, directionY]: [number, number]) => {
  const origin = cursorPlaceId && labelPoints.get(cursorPlaceId);
  if (!map || !origin) return null;
  const from = map.project(origin);
  let nearest: string | null = null;
  let nearestScore = Infinity;
  for (const [placeId, lngLat] of labelPoints) {
    if (placeId === cursorPlaceId) continue;
    const to = map.project(lngLat);
    const [deltaX, deltaY] = [to.x - from.x, to.y - from.y];
    const along = deltaX * directionX + deltaY * directionY;
    if (along <= cursorMinStepPx) continue;
    const score = along + cursorAcrossWeight * Math.abs(deltaX * directionY - deltaY * directionX);
    if (score < nearestScore) [nearest, nearestScore] = [placeId, score];
  }
  return nearest;
};

const zoomBy = (step: number) => {
  if (!map) return;
  const zoom = Math.min(maxZoom, Math.max(minZoom, map.getZoom() + step));
  map.easeTo({ zoom, duration: reducedMotionDuration(250) });
};

const handleKeydown = (event: KeyboardEvent) => {
  if (!props.isRoundPlay || event.altKey || event.ctrlKey || event.metaKey) return;
  const direction = arrowDirections[event.key];
  if (direction) {
    event.preventDefault();
    const target = cursorPlaceId ? neighbourInDirection(direction) : startingPlaceId();
    if (target) placeCursor(target, true);
  }
  else if (event.key === '+' || event.key === '=' || event.key === '-') {
    event.preventDefault();
    zoomBy(event.key === '-' ? -1 : 1);
  }
  else if ((event.key === 'Enter' || event.key === ' ') && cursorPlaceId) {
    event.preventDefault();
    if (props.verdict) return;
    lastSelectedPlaceId = cursorPlaceId;
    emit('announce', t('live.selected'));
    emit('tap', cursorPlaceId);
  }
};

const handleFocus = () => {
  if (!props.isRoundPlay || cursorPlaceId || !map?.getCanvas().matches(':focus-visible')) return;
  const start = startingPlaceId();
  if (start) placeCursor(start, false);
};

const applyRoundPlay = () => {
  if (!map) return;
  const canvas = map.getCanvas();
  if (props.isRoundPlay) {
    map.doubleClickZoom.disable();
    map.keyboard.disable();
    canvas.setAttribute('role', 'application');
    return;
  }
  map.doubleClickZoom.enable();
  map.keyboard.enable();
  canvas.setAttribute('role', 'region');
  clearCursor();
  lastSelectedPlaceId = null;
};

const applyLabel = () => {
  map?.getCanvas().setAttribute('aria-label', props.isRoundPlay ? t('map.playLabel') : t('map.label'));
};

watch(() => props.isRoundPlay, applyRoundPlay);
watch([() => props.isRoundPlay, locale], applyLabel);
watch(() => props.tier, swapTierMap);
watch(() => props.poolPlaceIds, dimOutsidePool);
watch(() => [props.frameRegion, props.frameInset], flyToRegion);

onMounted(async () => {
  const tierMap = await tierMapOf(props.tier);
  loadedPlaces = tierMap.places;
  loadedSpecks = tierMap.specks;
  labelPoints = labelPointsOf(tierMap.specks);
  shownTier = props.tier;
  setWorkerUrl(workerUrl);
  map = new MapLibreMap({
    container: mapContainer.value!,
    style: styleFor(tierMap),
    center: [10, 20],
    zoom: 0,
    ...(props.frameRegion && props.frameRegion !== 'world' && { bounds: regionFrames[props.frameRegion], fitBoundsOptions: { padding: { ...regionFramePadding, bottom: props.frameInset } } }),
    minZoom,
    maxZoom,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: false,
    locale: { 'Map.Title': t('map.label') },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.on('click', handleClick);
  map.on('zoom', () => {
    isAtMinZoom.value = map!.getZoom() <= minZoom + 0.01;
    isAtMaxZoom.value = map!.getZoom() >= maxZoom - 0.01;
  });
  const canvas = map.getCanvas();
  canvas.addEventListener('keydown', handleKeydown);
  canvas.addEventListener('focus', handleFocus);
  canvas.addEventListener('blur', clearCursor);
  applyRoundPlay();
  applyLabel();
  map.setMissingStyleImageResolver((id) => {
    const stripeColour = { [hatchName]: colours.hatch, [missedHatchName]: colours.brick }[id];
    if (stripeColour && !map!.hasImage(id)) map!.addImage(id, hatchImage(window.devicePixelRatio || 1, stripeColour), { pixelRatio: window.devicePixelRatio || 1 });
  });
  map.once('idle', () => emit('drawn'));
  map.once('load', () => {
    applyHighlight(props.highlightedPlaceId);
    if (props.highlightedPlaceId) flyTo(props.highlightedPlaceId);
  });
  if (props.tier !== shownTier) swapTierMap(props.tier);
});

onBeforeUnmount(() => map?.remove());

defineExpose({
  focus: () => map?.getCanvas().focus(),
  getMap: () => map,
  zoomIn: () => zoomBy(1),
  zoomOut: () => zoomBy(-1),
  isAtMinZoom,
  isAtMaxZoom,
});
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
