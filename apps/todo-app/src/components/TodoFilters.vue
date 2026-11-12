<script setup lang="ts">
import type { Filter } from '../domain/todos.ts';

defineProps<{ filter: Filter }>();
const emit = defineEmits<{ change: [filter: Filter] }>();

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'done', label: 'Done' },
];
</script>

<template>
  <div class="todo-filters" role="group" aria-label="Filter todos">
    <button
      v-for="option in FILTERS"
      :key="option.value"
      type="button"
      :aria-pressed="filter === option.value ? 'true' : 'false'"
      @click="emit('change', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
