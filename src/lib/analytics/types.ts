export type AnalyticsEdition = "native" | "web" | "mock" | "remote";

export type AnalyticsProperty = string | number;

export type AnalyticsProperties = Record<string, AnalyticsProperty>;

export type AnalyticsStatus = {
  enabled: boolean;
  edition: AnalyticsEdition;
};

export type AnalyticsEventMap = {
  app_started: {
    edition: AnalyticsEdition;
    build: "development" | "production";
  };
  workspace_viewed: {
    workspace: string;
  };
  connection_started: {
    transport: string;
  };
  connection_succeeded: {
    transport: string;
  };
  connection_failed: {
    transport: string;
    reason: string;
  };
  connection_cancelled: {
    transport: string;
  };
  connection_disconnected: {
    transport: string;
    was_connected_secs_bucket: string;
  };
  transport_selected: {
    transport: string;
    available: number;
  };
  firmware_install_started: {
    source: string;
    target_kind: string;
    full_chip_erase: number;
  };
  firmware_install_completed: {
    result: string;
    path: string;
    duration_secs_bucket: string;
  };
  log_imported: {
    format: string;
    size_bucket: string;
    result: string;
  };
  log_replay_started: {
    source: string;
    duration_secs_bucket: string;
  };
  mission_imported: {
    source: string;
    mode: string;
    item_count_bucket: string;
    warning_count: number;
    result: string;
  };
  mission_uploaded: {
    mode: string;
    item_count_bucket: string;
    result: string;
  };
  params_applied: {
    changed_count: number;
    result: string;
    failed_count: number;
  };
  mission_downloaded: {
    mode: string;
    item_count_bucket: string;
    result: string;
  };
  mission_exported: {
    mode: string;
    format: string;
    item_count_bucket: string;
    result: string;
  };
  mission_cleared: {
    mode: string;
    result: string;
  };
  mission_survey_created: {
    pattern: string;
    region_count_bucket: string;
  };
  params_downloaded: {
    result: string;
    param_count_bucket: string;
  };
  params_edit_staged: {
    source: string;
    staged_count_bucket: string;
  };
  log_recording_started: {
    auto: number;
    source: string;
  };
  log_recording_stopped: {
    duration_secs_bucket: string;
    result: string;
  };
  log_raw_query: {
    limit: number;
    result_count_bucket: string;
  };
  log_chart_query: {
    series_count_bucket: string;
  };
  log_exported: {
    origin: string;
    result: string;
  };
  bootloader_install_started: {
    source: string;
    target_kind: string;
  };
  bootloader_install_completed: {
    result: string;
    duration_secs_bucket: string;
  };
  setup_section_viewed: {
    section: string;
    connected: number;
  };
  calibration_started: {
    kind: string;
  };
  calibration_completed: {
    kind: string;
    result: string;
  };
  settings_changed: {
    setting: string;
    value_bucket: string;
  };
  vehicle_panel_toggled: {
    state: string;
    layout: string;
  };
  map_follow_changed: {
    target: string;
  };
  hud_svs_toggled: {
    enabled: number;
  };
  telemetry_rate_changed: {
    rate_hz: number;
  };
  message_rate_changed: {
    changed_count: number;
    result: string;
  };
  guided_command_requested: {
    command: string;
    source: string;
  };
  arming_command_requested: {
    action: string;
    force: number;
  };
  prearm_checks_requested: {
    connected: number;
  };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;
