<template>
  <div class="faq">
    <AccordionItem
      v-for="({ title, answer }, i) in labels.components.faq"
      :key="title.loc.source"
      :title="$t(`components.faq.${i}.title`)"
    >
      <p v-for="(paragraph, j) in answer" :key="paragraph.loc.source">
        {{ $t(`components.faq.${i}.answer.${j}`) }}
      </p>
    </AccordionItem>
  </div>
</template>

<script setup lang="ts">
import labels from '@labels/de.json';
</script>
