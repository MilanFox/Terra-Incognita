<script setup lang="ts">
import { Map as MapLibreMap, Popup, setWorkerUrl } from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, LngLat, MapMouseEvent, PointLike, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PlaceRatings, Rating } from '#shared/game/stats';
import { boundsAround } from '#shared/utils/boundsAround';
import { useReducedMotion } from '~/composables/useReducedMotion';
import { useSettingsStore } from '~/stores/settings';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

type Tier = 'sovereign' | 'defacto' | 'dependencies';
type RegionChoice = 'world' | 'Africa' | 'Asia' | 'Europe' | 'North America' | 'South America' | 'Oceania';
type PlaceStatus = 'selected' | 'right' | 'wrong' | 'reveal' | 'missed' | 'start' | 'target' | 'named' | 'route' | 'unused';

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
  reveal?: { routePlaceIds: string[], shortestPlaceIds: string[] } | null
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
  isStatsMap?: boolean
  isNamesOnly?: boolean
  foundPlaceIds?: string[]
  highlightedPlaceId?: string | null
  keyboardInset?: number
  placeRatings: PlaceRatings | null
  route?: RouteMarks | null
  landShown?: number
  topInset?: number
  bottomCover?: number
  nameablePlaces?: Record<string, string> | null
}>(), { selectedPlaceId: null, verdict: null, resultPlaces: null, fade: 0, tier: 'sovereign', poolPlaceIds: null, frameRegion: null, frameInset: 0, isRoundPlay: false, isStatsMap: false, isNamesOnly: false, foundPlaceIds: () => [], highlightedPlaceId: null, keyboardInset: 0, route: null, landShown: 1, topInset: 0, bottomCover: 0, nameablePlaces: null });
const emit = defineEmits<{ drawn: [], tap: [placeId?: string], announce: [text: string], cursor: [placeId: string] }>();

const { t, locale } = useI18n();
const settings = useSettingsStore();

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
const highContrastHatchSuffix = '-contrast';
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
const regionFramePadding = { top: 20, bottom: 20, left: 20, right: 20 };
const dimmedNone: FilterSpecification = ['==', ['get', 'id'], ''];

const colours = {
  water: '#cddbe2',
  border: '#a29a86',
  ink: '#141414',
  mustard: '#f2c14e',
  green: '#2f7d4a',
  brick: '#b0442d',
  hatch: '#5e1f12',
  highContrastWater: '#8fa8b5',
  highContrastHatch: '#400200',
  sand: '#d6cdbd',
};
const waterColour = () => settings.isHighContrast ? colours.highContrastWater : colours.water;
const borderColour = () => settings.isHighContrast ? colours.ink : colours.border;
const borderWidth = () => settings.isHighContrast ? 1 : 0.6;
const hatchNameOf = (name: string) => settings.isHighContrast ? name + highContrastHatchSuffix : name;
const landTones = ['#ece6d6', '#e8e1d0', '#efeadc', '#e5dfcd'];
const ratingColours: Record<Rating, string> = { noData: '#fdfcf8', weak: '#a9d4b2', shaky: '#6aa77a', solid: '#2f7d4a' };
const routeColours = {
  start: '#6fa8a1',
  startOutline: '#3f7570',
  target: '#e39a80',
  targetOutline: '#a85a40',
  named: '#cdb27a',
  namedOutline: '#8c7b56',
  route: '#a9c98f',
  routeOutline: '#5f8a4a',
  unused: '#b3ac9f',
};
const routeMaxZoom = 5.5;
const placeNameShownMs = 1800;
const zoomTilesWidthPx = 50;

const channelsOf = (hex: string) => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16));

const mixedColour = (from: string, to: string, amount: number) => {
  if (amount >= 1) return to;
  const [fromChannels, toChannels] = [channelsOf(from), channelsOf(to)];
  return `rgb(${fromChannels.map((channel, index) => Math.round(channel + (toChannels[index]! - channel) * amount)).join(', ')})`;
};

const status: ExpressionSpecification = ['to-string', ['feature-state', 'status']];
const isCursor: ExpressionSpecification = ['boolean', ['feature-state', 'cursor'], false];
const rating: ExpressionSpecification = ['to-string', ['feature-state', 'rating']];
const landFillAt = (landShown: number): ExpressionSpecification => {
  const tones = landTones.map(tone => mixedColour(waterColour(), tone, landShown));
  const toneFill: ExpressionSpecification = ['match', ['get', 'tone'], 1, tones[1]!, 2, tones[2]!, 3, tones[3]!, tones[0]!];
  return ['match', rating, 'noData', ratingColours.noData, 'weak', ratingColours.weak, 'shaky', ratingColours.shaky, 'solid', ratingColours.solid, toneFill];
};
const landFill = landFillAt(1);
const fadeState: ExpressionSpecification = ['coalesce', ['feature-state', 'fade'], 0];
const fadingGreen: ExpressionSpecification = ['interpolate', ['linear'], fadeState, 0, colours.green, 1, landFill];
const placeFillOver = (land: ExpressionSpecification): ExpressionSpecification => ['case', isCursor, colours.mustard, ['match', status, 'selected', colours.mustard, 'right', fadingGreen, 'wrong', colours.brick, 'reveal', colours.green, 'missed', colours.sand, 'start', routeColours.start, 'target', routeColours.target, 'named', routeColours.named, 'route', routeColours.route, 'unused', routeColours.unused, land]];
const outlineOf = (outline: 'startOutline' | 'targetOutline' | 'namedOutline' | 'routeOutline') => settings.isHighContrast ? colours.ink : routeColours[outline];
const statusBorderWidth = (): ExpressionSpecification => ['case', isCursor, 2, ['match', status, 'selected', 1, 'right', ['*', 0.9, ['-', 1, fadeState]], 'wrong', 0.9, 'reveal', 1.2, 'missed', 0.9, 'start', 1.2, 'named', borderWidth(), 'route', 1.2, 'unused', borderWidth(), 0]];
const statusBorderColour = (): ExpressionSpecification => ['match', status, 'start', outlineOf('startOutline'), 'named', outlineOf('namedOutline'), 'route', outlineOf('routeOutline'), 'unused', borderColour(), colours.ink];
const isRouteMark: ExpressionSpecification = ['match', status, ['start', 'target', 'named', 'route', 'unused'], true, false];
const speckStrokeAt = (landShown: number): ExpressionSpecification => ['case', ['any', isCursor, ['==', status, 'selected']], colours.ink, ['match', status, 'start', outlineOf('startOutline'), 'target', outlineOf('targetOutline'), 'named', outlineOf('namedOutline'), 'route', outlineOf('routeOutline'), 'unused', borderColour(), mixedColour(waterColour(), borderColour(), landShown)]];
const targetOutlineFilterFor = (targetId: string | undefined): FilterSpecification => ['==', ['get', 'id'], targetId ?? ''];
const shortestOutlineFilterFor = (placeIds: string[] = []): FilterSpecification => ['in', ['get', 'id'], ['literal', placeIds]];
const isPlace: FilterSpecification = ['!', ['has', 'unclaimed']];
const isSpeckMarked: ExpressionSpecification = ['any', isCursor, ['==', status, 'selected']];

// MapLibre only allows ['zoom'] as the input of a top-level interpolate, so the per-place cut-off sits inside each stop.
const speckOpacityWithin = (extraZoom: number) => ['interpolate', ['linear'], ['zoom'],
  ...Array.from({ length: highestSpeckZoom + extraZoom + 1 }, (_, stop) => [stop, ['max', 0, ['min', 1, ['-', ['+', ['get', 'speckZoom'], extraZoom], stop]]]]).flat(),
] as ExpressionSpecification;
const speckOpacity = speckOpacityWithin(0);
const highlightSpeckExtraZoom = 3;

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

type TierMap = Awaited<ReturnType<typeof loadTierMap>>;

const styleFor = ({ places, specks }: TierMap): StyleSpecification => ({
  version: 8,
  sources: {
    places: { type: 'geojson', data: places, promoteId: 'id' },
    specks: { type: 'geojson', data: specks, promoteId: 'id' },
  },
  layers: [
    { id: 'water', type: 'background', paint: { 'background-color': waterColour() } },
    { id: 'place-fill', type: 'fill', source: 'places', paint: { 'fill-color': placeFillOver(landFillAt(props.landShown)) } },
    { id: 'place-hatch', type: 'fill', source: 'places', paint: { 'fill-pattern': hatchNameOf(hatchName), 'fill-opacity': ['case', ['==', status, 'wrong'], 1, 0] } },
    { id: 'place-hatch-missed', type: 'fill', source: 'places', paint: { 'fill-pattern': missedHatchName, 'fill-opacity': ['case', ['==', status, 'missed'], 1, 0] } },
    { id: 'place-dim', type: 'fill', source: 'places', filter: dimmedFilterFor(props.poolPlaceIds), paint: { 'fill-color': waterColour(), 'fill-opacity': 0.7 } },
    { id: 'place-border', type: 'line', source: 'places', paint: { 'line-color': mixedColour(waterColour(), borderColour(), props.landShown), 'line-width': borderWidth() } },
    { id: 'place-status-border', type: 'line', source: 'places', paint: { 'line-color': statusBorderColour(), 'line-width': statusBorderWidth() } },
    { id: 'place-shortest-outline', type: 'line', source: 'places', filter: shortestOutlineFilterFor(props.route?.reveal?.shortestPlaceIds), layout: { 'line-join': 'round' }, paint: { 'line-color': colours.ink, 'line-width': 1.8, 'line-dasharray': [2, 1.5] } },
    { id: 'place-target-outline', type: 'line', source: 'places', filter: targetOutlineFilterFor(props.route?.targetId), layout: { 'line-join': 'round' }, paint: { 'line-color': outlineOf('targetOutline'), 'line-width': 2.6, 'line-dasharray': [2, 1.2] } },
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
      paint: { 'circle-radius': 1.5, 'circle-color': waterColour(), 'circle-opacity': 0.7 },
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
let framedRegion: RegionChoice | null = null;

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
let shownTierMap: TierMap | undefined;
let drawnOutsideTier: string | null = null;

const placeIdsOutsideTier = () => {
  const tierPlaceIds = new Set(shownTierMap?.places.features.map(({ properties }) => properties.id));
  return routePlaceIdsOf(props.route).filter(placeId => !tierPlaceIds.has(placeId));
};

// A named place outside the tier has no shape of its own there, so it is drawn on top from the dependencies-tier map.
const drawMapData = async () => {
  const outsideIds = placeIdsOutsideTier();
  const outsideMap = outsideIds.length > 0 ? await tierMapOf('dependencies') : undefined;
  const tierMap = shownTierMap;
  if (!map || !hasLoaded || !tierMap || placeIdsOutsideTier().join() !== outsideIds.join() || drawnOutsideTier === outsideIds.join()) return;
  const isOutside = ({ properties }: { properties: { id: string } }) => outsideIds.includes(properties.id);
  loadedPlaces = { ...tierMap.places, features: [...tierMap.places.features, ...(outsideMap?.places.features.filter(isOutside) ?? [])] };
  loadedSpecks = { ...tierMap.specks, features: [...tierMap.specks.features, ...(outsideMap?.specks.features.filter(isOutside) ?? [])] };
  labelPoints = labelPointsOf(loadedSpecks);
  drawnOutsideTier = outsideIds.join();
  (map.getSource('places') as GeoJSONSource).setData(loadedPlaces);
  (map.getSource('specks') as GeoJSONSource).setData(loadedSpecks);
  if (outsideIds.length > 0) fitRoute();
};

const swapTierMap = async (nextTier: Tier) => {
  const tierMap = await tierMapOf(nextTier);
  if (!map || nextTier !== props.tier) return;
  shownTier = nextTier;
  shownTierMap = tierMap;
  drawnOutsideTier = null;
  await drawMapData();
};

let placeNamePopup: Popup | undefined;
let placeNameTimer: ReturnType<typeof setTimeout> | undefined;
const canHover = useMediaQuery('(hover: hover)');
const isMotionReduced = useReducedMotion();

const hidePlaceName = () => {
  clearTimeout(placeNameTimer);
  placeNamePopup?.remove();
};

const showPlaceName = (placeId: string | undefined, lngLat: LngLat, shownMs?: number) => {
  const name = placeId ? props.nameablePlaces?.[placeId] : undefined;
  if (!map || !name) {
    hidePlaceName();
    return;
  }
  clearTimeout(placeNameTimer);
  placeNamePopup ??= new Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false, anchor: 'bottom', offset: 10, maxWidth: 'none', className: 'world-map__place-name' });
  placeNamePopup.setLngLat(lngLat).setText(name);
  if (!placeNamePopup.isOpen()) placeNamePopup.addTo(map);
  placeNamePopup.getElement()?.setAttribute('aria-hidden', 'true');
  if (shownMs) placeNameTimer = setTimeout(hidePlaceName, shownMs);
};

const handleClick = (event: MapMouseEvent) => {
  const placeId = pickPlaceId(event.point);
  if (props.isStatsMap && placeId) lastSelectedPlaceId = placeId;
  if (props.nameablePlaces) showPlaceName(placeId, event.lngLat, placeNameShownMs);
  emit('tap', placeId);
};

const handlePointerMove = (event: MapMouseEvent) => {
  if (props.nameablePlaces && canHover.value) showPlaceName(pickPlaceId(event.point), event.lngLat);
};

const setPlaceStatus = (placeId: string, placeStatus: PlaceStatus | null) => {
  if (!hasLoaded) return;
  for (const source of placeSources) map?.setFeatureState({ source, id: placeId }, { status: placeStatus });
};

const boundsOf = (placeId: string) => {
  const feature = loadedPlaces?.features.find(({ properties }) => properties.id === placeId);
  if (!feature) {
    const [longitude, latitude] = loadedSpecks?.features.find(({ properties }) => properties.id === placeId)?.geometry.coordinates ?? [];
    return longitude === undefined || latitude === undefined ? undefined : [[longitude, latitude], [longitude, latitude]] as [[number, number], [number, number]];
  }
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const [labelLongitude, labelLatitude] = labelPoints.get(placeId) ?? [];
  // The piece under the label point, else the largest, so places crossing the antimeridian or owning far islands (Denmark's Greenland) still frame their main land.
  const holdsLabel = ([[west, south], [east, north]]: [[number, number], [number, number]]) => labelLongitude! >= west && labelLongitude! <= east && labelLatitude! >= south && labelLatitude! <= north;
  const pieces = polygons.map((polygon) => {
    const longitudes = polygon[0]!.map(([longitude]) => longitude!);
    const latitudes = polygon[0]!.map(([, latitude]) => latitude!);
    return [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]] as [[number, number], [number, number]];
  });
  const labelledPiece = pieces.find(holdsLabel);
  return labelledPiece ?? pieces.sort(([[west1, south1], [east1, north1]], [[west2, south2], [east2, north2]]) => (east2 - west2) * (north2 - south2) - (east1 - west1) * (north1 - south1))[0];
};

const flyTo = (placeId: string) => {
  const bounds = boundsOf(placeId);
  if (!map || !bounds) return;
  const bottom = Math.max(flightPadding.bottom, props.keyboardInset + keyboardGapPx);
  const top = Math.max(0, Math.min(flightPadding.top, map.getContainer().clientHeight - bottom - minimumFlightFramePx));
  map.fitBounds(bounds, { ...cameraMotion(flightMs), maxZoom: flightMaxZoom, padding: { ...flightPadding, top, bottom } });
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
  if (!hasLoaded) return;
  if (previousPlaceId && map?.getFeatureState({ source: 'places', id: previousPlaceId }).status === 'selected') setPlaceStatus(previousPlaceId, null);
  if (placeId) setPlaceStatus(placeId, 'selected');
  map?.setFilter('speck-highlight', placeId ? ['==', ['get', 'id'], placeId] : dimmedNone);
};

watch(() => props.highlightedPlaceId, applyHighlight, { flush: 'post' });

watch([() => props.highlightedPlaceId, () => props.keyboardInset], ([placeId]) => {
  if (placeId) flyTo(placeId);
}, { flush: 'post' });

watch(() => props.resultPlaces, (resultPlaces, previousResultPlaces) => {
  if (props.keyboardInset > 0) for (const { placeId } of resultPlaces ?? []) if (!previousResultPlaces?.some(previous => previous.placeId === placeId)) bringIntoView(placeId);
  for (const { placeId } of previousResultPlaces ?? []) setPlaceStatus(placeId, null);
  for (const { placeId, outcome } of resultPlaces ?? []) setPlaceStatus(placeId, outcome);
});

const applyRatings = (placeRatings: PlaceRatings | null, previousRatings?: PlaceRatings | null) => {
  if (!hasLoaded) return;
  for (const placeId of Object.keys(previousRatings ?? {})) {
    for (const source of placeSources) map?.removeFeatureState({ source, id: placeId }, 'rating');
  }
  for (const [placeId, placeRating] of Object.entries(placeRatings ?? {})) {
    for (const source of placeSources) map?.setFeatureState({ source, id: placeId }, { rating: placeRating });
  }
};

watch(() => props.placeRatings, applyRatings);

watch(() => props.fade, (fadeAmount = 0) => {
  const placeId = props.verdict?.placeId;
  if (!placeId) return;
  for (const source of placeSources) map?.setFeatureState({ source, id: placeId }, { fade: fadeAmount });
});

// After the verdict and results watchers, so a confirmed two-step mark keeps the colour its answer gave it.
watch(() => props.selectedPlaceId, (selectedPlaceId, previousPlaceId) => {
  if (previousPlaceId && hasLoaded && map?.getFeatureState({ source: 'places', id: previousPlaceId }).status === 'selected') setPlaceStatus(previousPlaceId, null);
  if (selectedPlaceId) setPlaceStatus(selectedPlaceId, 'selected');
}, { flush: 'post' });

// fitBounds can't frame above a tray taller than the free map: the centre it needs falls off the map and nothing moves. The tray goes into the map's own padding instead, without a visible jump.
const padAboveTray = (shownMap: MapLibreMap) => {
  const { clientWidth, clientHeight } = shownMap.getContainer();
  shownMap.jumpTo({ center: shownMap.unproject([clientWidth / 2, (clientHeight - props.frameInset) / 2]), padding: { top: 0, right: 0, bottom: props.frameInset, left: 0 } });
};

const flyToRegion = (region = props.frameRegion) => {
  if (!map || !region) return;
  framedRegion = region;
  padAboveTray(map);
  const resultBounds = props.resultPlaces?.map(({ placeId }) => boundsOf(placeId)).filter(bounds => !!bounds);
  if (resultBounds?.length) {
    map.fitBounds(boundsAround(resultBounds), { ...cameraMotion(flightMs), maxZoom: flightMaxZoom, padding: { ...regionFramePadding, top: 60 } });
    return;
  }
  map.fitBounds(regionFrames[region], { ...cameraMotion(flightMs), padding: regionFramePadding });
};

const routePlaceIdsOf = (route: RouteMarks | null) => (route ? [route.startId, route.targetId, ...route.namedPlaceIds, ...route.reveal?.shortestPlaceIds ?? []] : []);

const namedStatusOf = (placeId: string, route: RouteMarks): PlaceStatus => {
  if (!route.reveal) return 'named';
  return route.reveal.routePlaceIds.includes(placeId) ? 'route' : 'unused';
};

const routeStatusesOf = (route: RouteMarks | null): [string, PlaceStatus][] => (route
  ? [...route.namedPlaceIds.map((placeId): [string, PlaceStatus] => [placeId, namedStatusOf(placeId, route)]), [route.startId, 'start'], [route.targetId, 'target']]
  : []);

const routeLookOf = (route: RouteMarks | null) => [...routeStatusesOf(route).flat(), ...route?.reveal?.shortestPlaceIds ?? []].join();

const markRoute = (route: RouteMarks | null) => {
  if (!hasLoaded) return;
  for (const [placeId] of routeStatusesOf(markedRoute)) setPlaceStatus(placeId, null);
  for (const [placeId, placeStatus] of routeStatusesOf(route)) setPlaceStatus(placeId, placeStatus);
  map?.setFilter('place-target-outline', targetOutlineFilterFor(route?.targetId));
  map?.setFilter('place-shortest-outline', shortestOutlineFilterFor(route?.reveal?.shortestPlaceIds));
  markedRoute = route;
};

const fitRoute = () => {
  const placeBounds = routePlaceIdsOf(props.route).map(boundsOf).filter(bounds => !!bounds);
  if (!map || placeBounds.length === 0) return;
  const bottom = Math.max(flightPadding.bottom, props.keyboardInset + keyboardGapPx);
  const top = Math.max(0, Math.min(props.topInset + keyboardGapPx, map.getContainer().clientHeight - bottom - minimumFlightFramePx));
  map.fitBounds(boundsAround(placeBounds), { ...cameraMotion(flightMs), maxZoom: routeMaxZoom, padding: { ...flightPadding, top, bottom, right: flightPadding.right + zoomTilesWidthPx } });
};

const showLand = () => {
  if (!map || !hasLoaded) return;
  const placeFillShown = placeFillOver(landFillAt(props.landShown));
  map.setPaintProperty('place-fill', 'fill-color', placeFillShown);
  map.setPaintProperty('speck', 'circle-color', placeFillShown);
  map.setPaintProperty('speck', 'circle-stroke-color', speckStrokeAt(props.landShown));
  map.setPaintProperty('place-border', 'line-color', mixedColour(waterColour(), borderColour(), props.landShown));
  map.setPaintProperty('place-border', 'line-width', borderWidth());
  map.setPaintProperty('water', 'background-color', waterColour());
  map.setPaintProperty('place-dim', 'fill-color', waterColour());
  map.setPaintProperty('speck-dim', 'circle-color', waterColour());
  map.setPaintProperty('place-status-border', 'line-color', statusBorderColour());
  map.setPaintProperty('place-status-border', 'line-width', statusBorderWidth());
  map.setPaintProperty('place-target-outline', 'line-color', outlineOf('targetOutline'));
  map.setPaintProperty('place-hatch', 'fill-pattern', hatchNameOf(hatchName));
};

const dimOutsidePool = () => {
  if (!map || !hasLoaded) return;
  for (const layer of ['place-dim', 'speck-dim']) map.setFilter(layer, dimmedFilterFor(props.poolPlaceIds));
};

// essential: MapLibre would otherwise follow the system's reduced-motion setting and override the player's choice.
const cameraMotion = (durationMs: number) => ({ duration: isMotionReduced.value ? 0 : durationMs, essential: true });

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
  const top = props.isStatsMap ? props.topInset : Math.min(flightPadding.top, clientHeight / 2.5);
  const bottom = props.isStatsMap ? Math.max(map.getPadding().bottom ?? 0, props.bottomCover) : Math.min(flightPadding.bottom, clientHeight / 8);
  const isInView = x >= cursorFollowMarginPx && x <= clientWidth - cursorFollowMarginPx
    && y >= top + cursorFollowMarginPx && y <= clientHeight - bottom - cursorFollowMarginPx;
  if (isInView) return;
  // On stats the tray is the map's own bottom padding, so the camera centre already sits above it.
  map.easeTo(props.isStatsMap
    ? { center: lngLat, offset: [0, (top - bottom + (map.getPadding().bottom ?? 0)) / 2], ...cameraMotion(300) }
    : { center: map.unproject([x, y - (top - bottom) / 2]), ...cameraMotion(300) });
};

const bringIntoView = (placeId: string) => {
  const lngLat = labelPoints.get(placeId);
  if (!map || !lngLat) return;
  const { x, y } = map.project(lngLat);
  const { clientWidth, clientHeight } = map.getContainer();
  const top = Math.min(flightPadding.top, clientHeight / 2.5) + cursorFollowMarginPx;
  const bottom = clientHeight - props.keyboardInset - cursorFollowMarginPx;
  const shiftedX = Math.min(Math.max(x, cursorFollowMarginPx), clientWidth - cursorFollowMarginPx);
  const shiftedY = Math.min(Math.max(y, top), Math.max(top, bottom));
  if (shiftedX === x && shiftedY === y) return;
  map.panBy([x - shiftedX, y - shiftedY], cameraMotion(300));
};

const placeCursor = (placeId: string, shouldAnnounce: boolean) => {
  clearCursor();
  cursorPlaceId = placeId;
  setCursorState(placeId, true);
  followCursor(placeId);
  if (!shouldAnnounce) return;
  if (props.isStatsMap) emit('cursor', placeId);
  else emit('announce', props.foundPlaceIds.includes(placeId) ? t('live.placeFound') : t('live.place'));
};

const startingPlaceId = () => {
  if (lastSelectedPlaceId && labelPoints.has(lastSelectedPlaceId)) return lastSelectedPlaceId;
  const [[west, south], [east, north]] = regionFrames[framedRegion ?? props.frameRegion ?? 'world'];
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
  map.easeTo({ zoom, ...cameraMotion(250) });
};

const isKeyboardPlay = computed(() => props.isRoundPlay || props.isStatsMap);

const handleKeydown = (event: KeyboardEvent) => {
  if (!isKeyboardPlay.value || event.altKey || event.ctrlKey || event.metaKey) return;
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
    if (!props.isStatsMap) emit('announce', t('live.selected'));
    emit('tap', cursorPlaceId);
  }
};

const handleFocus = () => {
  if (!isKeyboardPlay.value || cursorPlaceId || !map?.getCanvas().matches(':focus-visible')) return;
  const start = startingPlaceId();
  if (start) placeCursor(start, false);
};

const applyRoundPlay = () => {
  if (!map) return;
  const canvas = map.getCanvas();
  if (props.isRoundPlay) map.doubleClickZoom.disable();
  else map.doubleClickZoom.enable();
  if (isKeyboardPlay.value) {
    map.keyboard.disable();
    canvas.setAttribute('role', 'application');
    return;
  }
  map.keyboard.enable();
  canvas.setAttribute('role', 'region');
  clearCursor();
  lastSelectedPlaceId = null;
};

const applyLabel = () => {
  map?.getCanvas().setAttribute('aria-label', props.isRoundPlay ? t('map.playLabel') : props.isStatsMap ? t(props.isNamesOnly ? 'map.namesLabel' : 'map.statsLabel') : t('map.label'));
};

watch([() => props.isRoundPlay, () => props.isStatsMap], applyRoundPlay);
watch([() => props.isRoundPlay, () => props.isStatsMap, () => props.isNamesOnly, locale], applyLabel);
watch(() => props.tier, swapTierMap);
watch(() => props.poolPlaceIds, dimOutsidePool);
watch(() => routeLookOf(props.route), () => {
  if (props.route) tierMapOf('dependencies');
  markRoute(props.route);
  drawMapData();
}, { flush: 'post' });
watch(() => Object.keys(props.nameablePlaces ?? {}).join(), hidePlaceName);
watch([() => routePlaceIdsOf(props.route).join(), () => props.keyboardInset, () => props.topInset], fitRoute, { flush: 'post' });
watch([() => props.landShown, () => settings.isHighContrast], showLand);
watch(() => [props.frameRegion, props.frameInset], () => flyToRegion());

onMounted(async () => {
  const tierMap = await tierMapOf(props.tier);
  loadedPlaces = tierMap.places;
  loadedSpecks = tierMap.specks;
  labelPoints = labelPointsOf(tierMap.specks);
  shownTier = props.tier;
  shownTierMap = tierMap;
  drawnOutsideTier = '';
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
  map.on('mousemove', handlePointerMove);
  map.on('mouseout', hidePlaceName);
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
    const stripeColour = { [hatchName]: colours.hatch, [hatchName + highContrastHatchSuffix]: colours.highContrastHatch, [missedHatchName]: colours.brick }[id];
    if (stripeColour && !map!.hasImage(id)) map!.addImage(id, hatchImage(window.devicePixelRatio || 1, stripeColour), { pixelRatio: window.devicePixelRatio || 1 });
  });
  map.once('idle', () => emit('drawn'));
  map.once('load', () => {
    hasLoaded = true;
    showLand();
    for (const { placeId, outcome } of props.resultPlaces ?? []) setPlaceStatus(placeId, outcome);
    applyRatings(props.placeRatings);
    dimOutsidePool();
    applyHighlight(props.highlightedPlaceId);
    if (props.highlightedPlaceId) flyTo(props.highlightedPlaceId);
    markRoute(props.route);
    fitRoute();
    drawMapData();
  });
  if (props.tier !== shownTier) swapTierMap(props.tier);
});

onBeforeUnmount(() => {
  clearTimeout(placeNameTimer);
  map?.remove();
});

defineExpose({
  focus: () => map?.getCanvas().focus(),
  getMap: () => map,
  flyTo,
  flyToRegion,
  reveal: followCursor,
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

  :deep(.world-map__place-name) {
    .maplibregl-popup-tip {
      display: none;
    }

    .maplibregl-popup-content {
      padding: 4px 8px;
      border: 2px solid $color-ink;
      border-radius: 4px;
      background: $color-surface;
      box-shadow: none;
      color: $color-ink;
      font-size: 14px;
      font-weight: 800;
      white-space: nowrap;
      pointer-events: none;
    }
  }

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
