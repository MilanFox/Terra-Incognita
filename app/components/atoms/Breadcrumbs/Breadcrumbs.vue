<template>
  <nav class="breadcrumbs" :aria-label="$t('components.breadcrumbs.aria-label')">
    <ol>
      <li v-for="breadcrumb in breadcrumbs" :key="breadcrumb.href">
        <NuxtLink v-if="breadcrumb.isExistingRoute" :href="breadcrumb.href"> {{ breadcrumb.title }}</NuxtLink>

        <span v-else> {{ breadcrumb.title }}</span>
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
const route = computed(() => useRoute().fullPath);
const router = useRouter();
const { t } = useI18n();

const routes = router.getRoutes();

const breadcrumbs = computed(() => route
  .value
  .split('/')
  .map((cur, i, parts) => {
    const href = `/${parts.slice(1, i + 1).join('/')}`;
    const routeData = routes.find(r => r.path === href);
    const isExistingRoute = Boolean(routeData);
    const routeName = cur || t('components.breadcrumbs.home-label');
    const title = (routeName[0] as string).toUpperCase() + routeName.slice(1, routeName.length);
    return { href, isExistingRoute, title };
  }));
</script>

<style lang="scss">
.breadcrumbs {
  ol {
    margin: 0;
    padding: 0;
    display: flex;
    list-style: none;
  }

  li {
    position: relative;
    padding-right: 16px;

    &::after {
      content: '';
      position: absolute;
      top: 7px;
      right: 6px;
      transform: rotateZ(-45deg);
      transform-origin: 4px 4px;
      display: inline-block;
      width: 6px;
      height: 6px;
      border-bottom: 1px solid $colors-blue-dark;
      border-right: 1px solid $colors-blue-dark;
    }

    &:last-child::after {
      content: none;
    }
  }
}
</style>
