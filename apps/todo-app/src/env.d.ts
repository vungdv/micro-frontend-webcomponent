// Gap: Vue SFCs (.vue) are NOT type-checked. `tsc` (TypeScript 7) cannot read them and vue-tsc does not
// support TypeScript 7 yet, so .vue imports are typed only through this shim. Vite compiles SFCs but does
// not type-check their templates or scripts.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
