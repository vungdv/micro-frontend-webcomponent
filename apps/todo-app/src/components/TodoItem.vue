<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { MAX_TITLE_LENGTH, validateTitle, type Todo } from '../domain/todos.ts';

const props = defineProps<{ todo: Todo }>();
const emit = defineEmits<{ toggle: []; rename: [title: string]; remove: [] }>();

const editing = ref(false);
const draft = ref('');
const editInput = ref<HTMLInputElement | null>(null);

async function startEdit(): Promise<void> {
  draft.value = props.todo.title;
  editing.value = true;
  await nextTick();
  editInput.value?.focus();
}

/** Enter or blur: keep a valid trimmed title; an invalid one reverts to the old title. */
function commit(): void {
  if (!editing.value) return; // the input's removal can fire blur after Enter/Escape
  editing.value = false;
  const result = validateTitle(draft.value);
  if (result.ok && result.title !== props.todo.title) emit('rename', result.title);
}

function onEnter(event: KeyboardEvent): void {
  if (event.isComposing) return; // Enter confirms an IME composition, not the edit
  event.preventDefault();
  commit();
}

function cancel(): void {
  editing.value = false;
}
</script>

<template>
  <li class="todo-item" :class="{ 'todo-item--done': todo.done }">
    <input
      v-if="editing"
      ref="editInput"
      v-model="draft"
      class="todo-item__edit"
      type="text"
      aria-label="Edit title"
      :maxlength="MAX_TITLE_LENGTH"
      @keydown.enter="onEnter"
      @keydown.esc.prevent="cancel"
      @blur="commit"
    />
    <template v-else>
      <input type="checkbox" :checked="todo.done" :aria-label="`Done: ${todo.title}`" @change="emit('toggle')" />
      <span class="todo-item__title" @dblclick="startEdit">{{ todo.title }}</span>
      <button type="button" :aria-label="`Edit ${todo.title}`" @click="startEdit">Edit</button>
      <button type="button" :aria-label="`Delete ${todo.title}`" @click="emit('remove')">Delete</button>
    </template>
  </li>
</template>
