export const DIST_DIRS = {
  tauri: "dist/tauri",
  web: "dist/web",
  demo: "dist/demo",
  e2e: "dist/e2e",
};

export function demoFrontendEnv() {
  return {
    IRONWING_PLATFORM: "mock",
    ...mockProfileEnv("demo"),
  };
}

export function demoBuildEnv(env = process.env) {
  return {
    ...demoFrontendEnv(),
    IRONWING_OUT_DIR: env.IRONWING_OUT_DIR ?? DIST_DIRS.demo,
  };
}

export function mockProfileEnv(mockProfile) {
  return mockProfile ? { VITE_IRONWING_MOCK_PROFILE: mockProfile } : {};
}

export function tauriFrontendEnv(overrides = {}) {
  return {
    IRONWING_PLATFORM: "tauri",
    IRONWING_OUT_DIR: DIST_DIRS.tauri,
    ...overrides,
  };
}

export function webFrontendEnv(overrides = {}, env = process.env) {
  return {
    IRONWING_PLATFORM: "web",
    ...overrides,
    ...(env.IRONWING_OUT_DIR ? { IRONWING_OUT_DIR: env.IRONWING_OUT_DIR } : {}),
    ...(env.IRONWING_BASE ? { IRONWING_BASE: env.IRONWING_BASE } : {}),
  };
}

export function webBuildEnv(env = process.env) {
  return webFrontendEnv(
    {
      IRONWING_OUT_DIR: env.IRONWING_OUT_DIR ?? DIST_DIRS.web,
      IRONWING_BASE: env.IRONWING_BASE ?? "./",
    },
    env,
  );
}

export function sitlTcpEnv(runtime, overrides = {}) {
  return {
    VITE_IRONWING_SITL_MODE: "tcp",
    VITE_IRONWING_SITL_TCP_PORT: String(runtime.sitlTcpPort),
    ...overrides,
  };
}

export function sitlWebSocketEnv(wsUrl) {
  return {
    VITE_IRONWING_SITL_MODE: "websocket",
    VITE_IRONWING_SITL_WS_URL: wsUrl,
  };
}

export function androidSitlTcpEnv(runtime, host = process.env.IRONWING_ANDROID_SITL_HOST ?? "10.0.2.2") {
  const tcpAddress = `${host}:${runtime.sitlTcpPort}`;

  return {
    tcpAddress,
    env: sitlTcpEnv(runtime, {
      VITE_IRONWING_SITL_TCP_ADDRESS: tcpAddress,
    }),
  };
}

export function remoteUiEnv({ remoteUiHost, remoteUiPort, remoteUiBridgeUrl, runtime, viteHost }) {
  return {
    IRONWING_PLATFORM: "remote",
    IRONWING_REMOTE_UI: "1",
    IRONWING_REMOTE_UI_HOST: remoteUiHost,
    IRONWING_REMOTE_UI_PORT: String(remoteUiPort),
    IRONWING_REMOTE_UI_VITE_HOST: viteHost,
    VITE_IRONWING_REMOTE_UI_URL: remoteUiBridgeUrl,
    VITE_IRONWING_AUTO_CONNECT_SITL: "1",
    ...sitlTcpEnv(runtime),
  };
}
