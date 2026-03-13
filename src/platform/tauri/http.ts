// Native Tauri HTTP plugin — normal builds resolve @platform/http here.
// Bypasses CORS restrictions that browser fetch cannot avoid.
export { fetch } from "@tauri-apps/plugin-http";
