<script setup lang="ts">
defineProps<{ count: number, total: number, label: string }>();
</script>

<template>
  <div
    class="tile score-tile"
    role="img"
    :aria-label="label"
  >
    <span aria-hidden="true">{{ count }}<small>/{{ total }}</small></span>
  </div>
</template>

<style scoped lang="scss">
.score-tile {
  display: flex;
  align-items: baseline;
  justify-content: center;
  min-width: 56px;
  padding: 9px 6px 0;
  box-shadow: 0 3px 0 $color-ink;
  font-family: $font-serif;
  font-size: 24px;
  font-weight: 900;
  line-height: 1;

  small {
    font-size: 14px;
    font-weight: 700;
  }
}
</style>
