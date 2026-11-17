<script setup lang="ts" generic="Value extends string | number">
interface RadioOption {
  value: Value
  label: string
  accessibleName: string
  detail?: string
  isAvailable: boolean
}

const props = defineProps<{ label: string, options: RadioOption[], modelValue: Value }>();
const emit = defineEmits<{ 'update:modelValue': [value: Value] }>();

const labelId = useId();
const group = useTemplateRef<HTMLElement>('group');

const choose = (option: RadioOption) => {
  if (option.isAvailable) emit('update:modelValue', option.value);
};

const moveFocus = (step: number, index: number) => {
  const radios = [...group.value!.querySelectorAll<HTMLElement>('[role="radio"]')];
  const target = (index + step + radios.length) % radios.length;
  radios[target]!.focus();
  choose(props.options[target]!);
};

const handleKeydown = (event: KeyboardEvent, index: number) => {
  const steps: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const step = steps[event.key];
  if (step === undefined) return;
  event.preventDefault();
  moveFocus(step, index);
};
</script>

<template>
  <div class="radio-tiles">
    <span
      :id="labelId"
      class="kicker radio-tiles__label"
    >{{ label }}</span>

    <div
      ref="group"
      role="radiogroup"
      class="radio-tiles__options"
      :aria-labelledby="labelId"
    >
      <button
        v-for="(option, index) in options"
        :key="option.value"
        type="button"
        role="radio"
        class="tile radio-tiles__option"
        :class="{ 'radio-tiles__option--unavailable': !option.isAvailable }"
        :aria-checked="option.value === modelValue"
        :aria-disabled="!option.isAvailable"
        :aria-label="option.accessibleName"
        :tabindex="option.value === modelValue ? 0 : -1"
        @click="choose(option)"
        @keydown="handleKeydown($event, index)"
      >
        {{ option.label }}

        <small
          v-if="option.detail"
          class="radio-tiles__detail"
        >{{ option.detail }}</small>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.radio-tiles {
  display: grid;
  gap: 6px;

  &__label {
    color: $color-muted;
  }

  &__options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__option {
    display: inline-flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    padding: 4px 10px;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.1;

    &[aria-checked='true'] {
      background: $color-mustard;
    }

    &--unavailable {
      border-style: dashed;
      color: $color-muted;
      box-shadow: none;
      cursor: not-allowed;
    }
  }

  &__detail {
    font-size: 12px;
    font-weight: 600;
    color: $color-muted;
  }
}
</style>
