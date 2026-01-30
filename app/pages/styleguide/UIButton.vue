<template>
  <div>
    <h1>DemoBadge - Basic</h1>

    <Playground
      v-for="props in defaults"
      :key="props.color"
      title="Badge playground"
      :component="UIButton"
      :fields="fields"
      :defaults="props"
    >
      Click me
    </Playground>
  </div>
</template>

<script setup lang="ts">
import type { PlaygroundFieldType } from '@components/styleguide/PlaygroundField/PlaygroundField.types';
import { UIButton } from '#components';

const fields: Record<string, PlaygroundFieldType> = {
  type: { type: 'select', options: ['button', 'link'] },
  color: { type: 'select', options: ['grey', 'blue', 'green', 'orange'] },
};

const defaults = [
  { type: 'button', color: 'grey', to: '/styleguide' },
  { type: 'button', color: 'blue', to: '/styleguide' },
  { type: 'button', color: 'green', to: '/styleguide' },
  { type: 'button', color: 'orange', to: '/styleguide' },
];
</script>
