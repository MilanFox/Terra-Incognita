<template>
  <div>
    <h1>Language Picker</h1>

    <Playground
      :title="$t(`components.languagePicker.langs.${locale}`)"
      :component="LanguagePicker"
      :fields="{}"
      :defaults="{}"
    />
  </div>
</template>

<script setup lang="ts">
import { LanguagePicker } from '#components';

const { locale } = useI18n();
</script>
