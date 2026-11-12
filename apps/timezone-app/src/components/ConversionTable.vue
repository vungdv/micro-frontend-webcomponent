<script setup lang="ts">
import { computed } from 'vue';
import { convertRange } from '../domain/convert.ts';
import { formatDuration, formatTime, formatZonedTime } from '../domain/format.ts';
import type { TimeRange } from '../domain/settings.ts';
import { offsetLabel, zoneLabel } from '../domain/zones.ts';

const props = defineProps<{
  homeZone: string;
  zones: readonly string[];
  ranges: readonly TimeRange[];
  referenceDate: string;
}>();
const emit = defineEmits<{ removeZone: [zone: string]; removeRange: [id: string] }>();

const columns = computed(() =>
  [props.homeZone, ...props.zones].map((zone, index) => ({
    zone,
    home: index === 0,
    label: zoneLabel(zone),
    offset: offsetLabel(zone, props.referenceDate),
  })),
);

const rows = computed(() =>
  props.ranges.map((range) => ({
    range,
    label: `${formatTime(range.start)} – ${formatTime(range.end)}`,
    cells: columns.value.map(({ zone }) => {
      const converted = convertRange(range, props.referenceDate, props.homeZone, zone);
      return {
        zone,
        text: `${formatZonedTime(converted.start)} – ${formatZonedTime(converted.end)}`,
        duration: formatDuration(converted.durationMinutes),
      };
    }),
  })),
);
</script>

<template>
  <div class="tz-table-wrap" role="region" aria-label="Converted time ranges" tabindex="0">
    <table class="tz-table">
      <thead>
        <tr>
          <th scope="col" class="tz-table__corner">Range</th>
          <th v-for="col in columns" :key="col.zone" scope="col" class="tz-zone" :title="col.zone">
            <span class="tz-zone__label">{{ col.label }}<template v-if="col.home"> (you)</template></span>
            <span class="tz-zone__offset">{{ col.offset }}</span>
            <button
              v-if="!col.home"
              type="button"
              class="tz-button tz-button--small"
              :aria-label="`Remove ${col.zone}`"
              @click="emit('removeZone', col.zone)"
            >
              Remove
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="rows.length === 0">
          <td class="tz-table__empty" :colspan="columns.length + 1"><slot name="empty" /></td>
        </tr>
        <tr v-for="row in rows" :key="row.range.id" class="tz-row">
          <th scope="row" class="tz-table__range">
            <span class="tz-table__range-label">{{ row.label }}</span>
            <button
              type="button"
              class="tz-button tz-button--small"
              :aria-label="`Remove ${row.label}`"
              @click="emit('removeRange', row.range.id)"
            >
              Remove
            </button>
          </th>
          <td v-for="(c, index) in row.cells" :key="c.zone" class="tz-cell">
            <span class="tz-cell__range">{{ c.text }}</span>
            <span v-if="index === 0" class="tz-cell__duration">{{ c.duration }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
