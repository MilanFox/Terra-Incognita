<template>
  <div class="faq">
    <AccordionItem
      v-for="({ title, answer }, i) in questions.faq"
      :key="title.loc.source"
      :title="$t(`faq.${i}.title`)"
    >
      <p v-for="(paragraph, j) in answer" :key="paragraph.loc.source">
        {{ $t(`faq.${i}.answer.${j}`) }}
      </p>
    </AccordionItem>
  </div>
</template>

<script setup lang="ts">
import questions from '@labels/de/faq.json';
</script>
