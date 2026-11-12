<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  zones: readonly string[];
  /** Tries to add the zone; returns the inline message on failure, null on success. */
  add: (input: string) => string | null;
}>();

const query = ref('');
const error = ref<string | null>(null);

/** Substring, case-insensitive, spaces ↔ `_` (so `new york` suggests `America/New_York`). */
const normalize = (value: string): string => value.trim().toLowerCase().replaceAll(' ', '_');
const suggestions = computed(() => {
  const wanted = normalize(query.value);
  return wanted === '' ? props.zones : props.zones.filter((z) => z.toLowerCase().includes(wanted));
});

function submit(): void {
  error.value = props.add(query.value);
  if (error.value === null) query.value = '';
}
</script>

<template>
  <form class="tz-zone-picker" novalidate @submit.prevent="submit">
    <label class="tz-field">
      <span class="tz-field__label">Time zone</span>
      <input
        v-model="query"
        class="tz-field__input"
        name="zone"
        type="text"
        list="tz-zone-options"
        autocomplete="off"
        spellcheck="false"
        placeholder="America/New_York"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? 'tz-zone-error' : undefined"
        @input="error = null"
      />
    </label>
    <datalist id="tz-zone-options">
      <option v-for="zone in suggestions" :key="zone" :value="zone" :label="zone.replaceAll('_', ' ')" />
    </datalist>
    <button class="tz-button tz-button--primary" type="submit">Add</button>
    <p v-if="error" id="tz-zone-error" class="tz-error" role="alert">{{ error }}</p>
  </form>
</template>
