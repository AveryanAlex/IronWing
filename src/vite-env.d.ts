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
  readonly VITE_IRONWING_ARDUPILOT_AUTOTEST_BASE_URL?: string;
  readonly VITE_IRONWING_ARDUPILOT_FIRMWARE_BASE_URL?: string;
  readonly VITE_IRONWING_TOMTOM_API_KEY?: string;
}

declare const __IRONWING_PRERENDER_STATIC_ROUTES__: boolean;
