<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import {
  addTodo,
  clearCompleted,
  filterTodos,
  remainingCount,
  removeTodo,
  renameTodo,
  toggleTodo,
  type Filter,
  type Todo,
} from '../domain/todos.ts';
import { loadTodos, saveTodos } from '../services/todo-storage.ts';
import EmptyState from '../components/EmptyState.vue';
import TodoFilters from '../components/TodoFilters.vue';
import TodoInput from '../components/TodoInput.vue';
import TodoItem from '../components/TodoItem.vue';

defineProps<{ weatherRoute: string | null }>();
const emit = defineEmits<{ navigate: [] }>();

// Loaded on every mount (each connect), so re-entering the route reads fresh data.
const todos = shallowRef<Todo[]>(loadTodos());
const filter = ref<Filter>('all');

const visible = computed(() => filterTodos(todos.value, filter.value));
const remaining = computed(() => remainingCount(todos.value));
const hasDone = computed(() => todos.value.some((t) => t.done));

function update(next: Todo[]): void {
  todos.value = next;
  saveTodos(next);
}

const add = (title: string): void => update(addTodo(todos.value, crypto.randomUUID(), title));
const toggle = (id: string): void => update(toggleTodo(todos.value, id));
const rename = (id: string, title: string): void => update(renameTodo(todos.value, id, title));
const remove = (id: string): void => update(removeTodo(todos.value, id));
const clear = (): void => update(clearCompleted(todos.value));
</script>

<template>
  <section class="todo" part="todo">
    <h2 class="todo__title">Todos</h2>
    <TodoInput @add="add" />
    <EmptyState v-if="todos.length === 0" :weather-route="weatherRoute" @navigate="emit('navigate')" />
    <template v-else>
      <ul class="todo__list">
        <TodoItem
          v-for="todo in visible"
          :key="todo.id"
          :todo="todo"
          @toggle="toggle(todo.id)"
          @rename="(title) => rename(todo.id, title)"
          @remove="remove(todo.id)"
        />
      </ul>
      <footer class="todo__footer">
        <span class="todo__count">{{ remaining }} {{ remaining === 1 ? 'item' : 'items' }} left</span>
        <TodoFilters :filter="filter" @change="(next) => (filter = next)" />
        <button v-if="hasDone" type="button" @click="clear">Clear completed</button>
      </footer>
    </template>
  </section>
</template>
