<template>
  <div class="game-container">
    <div v-if="pending" class="status-msg">Loading Map Data...</div>

    <div v-else-if="error" class="status-msg error">Error: {{ error.message }}</div>

    <ClientOnly>
      <LMap
        ref="map"
        :zoom="2"
        :center="[20, 0]"
        :use-global-leaflet="false"
        style="height: 600px; width: 100%; background-color: #aadaff;"
      >
        <LGeoJson
          v-if="mergedGeoJSON"
          :geojson="mergedGeoJSON"
          :options="geoJsonOptions"
        />
      </LMap>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { LMap, LGeoJson } from '@vue-leaflet/vue-leaflet';
import 'leaflet/dist/leaflet.css';

const { data, pending, error } = useFetch('/api/sovereign-entities', {
  key: 'sovereign-entities',
  lazy: true,
  server: false,
});

const mergedGeoJSON = computed(() => {
  if (!data.value || !Array.isArray(data.value)) return null;

  const allFeatures = data.value.map((row) => {
    const { entities } = row;
    const feature = entities.features?.[0];
    feature.properties = feature.properties || {};
    feature.properties.sovereignt = row.sovereignt;
    return feature;
  });

  return {
    type: 'FeatureCollection',
    features: allFeatures,
  };
});

const geoJsonOptions = {
  style: () => ({
    weight: 0.1,
    color: '#555',
    opacity: 1,
    fillColor: '#ececec',
    fillOpacity: 1,
  }),
  onEachFeature: (feature, layer) => {
    const label = feature.properties.label?.name_en || feature.properties.sovereignt;
    layer.bindPopup(`<b>${label}</b>`);

    layer.on('mouseover', (e) => {
      e.target.setStyle({ fillColor: '#ffcc00' });
    });
    layer.on('mouseout', (e) => {
      e.target.setStyle({ fillColor: '#ececec' });
    });
  },
};
</script>

<style scoped>
.game-container {
  width: 100%;
  border: 2px solid #333;
}
</style>
