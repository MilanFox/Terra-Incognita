<template>
  <div class="accordion-item" :class="{ 'accordion-item--expanded': isExpanded }">
    <h3 class="accordion-item__headline">
      <button
        :aria-expanded="isExpanded"
        type="button"
        :aria-controls="id"
        class="accordion-item__button"
        @click="toggleAccordion"
      >
        {{ title }}
      </button>
    </h3>

    <div :id="id" class="accordion-item__content" :inert="!isExpanded">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AccordionItemProps } from './AccordionItem.types';

const props = defineProps<AccordionItemProps>();

const toKebabCase = (str: string) => str.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
const id = `accordion-${toKebabCase(props.title)}`;

const isExpanded = ref(false);
const toggleAccordion = () => isExpanded.value = !isExpanded.value;
</script>

<style lang="scss">
.accordion-item {
  display: grid;
  grid-template-rows: min-content 0fr;
  transition: grid-template-rows ease-in-out 0.3s;

  &__headline {
    margin: 0;
    display: flex;
    font-size: 22px;

    &:has(:focus-visible) {
      @include focus-style();
    }
  }

  &__button {
    all: unset;
    cursor: pointer;
    position: relative;
    padding: 4px 40px 4px 0;
    flex-grow: 1;
    align-items: flex-start;
    font-weight: 500;

    &::after {
      content: '';
      position: absolute;
      right: 16px;
      transform: rotateZ(405deg);
      transform-origin: 11px 11px;
      transition: transform ease-in-out 0.3s;
      display: inline-block;
      width: 16px;
      height: 16px;
      border-bottom: 4px solid $colors-blue-dark;
      border-right: 4px solid $colors-blue-dark;
    }

    &:hover {
      color: $colors-blue-dark;
    }
  }

  &__content {
    overflow: hidden;
  }

  &--expanded {
    grid-template-rows: min-content 1fr;

    .accordion-item__button::after {
      transform: rotateZ(225deg);
    }
  }

  & + .accordion-item {
    border-top: 1px solid $colors-grey-dark;
  }
}
</style>
