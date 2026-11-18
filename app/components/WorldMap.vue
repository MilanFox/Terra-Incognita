<script setup lang="ts">
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, MapMouseEvent, PointLike, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

type Tier = 'sovereign' | 'defacto' | 'dependencies';
type RegionChoice = 'world' | 'Africa' | 'Asia' | 'Europe' | 'North America' | 'South America' | 'Oceania';
type PlaceStatus = 'selected' | 'right' | 'wrong' | 'reveal' | 'missed' | 'start' | 'target' | 'named';

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

interface RouteMarks {
  startId: string
  targetId: string
  namedPlaceIds: string[]
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
  route?: RouteMarks | null
  landShown?: number
  topInset?: number
}>(), { selectedPlaceId: null, verdict: null, resultPlaces: null, fade: 0, tier: 'sovereign', poolPlaceIds: null, frameRegion: null, frameInset: 0, isRoundPlay: false, foundPlaceIds: () => [], highlightedPlaceId: null, keyboardInset: 0, route: null, landShown: 1, topInset: 0 });
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
const routeColours = {
  start: '#6fa8a1',
  startOutline: '#3f7570',
  target: '#e39a80',
  targetOutline: '#a85a40',
  named: '#cdb27a',
  namedOutline: '#8c7b56',
};
const routeMaxZoom = 5.5;
const zoomTilesWidthPx = 50;

const channelsOf = (hex: string) => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16));

const mixedColour = (from: string, to: string, amount: number) => {
  if (amount >= 1) return to;
  const [fromChannels, toChannels] = [channelsOf(from), channelsOf(to)];
  return `rgb(${fromChannels.map((channel, index) => Math.round(channel + (toChannels[index]! - channel) * amount)).join(', ')})`;
};

const status: ExpressionSpecification = ['to-string', ['feature-state', 'status']];
const isCursor: ExpressionSpecification = ['boolean', ['feature-state', 'cursor'], false];
const landFillAt = (landShown: number): ExpressionSpecification => {
  const tones = landTones.map(tone => mixedColour(colours.water, tone, landShown));
  return ['match', ['get', 'tone'], 1, tones[1]!, 2, tones[2]!, 3, tones[3]!, tones[0]!];
};
const landFill = landFillAt(1);
const fadeState: ExpressionSpecification = ['coalesce', ['feature-state', 'fade'], 0];
const fadingGreen: ExpressionSpecification = ['interpolate', ['linear'], fadeState, 0, colours.green, 1, landFill];
const placeFillOver = (land: ExpressionSpecification): ExpressionSpecification => ['case', isCursor, colours.mustard, ['match', status, 'selected', colours.mustard, 'right', fadingGreen, 'wrong', colours.brick, 'reveal', colours.green, 'missed', colours.sand, 'start', routeColours.start, 'target', routeColours.target, 'named', routeColours.named, land]];
const statusBorderWidth: ExpressionSpecification = ['case', isCursor, 2, ['match', status, 'selected', 1, 'right', ['*', 0.9, ['-', 1, fadeState]], 'wrong', 0.9, 'reveal', 1.2, 'missed', 0.9, 'start', 1.2, 'named', 0.6, 0]];
const statusBorderColour: ExpressionSpecification = ['match', status, 'start', routeColours.startOutline, 'named', routeColours.namedOutline, colours.ink];
const isRouteMark: ExpressionSpecification = ['match', status, ['start', 'target', 'named'], true, false];
const speckStrokeAt = (landShown: number): ExpressionSpecification => ['case', ['any', isCursor, ['==', status, 'selected']], colours.ink, ['match', status, 'start', routeColours.startOutline, 'target', routeColours.targetOutline, 'named', routeColours.namedOutline, mixedColour(colours.water, colours.border, landShown)]];
const targetOutlineFilterFor = (targetId: string | undefined): FilterSpecification => ['==', ['get', 'id'], targetId ?? ''];
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

const toneOf = (placeId: string) => [...placeId].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) % 9973 % landTones.length;

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
    { id: 'place-fill', type: 'fill', source: 'places', paint: { 'fill-color': placeFillOver(landFillAt(props.landShown)) } },
    { id: 'place-hatch', type: 'fill', source: 'places', paint: { 'fill-pattern': hatchName, 'fill-opacity': ['case', ['==', status, 'wrong'], 1, 0] } },
    { id: 'place-hatch-missed', type: 'fill', source: 'places', paint: { 'fill-pattern': missedHatchName, 'fill-opacity': ['case', ['==', status, 'missed'], 1, 0] } },
    { id: 'place-dim', type: 'fill', source: 'places', filter: dimmedFilterFor(props.poolPlaceIds), paint: { 'fill-color': dimColour, 'fill-opacity': 0.7 } },
    { id: 'place-border', type: 'line', source: 'places', paint: { 'line-color': mixedColour(colours.water, colours.border, props.landShown), 'line-width': 0.6 } },
    { id: 'place-status-border', type: 'line', source: 'places', paint: { 'line-color': statusBorderColour, 'line-width': statusBorderWidth } },
    { id: 'place-target-outline', type: 'line', source: 'places', filter: targetOutlineFilterFor(props.route?.targetId), layout: { 'line-join': 'round' }, paint: { 'line-color': routeColours.targetOutline, 'line-width': 2.6, 'line-dasharray': [2, 1.2] } },
    {
      id: 'speck',
      type: 'circle',
      source: 'specks',
      paint: {
        'circle-radius': ['case', ['any', isSpeckMarked, isRouteMark], cursorSpeckRadius, 1],
        'circle-color': placeFillOver(landFillAt(props.landShown)),
        'circle-opacity': speckOpacity,
        'circle-stroke-width': ['case', isCursor, 2, isSpeckMarked, 1, ['==', status, 'target'], 2, isRouteMark, 1, 0.5],
        'circle-stroke-color': speckStrokeAt(props.landShown),
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
let markedRoute: RouteMarks | null = null;
let hasLoaded = false;
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

const boundsAround = (placeBounds: [[number, number], [number, number]][]): [[number, number], [number, number]] => [
  [Math.min(...placeBounds.map(([[west]]) => west)), Math.min(...placeBounds.map(([[, south]]) => south))],
  [Math.max(...placeBounds.map(([, [east]]) => east)), Math.max(...placeBounds.map(([, [, north]]) => north))],
];

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
    map.fitBounds(boundsAround(resultBounds), { duration, maxZoom: flightMaxZoom, padding: { ...regionFramePadding, top: 60, bottom: props.frameInset } });
    return;
  }
  map.fitBounds(regionFrames[props.frameRegion], { duration, padding: { ...regionFramePadding, bottom: props.frameInset } });
};

const routePlaceIdsOf = (route: RouteMarks | null) => (route ? [route.startId, route.targetId, ...route.namedPlaceIds] : []);

const routeStatusesOf = (route: RouteMarks | null): [string, PlaceStatus][] => (route
  ? [...route.namedPlaceIds.map((placeId): [string, PlaceStatus] => [placeId, 'named']), [route.startId, 'start'], [route.targetId, 'target']]
  : []);

const markRoute = (route: RouteMarks | null) => {
  if (!hasLoaded) return;
  for (const [placeId] of routeStatusesOf(markedRoute)) setPlaceStatus(placeId, null);
  for (const [placeId, placeStatus] of routeStatusesOf(route)) setPlaceStatus(placeId, placeStatus);
  map?.setFilter('place-target-outline', targetOutlineFilterFor(route?.targetId));
  markedRoute = route;
};

const fitRoute = () => {
  const placeBounds = routePlaceIdsOf(props.route).map(boundsOf).filter(bounds => !!bounds);
  if (!map || placeBounds.length === 0) return;
  const bottom = Math.max(flightPadding.bottom, props.keyboardInset + keyboardGapPx);
  const top = Math.max(0, Math.min(props.topInset + keyboardGapPx, map.getContainer().clientHeight - bottom - minimumFlightFramePx));
  map.fitBounds(boundsAround(placeBounds), { duration: reducedMotionDuration(flightMs), maxZoom: routeMaxZoom, padding: { ...flightPadding, top, bottom, right: flightPadding.right + zoomTilesWidthPx } });
};

const showLand = () => {
  if (!map || !hasLoaded) return;
  const placeFillShown = placeFillOver(landFillAt(props.landShown));
  map.setPaintProperty('place-fill', 'fill-color', placeFillShown);
  map.setPaintProperty('speck', 'circle-color', placeFillShown);
  map.setPaintProperty('speck', 'circle-stroke-color', speckStrokeAt(props.landShown));
  map.setPaintProperty('place-border', 'line-color', mixedColour(colours.water, colours.border, props.landShown));
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
watch(() => routePlaceIdsOf(props.route).join(), () => markRoute(props.route), { flush: 'post' });
watch([() => routePlaceIdsOf(props.route).join(), () => props.keyboardInset, () => props.topInset], fitRoute, { flush: 'post' });
watch(() => props.landShown, showLand);
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
    hasLoaded = true;
    showLand();
    for (const { placeId, outcome } of props.resultPlaces ?? []) setPlaceStatus(placeId, outcome);
    applyHighlight(props.highlightedPlaceId);
    if (props.highlightedPlaceId) flyTo(props.highlightedPlaceId);
    markRoute(props.route);
    fitRoute();
  });
  if (props.tier !== shownTier) swapTierMap(props.tier);
});

onBeforeUnmount(() => map?.remove());

defineExpose({
  focus: () => map?.getCanvas().focus(),
  getMap: () => map,
  flyTo,
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
