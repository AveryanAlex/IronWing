import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const svelteConfig = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    experimental: {
      async: true,
    },
  },
};

export default svelteConfig;
