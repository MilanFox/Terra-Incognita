<template>
  <div class="language-picker" role="radiogroup" :aria-label="$t('components.languagePicker.label')">
    <label v-for="loc in availableLocales" :key="loc" :lang="loc" class="language-picker__option">
      <component
        :is="flags[loc]"
        class="language-picker__flag"
        :aria-label="$t(`components.languagePicker.langs.${loc}`)"
      />

      <input v-model="chosenLocale" type="radio" :value="loc" class="language-picker__input" name="languagePicker" />
    </label>
  </div>
</template>

<script setup lang="ts">
import { FlagDE, FlagEN } from '#components';

const { locale, setLocale, availableLocales } = useI18n();
const chosenLocale = ref(locale);
watch(chosenLocale, () => setLocale(chosenLocale.value));

const flags = { de: FlagDE, en: FlagEN };
</script>

<style lang="scss">
.language-picker {
  display: inline-flex;
  border-radius: 999px;
  background: rgba($colors-blue-dark, 0.35);

  &__option {
    position: relative;
    cursor: pointer;
    padding: 6px 10px;
    isolation: isolate;

    &:has(input[type='radio']:checked)::after {
      content: '';
      position: absolute;
      background: $colors-grey-light;
      inset: 1px;
      border-radius: 999px;
      z-index: -1;
      border: 1px solid rgba($colors-blue-dark, 0.35);
      box-shadow: 0 1px 1px rgba($colors-text-dark, 0.35);
    }

    &:has(:focus-visible)::after {
      @include focus-style();
    }
  }

  &__flag {
    border-radius: 100%;
    box-shadow: 0 0 0 1px rgba($colors-blue-dark, 0.35);
    height: 22px;
    display: block;
  }

  &__input {
    position: absolute;
    width: 0;
    overflow: hidden;
  }
}
</style>
