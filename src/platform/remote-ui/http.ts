// Browser-safe HTTP — E2E/Remote UI builds resolve @platform/http here.
// Uses native browser fetch; works for same-origin and CORS-permissive endpoints.
export const fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis);
