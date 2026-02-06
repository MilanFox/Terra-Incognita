<template>
  <div class="where-in-the-world-game">
    <div v-if="pending" class="where-in-the-world-game__status">Loading Map Data…</div>

    <div v-else-if="error" class="where-in-the-world-game__status where-in-the-world-game__status--error">
      Error: {{ error.message }}
    </div>

    <ClientOnly v-else>
      <div class="where-in-the-world-game__board">
        <LMap
          ref="map"
          class="where-in-the-world-game__map"
          :zoom="1"
          :min-zoom="1"
          :max-zoom="10"
          :center="[0, 0]"
          :use-global-leaflet="false"
          :max-bounds="[[-90, -180], [90, 180]]"
          :max-bounds-viscosity="1.0"
        >
          <LGeoJson
            v-if="data"
            :geojson="data"
            :options="mapOptions"
            :options-style="styleFunction"
          />
        </LMap>
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { LMap, LGeoJson } from '@vue-leaflet/vue-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature } from 'geojson';

const map = ref();

const { data, pending, error } = useFetch('/api/sovereign-entities', { server: false });

const LAND_NEUTRAL = '#7e9dbc';
const LAND_GREEN = '#9fd38a';
const LAND_RED = '#e07a73';
const LAND_HOVER = '#f6d88c';
const BORDER_COLOR = '#ffffff';

const varyColor = (hex: string, variance = 0.05) => {
  const v = (Math.random() * 2 - 1) * variance;
  const c = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * (1 + v))));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * (1 + v))));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * (1 + v))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

const BASE_STYLE = {
  weight: 0.6,
  color: BORDER_COLOR,
  opacity: 0.9,
  fillOpacity: 1,
};

const styleFunction = () => ({
  ...BASE_STYLE,
  fillColor: varyColor(LAND_NEUTRAL),
  className: 'country-feature',
});

const mapOptions = {
  onEachFeature: (feature: Feature, layer: L.Polygon) => {
    const label = feature.properties?.label?.name_en || feature.properties?.sovereignt;
    layer.bindPopup(`<b>${label}</b>`);

    layer.on('add', () => {
      const el = layer.getElement() as SVGElement | null;
      if (el) {
        el.style.setProperty('--color-hover', `${varyColor(LAND_HOVER)}`);
        el.style.setProperty('--color-red', `${varyColor(LAND_RED)}`);
        el.style.setProperty('--color-green', `${varyColor(LAND_GREEN)}`);
      }
    });
  },
};
</script>

<style scoped lang="scss">
.where-in-the-world-game {
  width: 100%;

  &__status {
    padding: 24px;
    text-align: center;
    font-weight: 600;
    color: #4a6a85;
  }

  &__status--error {
    color: #c0392b;
  }

  &__board {
    min-height: 640px;
    padding: 16px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
    border-radius: 18px;
    display: flex;
    flex-direction: column;
    background-image: url($topology-map), linear-gradient(white 0%, white 100%);
    border: 1px solid $colors-blue-light;
    filter: drop-shadow(0 4px 0 rgba($colors-blue-light, 0.75));
  }

  &__map {
    flex: 1;
    width: 100%;
    border: 1px solid $colors-blue-light;
    border-radius: 14px;
    overflow: hidden;

    background-color: $colors-blue-bg;
    background-image: url('@assets/images/backgrounds/water-texture.webp');
    background-size: cover;
    background-blend-mode: soft-light;

    :deep(.country-feature:hover) {
      fill: var(--color-hover) !important;
      stroke: #ffffff !important;
      stroke-width: 1px !important;
    }

    :deep(.leaflet-control-zoom) {
      border-radius: 12px;
      overflow: hidden;
    }

    :deep(.leaflet-control-zoom a) {
      background: #ffffff;
      color: #4a6a85;
      border: none;

      &:focus-visible {
        outline-color: transparent;
        background: $colors-grey-light;
      }
    }

    :deep(.leaflet-popup-content-wrapper) {
      border-radius: 12px;
      background: #ffffff;
    }

    :deep(.leaflet-popup-tip) {
      background: #ffffff;
    }

    :deep(.leaflet-control-attribution) {
      display: none;
    }

    :deep(.leaflet-popup-content-wrapper) {
      border-radius: 14px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
      font-weight: 600;
    }
  }
}
</style>
