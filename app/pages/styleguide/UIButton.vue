<template>
  <div>
    <h1>DemoBadge - Basic</h1>

    <Playground
      title="Badge playground"
      :component="UIButton"
      :fields="fields"
      :defaults="defaults"
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

const defaults = {
  type: 'button',
  color: 'grey',
  to: '/styleguide',
};
</script>
