<template>
  <div class="labels-page">
    <PageTitle :title="$t('pages.labels.title')" color="blue" />

    <ContentSection :title="$t('pages.labels.sections.intention')" class="labels-page__intro">
      <p>{{ $t('pages.labels.intro') }}</p>
    </ContentSection>

    <ContentSection :title="$t('pages.labels.sections.label-list')">
      <table class="labels-page__table">
        <thead>
          <tr>
            <th scope="col">{{ $t('pages.labels.table.title.official') }}</th>

            <th scope="col">{{ $t('pages.labels.table.title.colloquial') }}</th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="entry in data" :key="entry.sov_a3">
            <th scope="row">
              {{ entry[`name_${locale}`] }}
            </th>

            <td>
              <ul>
                <li v-for="label in entry[`aliases_${locale}`]" :key="label">
                  {{ label }}
                </li>
              </ul>
            </td>
          </tr>
        </tbody>
      </table>
    </ContentSection>
  </div>
</template>

<script setup lang="ts">
import PageTitle from '@atoms/PageTitle/PageTitle.vue';

const { data } = await useFetch('/api/labels');

const { locale, t } = useI18n();
useHead({ title: t('pages.labels.title') });
</script>

<style lang="scss">
.labels-page {
  @include container();

  &__title {
    @include container();
  }

  &__intro {
    font-size: 18px;
  }

  &__table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.95rem;

    th,
    td {
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid $colors-grey-dark;
      vertical-align: top;
    }

    thead th {
      font-weight: 600;
      border-bottom: 2px solid $colors-grey-dark;
      background: $colors-grey-bg;
    }

    tbody tr:nth-child(even) {
      background: $colors-grey-bg;
    }

    tbody th {
      font-weight: 500;
      width: 30%;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
    }

    li {
      white-space: nowrap;
    }

    li + li {
      border-left: 1px solid $colors-blue-dark;
      padding-left: 8px;
    }
  }
}
</style>
