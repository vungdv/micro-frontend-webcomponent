<script setup lang="ts">
import { ref } from 'vue';
import { MAX_TITLE_LENGTH, validateTitle } from '../domain/todos.ts';

const emit = defineEmits<{ add: [title: string] }>();

const ERRORS = { empty: 'Title is required', 'too-long': `Max ${MAX_TITLE_LENGTH} characters` } as const;

const title = ref('');
const error = ref<string | null>(null);

function submit(): void {
  const result = validateTitle(title.value);
  if (!result.ok) {
    error.value = ERRORS[result.reason];
    return;
  }
  error.value = null;
  title.value = '';
  emit('add', result.title);
}
</script>

<template>
  <form class="todo-input" novalidate @submit.prevent="submit">
    <input
      v-model="title"
      class="todo-input__field"
      name="title"
      type="text"
      autocomplete="off"
      placeholder="What needs doing?"
      aria-label="New todo"
      :maxlength="MAX_TITLE_LENGTH"
      :aria-invalid="error ? 'true' : undefined"
    />
    <button class="todo-input__submit" type="submit">Add</button>
    <p v-if="error" class="todo-input__error" role="alert">{{ error }}</p>
  </form>
</template>
