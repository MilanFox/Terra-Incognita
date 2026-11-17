<script setup lang="ts">
import { useSound } from '~/composables/useSound';
import { useSettingsStore } from '~/stores/settings';
import type { Language } from '~/stores/settings';

const emit = defineEmits<{ close: [] }>();

const languages: Language[] = ['en', 'de'];

const settings = useSettingsStore();
const sound = useSound();

const titleId = useId();
const soundHintId = useId();
const languageLabelId = useId();
const tray = useTemplateRef<HTMLElement>('tray');
const title = useTemplateRef<HTMLHeadingElement>('title');
const languageButtons = useTemplateRef<HTMLButtonElement[]>('languageButtons');

const toggleSound = () => {
  const isTurningOn = !settings.isSoundOn;
  settings.setSound(isTurningOn);
  if (isTurningOn) sound.tick();
};

const chooseLanguage = (language: Language) => {
  settings.setLanguage(language);
  languageButtons.value?.[languages.indexOf(language)]?.focus();
};

const onLanguageKeydown = (event: KeyboardEvent) => {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  chooseLanguage(languages[(languages.indexOf(settings.language) + step + languages.length) % languages.length]!);
};

const trapFocus = (event: KeyboardEvent) => {
  const focusable = [...tray.value?.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), [tabindex="0"]') ?? [], title.value!];
  const first = title.value!;
  const last = focusable.filter(element => element !== first).at(-1) ?? first;
  const active = document.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  }
  else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close');
  else if (event.key === 'Tab') trapFocus(event);
};

onMounted(() => title.value?.focus());
</script>

<template>
  <section
    ref="tray"
    class="tray settings-tray"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    @keydown="onKeydown"
  >
    <div class="settings-tray__top">
      <button
        type="button"
        class="tile settings-tray__close"
        :aria-label="$t('settings.close')"
        @click="emit('close')"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
        >
          <path
            d="M5 5l14 14M19 5L5 19"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="square"
          />
        </svg>
      </button>
    </div>

    <h2
      :id="titleId"
      ref="title"
      class="settings-tray__title"
      tabindex="-1"
    >
      {{ $t('settings.title') }}
    </h2>

    <button
      type="button"
      role="switch"
      class="tile settings-tray__switch"
      :aria-checked="settings.isSoundOn"
      :aria-describedby="soundHintId"
      @click="toggleSound"
    >
      <span class="settings-tray__switch-label">{{ $t('settings.sound') }}</span>

      <span
        class="settings-tray__switch-state"
        :class="{ 'settings-tray__switch-state--on': settings.isSoundOn }"
        aria-hidden="true"
      >{{ settings.isSoundOn ? $t('settings.on') : $t('settings.off') }}</span>
    </button>

    <p
      :id="soundHintId"
      class="settings-tray__hint"
    >
      {{ $t('settings.soundHint') }}
    </p>

    <p
      :id="languageLabelId"
      class="kicker settings-tray__group-label"
    >
      {{ $t('settings.language') }}
    </p>

    <div
      class="settings-tray__languages"
      role="radiogroup"
      :aria-labelledby="languageLabelId"
      @keydown="onLanguageKeydown"
    >
      <button
        v-for="language in languages"
        :key="language"
        ref="languageButtons"
        type="button"
        role="radio"
        class="tile settings-tray__language"
        :class="{ 'settings-tray__language--chosen': settings.language === language }"
        :aria-checked="settings.language === language"
        :tabindex="settings.language === language ? 0 : -1"
        :lang="language"
        @click="chooseLanguage(language)"
      >
        {{ $t(`settings.languages.${language}`) }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.settings-tray {
  display: grid;
  gap: 12px;
  max-width: 520px;
  max-height: calc(100% - env(safe-area-inset-top, 0px) - 24px);
  margin-inline: auto;
  overflow-y: auto;

  &__top {
    display: flex;
    justify-content: flex-end;
  }

  &__close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
  }

  &__title {
    margin: 0;
    font-family: $font-serif;
    font-size: 32px;
    font-weight: 900;
    line-height: 1;

    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }

  &__switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 56px;
    padding: 0 16px;
    font-size: 18px;
    font-weight: 700;
  }

  &__switch-state {
    min-width: 52px;
    padding: 4px 10px;
    border: 2px solid $color-ink;
    border-radius: 4px;
    background: $color-sand;
    font-size: 14px;
    text-align: center;

    &--on {
      background: $color-green;
      color: $color-paper;
    }
  }

  &__hint {
    margin: -4px 0 0;
    color: $color-muted;
    font-size: 14px;
  }

  &__group-label {
    margin-top: 8px;
    color: $color-muted;
  }

  &__languages {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  &__language {
    min-height: 48px;
    font-size: 18px;
    font-weight: 700;

    &--chosen {
      background: $color-mustard;
    }
  }
}
</style>
