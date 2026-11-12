<script setup lang="ts">
defineProps<{ kind: 'no-ranges' | 'no-zones' }>();
</script>

<template>
  <p class="tz-empty">{{ kind === 'no-ranges' ? 'Add a time range to get started' : 'Add a time zone to compare' }}</p>
</template>
