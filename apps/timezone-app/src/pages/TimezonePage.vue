<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import {
  addRange,
  addZone,
  DEFAULT_SETTINGS,
  MESSAGES,
  removeRange,
  removeZone,
  type Settings,
  type SettingsResult,
} from '../domain/settings.ts';
import { isValidDate } from '../domain/wall-time.ts';
import type { Environment } from '../services/environment.ts';
import type { SettingsRepository } from '../services/settings-repository.ts';
import ConversionTable from '../components/ConversionTable.vue';
import EmptyState from '../components/EmptyState.vue';
import RangeForm from '../components/RangeForm.vue';
import ZonePicker from '../components/ZonePicker.vue';

const props = defineProps<{ repository: SettingsRepository; environment: Environment }>();

// Read on every mount (each connect): the home zone follows the user and is never stored.
const homeZone = props.environment.homeZone();
const supportedZones = props.environment.supportedZones();

const settings = shallowRef<Settings>(DEFAULT_SETTINGS);
const loaded = ref(false);
// In memory only; never saved.
const referenceDate = ref(props.environment.today(homeZone));
// A stored zone equal to today's home zone stays stored (the user may travel back) but is shown only once.
const visibleZones = computed(() => settings.value.zones.filter((z) => z !== homeZone));

onMounted(async () => {
  settings.value = await props.repository.load();
  loaded.value = true;
});

function update(next: Settings): void {
  settings.value = next;
  void props.repository.save(next);
}

/** Applies a domain result; returns the inline message on failure, null on success. */
function apply(result: SettingsResult): string | null {
  if (!result.ok) return MESSAGES[result.reason];
  update(result.settings);
  return null;
}

const onAddZone = (input: string): string | null => apply(addZone(settings.value, input, homeZone, supportedZones));
const onAddRange = (start: string, end: string): string | null =>
  apply(addRange(settings.value, { id: crypto.randomUUID(), start, end }));
const onRemoveZone = (zone: string): void => update(removeZone(settings.value, zone));
const onRemoveRange = (id: string): void => update(removeRange(settings.value, id));

function onDateInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (isValidDate(input.value)) referenceDate.value = input.value;
  else input.value = referenceDate.value; // keep the screen and the table in agreement
}

function resetDate(): void {
  referenceDate.value = props.environment.today(homeZone);
}
</script>

<template>
  <section class="tz" aria-labelledby="tz-title">
    <h2 id="tz-title" class="tz__title">Time zones</h2>
    <template v-if="loaded">
      <div class="tz__controls">
        <ZonePicker :zones="supportedZones" :add="onAddZone" />
        <RangeForm :add="onAddRange" />
        <div class="tz-date">
          <label class="tz-field">
            <span class="tz-field__label">Date</span>
            <input class="tz-field__input" type="date" name="date" :value="referenceDate" @input="onDateInput" />
          </label>
          <button type="button" class="tz-date__today" @click="resetDate">Today</button>
        </div>
      </div>
      <ConversionTable
        :home-zone="homeZone"
        :zones="visibleZones"
        :ranges="settings.ranges"
        :reference-date="referenceDate"
        @remove-zone="onRemoveZone"
        @remove-range="onRemoveRange"
      >
        <template #empty><EmptyState kind="no-ranges" /></template>
      </ConversionTable>
      <EmptyState v-if="settings.ranges.length > 0 && visibleZones.length === 0" kind="no-zones" />
    </template>
  </section>
</template>
