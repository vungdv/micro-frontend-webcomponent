<script setup lang="ts">
import { computed, ref } from 'vue';
import { validateTime } from '../domain/wall-time.ts';

const props = defineProps<{
  /** Tries to add the range; returns the inline message on failure, null on success. */
  add: (start: string, end: string) => string | null;
}>();

// Prefilled so the inputs never sit empty: an empty <input type="time"> shows a grey placeholder
// that looks like a real value, and a half-typed one reports "".
const start = ref('09:00');
const end = ref('17:00');
const error = ref<string | null>(null);
const submitted = ref(false);

// Only the field that is actually incomplete or invalid is marked, so the user sees which one to fix.
const startInvalid = computed(() => (submitted.value && !validateTime(start.value).ok) || undefined);
const endInvalid = computed(() => (submitted.value && !validateTime(end.value).ok) || undefined);
const bothInvalid = computed(() => (error.value !== null && !startInvalid.value && !endInvalid.value) || undefined);

// Equal times are invalid (zero-length), so the hint is only for an end strictly before the start.
const endsNextDay = computed(
  () => validateTime(start.value).ok && validateTime(end.value).ok && end.value < start.value,
);

function submit(): void {
  error.value = props.add(start.value, end.value);
  submitted.value = error.value !== null;
}

function clearError(): void {
  error.value = null;
  submitted.value = false;
}
</script>

<template>
  <form class="tz-range-form" novalidate @submit.prevent="submit">
    <label class="tz-field">
      <span class="tz-field__label">Start</span>
      <input
        v-model="start"
        class="tz-field__input"
        name="start"
        type="time"
        required
        :aria-invalid="startInvalid || bothInvalid"
        @input="clearError"
      />
    </label>
    <label class="tz-field">
      <span class="tz-field__label">End</span>
      <input
        v-model="end"
        class="tz-field__input"
        name="end"
        type="time"
        required
        :aria-invalid="endInvalid || bothInvalid"
        aria-describedby="tz-range-hint"
        @input="clearError"
      />
    </label>
    <button class="tz-button tz-button--primary" type="submit">Add</button>
    <p id="tz-range-hint" class="tz-range-form__hint" aria-live="polite"><template v-if="endsNextDay">ends next day</template></p>
    <p v-if="error" class="tz-error" role="alert">{{ error }}</p>
  </form>
</template>
