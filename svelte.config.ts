import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import type { Options } from "@sveltejs/vite-plugin-svelte";

const svelteConfig = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    experimental: {
      async: true,
    },
  },
} satisfies Options;

export default svelteConfig;
