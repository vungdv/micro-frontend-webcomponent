<script setup lang="ts">
defineProps<{ weatherRoute: string | null }>();
const emit = defineEmits<{ navigate: [] }>();

function onClick(event: MouseEvent): void {
  event.preventDefault();
  emit('navigate');
}
</script>

<template>
  <p class="todo-empty">
    <a v-if="weatherRoute !== null" class="todo-empty__link" :href="weatherRoute" @click="onClick">Nothing to do. Check the weather?</a>
    <template v-else>No todos yet</template>
  </p>
</template>
