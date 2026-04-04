import { derived, type Readable } from "svelte/store";

import type { CompactStatusNotice, StatusTextDomain } from "../../statustext";
import { selectCompactStatusNotices } from "../../statustext";
import { createSessionLifecycleView } from "../platform/session";
import {
    selectOperatorReadinessView,
    selectOperatorSessionSummaryView,
    type OperatorReadinessView,
    type OperatorSessionSummaryView,
    type ViewTone,
} from "../session-selectors";
import {
    selectOperatorTelemetryView,
    type OperatorTelemetryView,
} from "../telemetry-selectors";
import type { SessionStoreState } from "./session-state";

export type OperatorWorkspaceQualityView = {
    disconnected: boolean;
    degraded: boolean;
    stale: boolean;
    telemetry: OperatorTelemetryView["quality"];
    support: {
        available: boolean;
        complete: boolean;
        degraded: boolean;
    };
    notices: {
        available: boolean;
        complete: boolean;
        degraded: boolean;
        count: number;
    };
};

export type OperatorWorkspaceView = {
    connected: boolean;
    isConnecting: boolean;
    activeEnvelope: SessionStoreState["activeEnvelope"];
    activeSource: SessionStoreState["activeSource"];
    lastPhase: SessionStoreState["lastPhase"];
    lastError: string | null;
    lifecycle: OperatorSessionSummaryView;
    telemetry: OperatorTelemetryView;
    primaryMetrics: OperatorTelemetryView["primary"];
    secondaryMetrics: OperatorTelemetryView["secondary"];
    readiness: OperatorReadinessView;
    notices: CompactStatusNotice[];
    quality: OperatorWorkspaceQualityView;
    attentionTone: ViewTone;
};

function toneRank(tone: ViewTone): number {
    switch (tone) {
        case "critical":
            return 3;
        case "caution":
            return 2;
        case "positive":
            return 1;
        case "neutral":
        default:
            return 0;
    }
}

function highestTone(...tones: ViewTone[]): ViewTone {
    return tones.reduce<ViewTone>(
        (highest, next) => toneRank(next) > toneRank(highest) ? next : highest,
        "neutral",
    );
}

function scopeKey(state: Pick<SessionStoreState, "activeEnvelope">): string {
    const envelope = state.activeEnvelope;
    if (!envelope) {
        return "none";
    }

    return [
        envelope.session_id,
        envelope.source_kind,
        envelope.seek_epoch,
        envelope.reset_revision,
    ].join(":");
}

function resolveOperatorNotices(
    domain: StatusTextDomain,
    previous: CompactStatusNotice[],
): CompactStatusNotice[] {
    const entries = domain?.value?.entries;
    if (!Array.isArray(entries)) {
        return previous;
    }

    const next = selectCompactStatusNotices(domain);
    if (next.length > 0) {
        return next;
    }

    return entries.length === 0 ? [] : previous;
}

function resolveQuality(input: {
    connected: boolean;
    telemetry: OperatorTelemetryView;
    readiness: OperatorReadinessView;
    support: SessionStoreState["support"];
    notices: CompactStatusNotice[];
    statusText: SessionStoreState["statusText"];
    lastError: string | null;
}): OperatorWorkspaceQualityView {
    const supportDegraded = input.connected
        && (!input.support.available || !input.support.complete || input.readiness.source !== "support");
    const statusEntriesUsable = Array.isArray(input.statusText.value?.entries);
    const noticesDegraded = input.connected
        && (!input.statusText.available || !input.statusText.complete || !statusEntriesUsable);
    const stale = input.telemetry.quality.stale || (!input.connected && input.notices.length > 0);

    return {
        disconnected: !input.connected,
        degraded: stale
            || input.telemetry.quality.degraded
            || supportDegraded
            || noticesDegraded
            || Boolean(input.lastError),
        stale,
        telemetry: input.telemetry.quality,
        support: {
            available: input.support.available,
            complete: input.support.complete,
            degraded: supportDegraded,
        },
        notices: {
            available: input.statusText.available,
            complete: input.statusText.complete,
            degraded: noticesDegraded,
            count: input.notices.length,
        },
    };
}

export function createOperatorWorkspaceViewStore(store: Readable<SessionStoreState>) {
    let previous: OperatorWorkspaceView | null = null;
    let previousScope = "none";

    return derived(store, ($session): OperatorWorkspaceView => {
        const currentScope = scopeKey($session);
        const prior = currentScope === previousScope ? previous : null;
        const lifecycle = createSessionLifecycleView(
            $session.activeEnvelope,
            $session.sessionDomain,
            $session.optimisticConnection,
        );
        const connected = lifecycle.linkState === "connected";
        const isConnecting = lifecycle.linkState === "connecting";
        const telemetry = selectOperatorTelemetryView({
            connected,
            telemetryDomain: $session.telemetryDomain,
            previous: prior?.telemetry ?? null,
        });
        const readiness = selectOperatorReadinessView({
            connected,
            support: $session.support,
            telemetryAttentionTone: telemetry.attentionTone,
        });
        const notices = resolveOperatorNotices($session.statusText, prior?.notices ?? []);
        const summary = selectOperatorSessionSummaryView({
            connected,
            linkState: lifecycle.linkState,
            vehicleState: lifecycle.session?.vehicle_state ?? null,
            activeSource: $session.activeSource,
        });
        const quality = resolveQuality({
            connected,
            telemetry,
            readiness,
            support: $session.support,
            notices,
            statusText: $session.statusText,
            lastError: $session.lastError,
        });

        const next: OperatorWorkspaceView = {
            connected,
            isConnecting,
            activeEnvelope: $session.activeEnvelope,
            activeSource: $session.activeSource,
            lastPhase: $session.lastPhase,
            lastError: $session.lastError,
            lifecycle: summary,
            telemetry,
            primaryMetrics: telemetry.primary,
            secondaryMetrics: telemetry.secondary,
            readiness,
            notices,
            quality,
            attentionTone: highestTone(
                telemetry.attentionTone,
                readiness.tone,
                notices[0]?.tone ?? "neutral",
                quality.stale || quality.degraded ? "caution" : "neutral",
                $session.lastError ? "critical" : "neutral",
            ),
        };

        previous = next;
        previousScope = currentScope;
        return next;
    });
}

export type OperatorWorkspaceViewStore = ReturnType<typeof createOperatorWorkspaceViewStore>;
