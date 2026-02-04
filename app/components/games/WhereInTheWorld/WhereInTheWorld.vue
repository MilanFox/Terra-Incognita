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
          :zoom="3"
          :center="[20, 0]"
          :use-global-leaflet="false"
        >
          <LGeoJson
            v-if="data"
            :geojson="data"
            :options="mapOptions"
            :options-style="() => BASE_STYLE"
          />
        </LMap>
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { LMap, LGeoJson } from '@vue-leaflet/vue-leaflet';
import 'leaflet/dist/leaflet.css';

const map = ref();

const LAND_COLOR = '#cfe6b8';
const LAND_HOVER_COLOR = '#ffe29a';
const BORDER_COLOR = '#9db8d0';

const { data, pending, error } = useFetch('/api/sovereign-entities', { server: false });

const BASE_STYLE = {
  weight: 1,
  color: BORDER_COLOR,
  opacity: 1,
  fillColor: LAND_COLOR,
  fillOpacity: 1,
};

const HOVER_STYLE = {
  weight: 1.5,
  color: '#6f9bc3',
  fillColor: LAND_HOVER_COLOR,
};

const mapOptions = {
  onEachFeature: (feature, layer) => {
    const label = feature.properties.label?.name_en || feature.properties.sovereignt;
    layer.bindPopup(`<b>${label}</b>`);

    layer.on('mouseover', (e) => {
      e.target.setStyle(HOVER_STYLE);
    });

    layer.on('mouseout', (e) => {
      e.target.setStyle(BASE_STYLE);
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
    background: linear-gradient(to bottom, rgba($colors-blue-light, 0.2) 0%, transparent 35%, transparent 65%, rgba($colors-blue-light, 0.2) 100%), linear-gradient(to bottom, $colors-blue-bg 0%, $colors-blue-bg 100%);
    border-radius: 18px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08),
    inset 0 0 0 2px #ffffff;
    display: flex;
    flex-direction: column;
  }

  &__map {
    flex: 1;
    width: 100%;
    border: 1px solid white;
    border-radius: 14px;
    overflow: hidden;

    --grid-size: 25px;
    --grid-granularity: 3;
    --grid-thickness: 1px;
    --grid-gap: 5px;
    --grid-line-color: white;
    --grid-color: var(--grid-line-color) 25%, transparent 0;

    background: conic-gradient(at var(--grid-gap) var(--grid-thickness), var(--grid-color)) calc((var(--grid-size) / var(--grid-granularity) - var(--grid-gap) + var(--grid-thickness)) / 2) 0 / calc(var(--grid-size) / var(--grid-granularity)) var(--grid-size),
    conic-gradient(from 180deg at var(--grid-thickness) var(--grid-gap), var(--grid-color)) 0 calc((var(--grid-size)/var(--grid-granularity) - var(--grid-gap) + var(--grid-thickness))/2)/ var(--grid-size) calc(var(--grid-size) / var(--grid-granularity));

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
  }
}
</style>
