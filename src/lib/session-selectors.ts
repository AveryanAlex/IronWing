import type { SourceKind } from "../session";
import type { LinkState, VehicleState } from "../telemetry";
import type { SessionConnectionFormState } from "./platform/session";
import type { TelemetryState } from "../telemetry";
import type { DomainValue } from "./domain-status";
import type { SupportDomain } from "../support";

export type ViewTone = "neutral" | "positive" | "caution" | "critical";

export type VehicleStatusCardView = {
    sessionLabel: string;
    sessionTone: ViewTone;
    armStateText: string;
    armStateTone: ViewTone;
    modeText: string;
    systemText: string;
    dataFeedText: string;
};

export type ConnectionPanelPresentation = {
    formLocked: boolean;
    connectDisabled: boolean;
    statusLabel: string;
    statusTone: ViewTone;
};

export type OperatorSessionSummaryView = {
    sessionLabel: string;
    sessionTone: ViewTone;
    linkText: string;
    linkTone: ViewTone;
    armStateText: string;
    armStateTone: ViewTone;
    modeText: string;
    systemText: string;
    sourceText: string;
};

export type OperatorReadinessView = {
    label: string;
    tone: ViewTone;
    source: "support" | "telemetry" | "unavailable";
    supportAvailable: boolean;
    supportComplete: boolean;
    canRequestPrearmChecks: boolean | null;
};

export function selectVehicleStatusCardView(input: {
    connected: boolean;
    vehicleState: VehicleState | null;
    activeSource: SourceKind | null;
}): VehicleStatusCardView {
    const { connected, vehicleState, activeSource } = input;

    return {
        sessionLabel: connected ? "live session" : "idle session",
        sessionTone: connected ? "positive" : "neutral",
        armStateText: connected ? (vehicleState?.armed ? "ARMED" : "DISARMED") : "--",
        armStateTone: connected && vehicleState?.armed ? "positive" : "neutral",
        modeText: connected ? (vehicleState?.mode_name ?? "--") : "--",
        systemText: connected ? (vehicleState?.system_status ?? "--") : "--",
        dataFeedText: !connected ? "--" : activeSource === "playback" ? "Replay" : "Vehicle",
    };
}

export function selectConnectionPanelPresentation(input: {
    hydrated: boolean;
    isConnecting: boolean;
    connected: boolean;
    selectedTransportAvailable: boolean;
    connectionMode: SessionConnectionFormState["mode"];
    selectedBtDevice: string;
    visibleError: string | null;
}): ConnectionPanelPresentation {
    const formLocked = input.isConnecting || input.connected;
    const requiresBtDevice = input.connectionMode === "bluetooth_ble" || input.connectionMode === "bluetooth_spp";
    const missingBtDevice = requiresBtDevice && !input.selectedBtDevice.trim();
    const connectDisabled = !input.hydrated || formLocked || !input.selectedTransportAvailable || missingBtDevice;
    const statusLabel = input.isConnecting
        ? "Connecting"
        : input.connected
            ? "Connected"
            : input.visibleError
                ? "Error"
                : "Idle";

    const statusTone: ViewTone = input.isConnecting
        ? "caution"
        : input.connected
            ? "positive"
            : input.visibleError
                ? "critical"
                : "neutral";

    return {
        formLocked,
        connectDisabled,
        statusLabel,
        statusTone,
    };
}

export function selectVehiclePosition(domain: DomainValue<TelemetryState> | null | undefined) {
    const navigation = domain?.value?.navigation;

    if (
        navigation?.latitude_deg == null ||
        navigation.longitude_deg == null ||
        !Number.isFinite(navigation.latitude_deg) ||
        !Number.isFinite(navigation.longitude_deg)
    ) {
        return null;
    }

    return {
        latitude_deg: navigation.latitude_deg,
        longitude_deg: navigation.longitude_deg,
        heading_deg: navigation.heading_deg ?? 0,
    };
}

function selectSourceText(connected: boolean, activeSource: SourceKind | null): string {
    if (!connected) {
        return "--";
    }

    return activeSource === "playback" ? "Replay" : "Vehicle";
}

function describeLink(linkState: LinkState | null): { text: string; tone: ViewTone } {
    if (linkState == null) {
        return { text: "Unknown", tone: "neutral" };
    }

    if (linkState === "connecting") {
        return { text: "Connecting", tone: "caution" };
    }

    if (linkState === "connected") {
        return { text: "Connected", tone: "positive" };
    }

    if (linkState === "disconnected") {
        return { text: "Disconnected", tone: "neutral" };
    }

    return { text: linkState.error, tone: "critical" };
}

function supportCapability(domain: SupportDomain | null | undefined): boolean | null {
    const value = domain?.value;
    if (!value || typeof value !== "object") {
        return null;
    }

    const capability = (value as Record<string, unknown>).can_request_prearm_checks;
    return typeof capability === "boolean" ? capability : null;
}

export function selectOperatorSessionSummaryView(input: {
    connected: boolean;
    linkState: LinkState | null;
    vehicleState: VehicleState | null;
    activeSource: SourceKind | null;
}): OperatorSessionSummaryView {
    const link = describeLink(input.linkState);

    return {
        sessionLabel: !input.connected
            ? "idle session"
            : input.activeSource === "playback"
                ? "replay session"
                : "live session",
        sessionTone: input.connected ? "positive" : link.tone,
        linkText: link.text,
        linkTone: link.tone,
        armStateText: input.connected ? (input.vehicleState?.armed ? "ARMED" : "DISARMED") : "--",
        armStateTone: input.connected && input.vehicleState?.armed ? "positive" : "neutral",
        modeText: input.connected ? (input.vehicleState?.mode_name ?? "--") : "--",
        systemText: input.connected ? (input.vehicleState?.system_status ?? "--") : "--",
        sourceText: selectSourceText(input.connected, input.activeSource),
    };
}

export function selectOperatorReadinessView(input: {
    connected: boolean;
    support: SupportDomain | null | undefined;
    telemetryAttentionTone: ViewTone;
}): OperatorReadinessView {
    const available = Boolean(input.support?.available);
    const complete = Boolean(input.support?.complete);
    const capability = supportCapability(input.support);

    if (!input.connected) {
        return {
            label: "Link disconnected",
            tone: "neutral",
            source: "unavailable",
            supportAvailable: available,
            supportComplete: complete,
            canRequestPrearmChecks: capability,
        };
    }

    if (capability != null) {
        return {
            label: capability ? "Pre-arm checks available" : "Pre-arm checks unavailable",
            tone: capability && complete ? "positive" : "caution",
            source: "support",
            supportAvailable: available,
            supportComplete: complete,
            canRequestPrearmChecks: capability,
        };
    }

    const fallbackTone: ViewTone = input.telemetryAttentionTone === "positive"
        ? "neutral"
        : input.telemetryAttentionTone;
    const fallbackLabel = available
        ? "Support data incomplete"
        : input.telemetryAttentionTone === "critical"
            ? "Support unavailable · telemetry attention required"
            : "Support unavailable";

    return {
        label: fallbackLabel,
        tone: fallbackTone,
        source: "telemetry",
        supportAvailable: available,
        supportComplete: complete,
        canRequestPrearmChecks: null,
    };
}
