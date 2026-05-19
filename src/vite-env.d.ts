/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module "*.svelte" {
  import type { Component } from "svelte";

  const component: Component;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_IRONWING_APTABASE_DISABLED?: string;
  readonly VITE_IRONWING_APTABASE_KEY?: string;
  readonly VITE_IRONWING_APTABASE_HOST?: string;
  readonly VITE_IRONWING_APP_VERSION?: string;
}
