export type MockProfile = "test" | "demo";

export function currentMockProfile(env: ImportMetaEnv | NodeJS.ProcessEnv = import.meta.env): MockProfile {
  return env.VITE_IRONWING_MOCK_PROFILE === "demo" ? "demo" : "test";
}

export function isDemoProfile(env: ImportMetaEnv | NodeJS.ProcessEnv = import.meta.env): boolean {
  return currentMockProfile(env) === "demo";
}
