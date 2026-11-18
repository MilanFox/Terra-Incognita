<script setup lang="ts" generic="PageId extends string">
const props = defineProps<{ pages: { id: PageId, name: string }[], label: string }>();
const activePageId = defineModel<PageId>({ required: true });

const tabInsetPx = 4;

const idBase = useId();
const tablist = useTemplateRef<HTMLElement>('tablist');
const tabs = useTemplateRef<HTMLButtonElement[]>('tabs');
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

const tabIdOf = (pageId: PageId) => `${idBase}-tab-${pageId}`;
const panelIdOf = (pageId: PageId) => `${idBase}-panel-${pageId}`;

const keepActiveTabInView = () => {
  const activeTab = tablist.value?.querySelector('[aria-selected="true"]');
  if (!tablist.value || !activeTab) return;
  const listBox = tablist.value.getBoundingClientRect();
  const tabBox = activeTab.getBoundingClientRect();
  const left = Math.min(0, tabBox.left - listBox.left - tabInsetPx) || Math.max(0, tabBox.right - listBox.right + tabInsetPx);
  if (left !== 0) tablist.value.scrollBy({ left, behavior: prefersReducedMotion.value ? 'instant' : 'smooth' });
};

watch(activePageId, () => nextTick(keepActiveTabInView));

const onKeydown = (event: KeyboardEvent) => {
  const count = props.pages.length;
  const index = props.pages.findIndex(({ id }) => id === activePageId.value);
  const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: count - 1 }[event.key];
  if (target === undefined) return;
  event.preventDefault();
  const nextIndex = (target + count) % count;
  activePageId.value = props.pages[nextIndex]!.id;
  tabs.value?.[nextIndex]?.focus();
};
</script>

<template>
  <div
    ref="tablist"
    class="stats-tabs"
    role="tablist"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <button
      v-for="page in pages"
      :id="tabIdOf(page.id)"
      :key="page.id"
      ref="tabs"
      type="button"
      role="tab"
      class="tile stats-tab"
      :aria-selected="page.id === activePageId"
      :aria-controls="panelIdOf(page.id)"
      :tabindex="page.id === activePageId ? 0 : -1"
      @click="activePageId = page.id"
    >
      <span
        class="stats-tab__glyph"
        aria-hidden="true"
      >
        <slot
          name="glyph"
          :page-id="page.id"
        />
      </span>

      <span class="stats-tab__name">{{ page.name }}</span>
    </button>
  </div>

  <div
    v-for="page in pages"
    :id="panelIdOf(page.id)"
    :key="page.id"
    role="tabpanel"
    class="stats-tabs__panel"
    :aria-labelledby="tabIdOf(page.id)"
    :hidden="page.id !== activePageId"
    tabindex="0"
  >
    <slot
      v-if="page.id === activePageId"
      :page-id="page.id"
    />
  </div>
</template>

<style scoped lang="scss">
.stats-tabs {
  display: flex;
  gap: 8px;
  margin-inline: -4px;
  padding: 4px 4px 8px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  &__panel:focus-visible {
    outline-offset: 4px;
  }
}

.stats-tab {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 12px 0 6px;
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;

  &[aria-selected='true'] {
    background: $color-mustard;
  }

  &__glyph {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    background: $color-ink;
    color: $color-paper;
  }

  &[aria-selected='true'] &__glyph {
    color: $color-mustard;
  }
}
</style>
