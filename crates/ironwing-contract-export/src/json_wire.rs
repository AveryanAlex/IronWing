use std::fmt::Write;

struct AliasSpec {
    name: &'static str,
    source: &'static str,
}

const IRONWING_ALIASES: &[AliasSpec] = &[
    AliasSpec { name: "SessionEnvelope", source: "Ironwing.SessionEnvelope" },
    AliasSpec { name: "SessionConnection", source: "Ironwing.SessionConnection" },
    AliasSpec { name: "SessionSnapshot", source: "Ironwing.SessionSnapshot" },
    AliasSpec { name: "OpenSessionSnapshot", source: "Ironwing.OpenSessionSnapshot" },
    AliasSpec { name: "AckSessionSnapshotResult", source: "Ironwing.AckSessionSnapshotResult" },
    AliasSpec { name: "PlaybackSnapshot", source: "Ironwing.PlaybackSnapshot" },
    AliasSpec { name: "PlaybackState", source: "Ironwing.PlaybackState" },
    AliasSpec { name: "PlaybackSeekResult", source: "Ironwing.PlaybackSeekResult" },
    AliasSpec { name: "VehicleState", source: "Ironwing.VehicleState" },
    AliasSpec { name: "TelemetryState", source: "Ironwing.TelemetryState" },
    AliasSpec { name: "MissionDownload", source: "Ironwing.MissionDownload" },
    AliasSpec { name: "MissionState", source: "Ironwing.MissionState" },
    AliasSpec { name: "HomePosition", source: "Ironwing.HomePosition" },
    AliasSpec { name: "Param", source: "Ironwing.Param" },
    AliasSpec { name: "ParamStore", source: "Ironwing.ParamStore" },
    AliasSpec { name: "ParamProgress", source: "Ironwing.ParamOperationProgress" },
    AliasSpec { name: "LogFormatAdapter", source: "Ironwing.LogFormatAdapter" },
    AliasSpec { name: "ReferencedFileFingerprint", source: "Ironwing.ReferencedFileFingerprint" },
    AliasSpec { name: "ReferencedFileStatus", source: "Ironwing.ReferencedFileStatus" },
    AliasSpec { name: "ReferencedLogFile", source: "Ironwing.ReferencedLogFile" },
    AliasSpec { name: "LogDiagnostic", source: "Ironwing.LogDiagnostic" },
    AliasSpec { name: "LogMetadata", source: "Ironwing.LogMetadata" },
    AliasSpec { name: "LogIndexReference", source: "Ironwing.LogIndexReference" },
    AliasSpec { name: "LogLibraryEntry", source: "Ironwing.LogLibraryEntry" },
    AliasSpec { name: "LogLibraryStorageLocation", source: "Ironwing.LogLibraryStorageLocation" },
    AliasSpec { name: "LogLibraryCatalog", source: "Ironwing.LogLibraryCatalog" },
    AliasSpec { name: "LogCatalogMigrationError", source: "Ironwing.LogCatalogMigrationError" },
    AliasSpec { name: "LogProgress", source: "Ironwing.LogOperationProgress" },
    AliasSpec { name: "RawMessageQuery", source: "Ironwing.RawMessageQuery" },
    AliasSpec { name: "RawMessageFieldFilter", source: "Ironwing.RawMessageFieldFilter" },
    AliasSpec { name: "RawMessageRecord", source: "Ironwing.RawMessageRecord" },
    AliasSpec { name: "RawMessagePage", source: "Ironwing.RawMessagePage" },
    AliasSpec { name: "ChartSeriesSelector", source: "Ironwing.ChartSeriesSelector" },
    AliasSpec { name: "ChartSeriesRequest", source: "Ironwing.ChartSeriesRequest" },
    AliasSpec { name: "ChartPoint", source: "Ironwing.ChartPoint" },
    AliasSpec { name: "ChartSeries", source: "Ironwing.ChartSeries" },
    AliasSpec { name: "ChartSeriesPage", source: "Ironwing.ChartSeriesPage" },
    AliasSpec { name: "LogExportRequest", source: "Ironwing.LogExportRequest" },
    AliasSpec { name: "LogExportResult", source: "Ironwing.LogExportResult" },
    AliasSpec { name: "FirmwareProgress", source: "Ironwing.FirmwareProgress" },
    AliasSpec { name: "FirmwareSessionStatus", source: "Ironwing.FirmwareSessionStatus" },
    AliasSpec { name: "FirmwareOutcome", source: "Ironwing.FirmwareOutcome" },
    AliasSpec { name: "PortInfo", source: "Ironwing.PortInfo" },
    AliasSpec { name: "DfuDeviceInfo", source: "Ironwing.DfuDeviceInfo" },
    AliasSpec { name: "DfuScanResult", source: "Ironwing.DfuScanResult" },
    AliasSpec { name: "SerialPreflightInfo", source: "Ironwing.SerialPreflightInfo" },
    AliasSpec { name: "SerialFlashSource", source: "Ironwing.SerialFlashSource" },
    AliasSpec { name: "SerialFlashOptions", source: "Ironwing.SerialFlashOptions" },
    AliasSpec { name: "SerialReadinessRequest", source: "Ironwing.SerialReadinessRequest" },
    AliasSpec { name: "SerialReadinessResponse", source: "Ironwing.SerialReadinessResponse" },
    AliasSpec { name: "FirmwareRebootToBootloaderResult", source: "Ironwing.FirmwareRebootToBootloaderResult" },
    AliasSpec { name: "FirmwareBootloaderBoardInfo", source: "Ironwing.FirmwareBootloaderBoardInfo" },
    AliasSpec { name: "DfuRecoverySource", source: "Ironwing.DfuRecoverySource" },
    AliasSpec { name: "SerialFlowResult", source: "Ironwing.SerialFlowResult" },
    AliasSpec { name: "DfuRecoveryResult", source: "Ironwing.DfuRecoveryResult" },
    AliasSpec { name: "CatalogEntry", source: "Ironwing.CatalogEntry" },
    AliasSpec { name: "CatalogTargetSummary", source: "Ironwing.CatalogTargetSummary" },
];

const MAVKIT_ALIASES: &[AliasSpec] = &[
    AliasSpec { name: "MissionPlan", source: "Mavkit.MissionPlan" },
    AliasSpec { name: "MissionItem", source: "Mavkit.MissionItem" },
    AliasSpec { name: "MissionCommand", source: "Mavkit.MissionCommand" },
    AliasSpec { name: "RawMissionCommand", source: "Mavkit.RawMissionCommand" },
    AliasSpec { name: "HomePosition", source: "Mavkit.HomePosition" },
    AliasSpec { name: "MissionState", source: "Mavkit.MissionState" },
    AliasSpec { name: "MissionIssue", source: "Mavkit.MissionIssue" },
    AliasSpec { name: "TransferProgress", source: "Mavkit.TransferProgress" },
    AliasSpec { name: "Param", source: "Mavkit.Param" },
    AliasSpec { name: "ParamStore", source: "Mavkit.ParamStore" },
    AliasSpec { name: "ParamProgress", source: "Mavkit.ParamOperationProgress" },
    AliasSpec { name: "ParamWriteResult", source: "Mavkit.ParamWriteResult" },
    AliasSpec { name: "FencePlan", source: "Mavkit.FencePlan" },
    AliasSpec { name: "FenceRegion", source: "Mavkit.FenceRegion" },
    AliasSpec { name: "FenceInclusionPolygon", source: "Mavkit.FenceInclusionPolygon" },
    AliasSpec { name: "FenceExclusionPolygon", source: "Mavkit.FenceExclusionPolygon" },
    AliasSpec { name: "FenceInclusionCircle", source: "Mavkit.FenceInclusionCircle" },
    AliasSpec { name: "FenceExclusionCircle", source: "Mavkit.FenceExclusionCircle" },
    AliasSpec { name: "RallyPlan", source: "Mavkit.RallyPlan" },
    AliasSpec { name: "GeoPoint2d", source: "Mavkit.GeoPoint2d" },
    AliasSpec { name: "GeoPoint3d", source: "Mavkit.GeoPoint3d" },
    AliasSpec { name: "GeoPoint3dMsl", source: "Mavkit.GeoPoint3dMsl" },
    AliasSpec { name: "GeoPoint3dRelHome", source: "Mavkit.GeoPoint3dRelHome" },
    AliasSpec { name: "GeoPoint3dTerrain", source: "Mavkit.GeoPoint3dTerrain" },
];

pub fn ironwing_json_ts() -> String {
    let mut body = String::from("import type * as Ironwing from \"./ironwing\";\n\n");
    body.push_str(json_wire_helper());
    body.push('\n');
    body.push_str("export type DomainValue<T> = JsonWire<Ironwing.DomainValue<T>>;\n");
    for alias in IRONWING_ALIASES {
        let _ = writeln!(body, "export type {} = JsonWire<{}>;", alias.name, alias.source);
    }
    body
}

pub fn mavkit_json_ts() -> String {
    let mut body = String::from("import type { JsonWire } from \"./ironwing-json\";\nimport type * as Mavkit from \"./mavkit\";\n\n");
    for alias in MAVKIT_ALIASES {
        let _ = writeln!(body, "export type {} = JsonWire<{}>;", alias.name, alias.source);
    }
    body
}

fn json_wire_helper() -> &'static str {
    "export type JsonWire<T> = T extends bigint\n  ? number\n  : T extends string | number | boolean | null | undefined\n    ? T\n    : T extends Array<infer Item>\n      ? JsonWire<Item>[]\n      : T extends object\n        ? { [K in keyof T]: JsonWire<T[K]> }\n        : T;\n"
}
