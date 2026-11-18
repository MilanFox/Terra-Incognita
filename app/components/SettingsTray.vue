<script setup lang="ts">
import { useGameStore } from '~/stores/game';
import { useSound } from '~/composables/useSound';
import { useSettingsStore } from '~/stores/settings';
import type { Language } from '~/stores/settings';

const emit = defineEmits<{ close: [] }>();

const languages: Language[] = ['en', 'de'];

type Confirm = 'import' | 'reset';

const settings = useSettingsStore();
const game = useGameStore();
const sound = useSound();
const { t } = useI18n();

const titleId = useId();
const soundHintId = useId();
const languageLabelId = useId();
const dataLabelId = useId();
const confirmTitleId = useId();
const confirmLineId = useId();
const pendingConfirm = ref<Confirm>();
const statusMessage = ref('');
const tray = useTemplateRef<HTMLElement>('tray');
const title = useTemplateRef<HTMLHeadingElement>('title');
const languageButtons = useTemplateRef<HTMLButtonElement[]>('languageButtons');
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton');
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');
const cancelButton = useTemplateRef<HTMLButtonElement>('cancelButton');

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
  const focusable = [...tray.value?.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), [tabindex="0"]') ?? []];
  const first = closeButton.value!;
  const last = focusable.at(-1) ?? first;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === title.value)) {
    event.preventDefault();
    last.focus();
  }
  else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
};

const askConfirm = async (confirm: Confirm) => {
  statusMessage.value = '';
  pendingConfirm.value = confirm;
  await nextTick();
  cancelButton.value?.focus();
};

const dismissConfirm = async () => {
  const dismissed = pendingConfirm.value!;
  pendingConfirm.value = undefined;
  await nextTick();
  tray.value?.querySelector<HTMLButtonElement>(`[data-opens="${dismissed}"]`)?.focus();
};

const shareFileOnPhone = (file: File) => {
  const isPhone = matchMedia('(pointer: coarse)').matches;
  return isPhone && navigator.canShare?.({ files: [file] }) ? navigator.share({ files: [file] }).then(() => true) : Promise.resolve(false);
};

const exportData = async () => {
  const { fileName, json } = game.exportData();
  const file = new File([json], fileName, { type: 'application/json' });
  try {
    if (!await shareFileOnPhone(file)) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);
    }
    statusMessage.value = t('settings.data.exported');
  }
  catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
  }
};

const importChosenFile = async () => {
  const file = fileInput.value?.files?.[0];
  if (!file) return;
  const result = game.importData(await file.text());
  fileInput.value!.value = '';
  if (result.ok) {
    location.reload();
    return;
  }
  pendingConfirm.value = undefined;
  statusMessage.value = t(result.reason === 'newer' ? 'settings.data.newerFile' : 'settings.data.invalidFile');
};

const resetStats = () => {
  game.resetStats();
  location.reload();
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    if (pendingConfirm.value) {
      event.stopPropagation();
      dismissConfirm();
    }
    else emit('close');
  }
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
        ref="closeButton"
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

    <template v-if="!pendingConfirm">
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

      <p
        :id="dataLabelId"
        class="kicker settings-tray__group-label"
      >
        {{ $t('settings.data.title') }}
      </p>

      <p class="settings-tray__hint">
        {{ $t('settings.data.hint') }}
      </p>

      <div
        class="settings-tray__data"
        role="group"
        :aria-labelledby="dataLabelId"
      >
        <button
          type="button"
          class="tile settings-tray__data-button"
          @click="exportData"
        >
          {{ $t('settings.data.export') }}
        </button>

        <button
          type="button"
          class="tile settings-tray__data-button"
          data-opens="import"
          @click="askConfirm('import')"
        >
          {{ $t('settings.data.import') }}
        </button>

        <button
          type="button"
          class="tile settings-tray__data-button"
          data-opens="reset"
          @click="askConfirm('reset')"
        >
          {{ $t('settings.data.reset') }}
        </button>
      </div>
    </template>

    <div
      v-else
      class="tile settings-tray__confirm"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="confirmTitleId"
      :aria-describedby="confirmLineId"
    >
      <h3
        :id="confirmTitleId"
        class="settings-tray__confirm-title"
      >
        {{ $t(`settings.data.${pendingConfirm}Confirm.title`) }}
      </h3>

      <p
        :id="confirmLineId"
        class="settings-tray__confirm-line"
      >
        {{ $t(`settings.data.${pendingConfirm}Confirm.line`) }}
      </p>

      <div class="settings-tray__confirm-actions">
        <button
          v-if="pendingConfirm === 'import'"
          type="button"
          class="tile settings-tray__confirm-go"
          @click="fileInput?.click()"
        >
          {{ $t('settings.data.importConfirm.choose') }}
        </button>

        <button
          v-else
          type="button"
          class="tile settings-tray__confirm-go"
          @click="resetStats"
        >
          {{ $t('settings.data.resetConfirm.confirm') }}
        </button>

        <button
          ref="cancelButton"
          type="button"
          class="tile settings-tray__confirm-cancel"
          @click="dismissConfirm"
        >
          {{ $t('settings.data.cancel') }}
        </button>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      hidden
      aria-hidden="true"
      tabindex="-1"
      @change="importChosenFile"
    />

    <p
      class="settings-tray__status"
      role="status"
    >
      {{ statusMessage }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.settings-tray {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  max-width: 520px;
  max-height: calc(100% - env(safe-area-inset-top, 0px) - 24px);
  margin-inline: auto;
  overflow: hidden auto;

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
    overflow-wrap: anywhere;
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
    flex-wrap: wrap;
    gap: 8px;
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

  &__data {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 140px), 1fr));
    gap: 12px;
  }

  &__data-button {
    min-height: 48px;
    font-size: 18px;
    font-weight: 700;
  }

  &__status {
    margin: 0;
    font-size: 14px;

    &:empty {
      display: none;
    }
  }

  &__confirm {
    display: grid;
    gap: 8px;
    padding: 16px;
  }

  &__confirm-title {
    margin: 0;
    font-family: $font-serif;
    font-size: 22px;
    font-weight: 900;
  }

  &__confirm-line {
    margin: 0;
    font-size: 15px;
    line-height: 1.4;
  }

  &__confirm-actions {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 140px), 1fr));
    gap: 12px;
  }

  &__confirm-go,
  &__confirm-cancel {
    min-height: 48px;
    font-size: 18px;
    font-weight: 700;
  }

  &__confirm-go {
    background: $color-brick;
    color: $color-paper;
  }

  &__languages {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 140px), 1fr));
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
