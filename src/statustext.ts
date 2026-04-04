import { listen, type UnlistenFn } from "@platform/event";
import type { DomainValue } from "./lib/domain-status";
import {
    createLatestScopedEventHandler,
    scopedEnvelopeKey,
} from "./lib/scoped-session-events";
import type { SessionEvent } from "./session";

export type StatusMessage = {
    sequence: number;
    text: string;
    severity: string;
    timestamp_usec?: number;
};

export type StatusTextState = {
    entries: StatusMessage[];
};

export type StatusTextDomain = DomainValue<StatusTextState>;
export type StatusNoticeTone = "neutral" | "positive" | "caution" | "critical";
export type StatusNoticeSeverity = "critical" | "warning" | "notice" | "info";

export type CompactStatusNotice = {
    id: string;
    text: string;
    severity: StatusNoticeSeverity;
    tone: StatusNoticeTone;
    sequence: number | null;
    timestampUsec: number | null;
};

export async function subscribeStatusText(
    cb: (msg: StatusMessage) => void,
): Promise<UnlistenFn> {
    let deliveredWithoutSequence = 0;
    let lastDeliveredSequence = -1;
    let envelopeKey = "";

    const handleEvent = createLatestScopedEventHandler<StatusTextDomain>((event) => {
        const nextEnvelopeKey = scopedEnvelopeKey(event.envelope);
        const entries = readLiveStatusText(event.value);
        const hasSequence = entries.some((entry) => entry.sequence != null);

        if (nextEnvelopeKey !== envelopeKey) {
            deliveredWithoutSequence = 0;
            lastDeliveredSequence = -1;
            envelopeKey = nextEnvelopeKey;
        }

        if (!hasSequence) {
            if (entries.length < deliveredWithoutSequence) {
                deliveredWithoutSequence = 0;
            }
            for (const entry of entries.slice(deliveredWithoutSequence)) {
                cb(entry);
            }
            deliveredWithoutSequence = entries.length;
            return;
        }

        for (const entry of entries) {
            const sequence = entry.sequence;
            if (sequence > lastDeliveredSequence) {
                cb(entry);
                lastDeliveredSequence = sequence;
            }
        }
    });

    return listen<SessionEvent<StatusTextDomain>>("status_text://state", (event) => handleEvent(event.payload));
}

export function readLiveStatusText(domain: StatusTextDomain | null | undefined): StatusMessage[] {
    return domain?.value?.entries ?? [];
}

export function readPlaybackStatusText(
    domain: StatusTextDomain | null | undefined,
    cursorUsec: number,
): StatusMessage[] {
    return readLiveStatusText(domain).filter((entry) => (entry.timestamp_usec ?? Number.MIN_SAFE_INTEGER) <= cursorUsec);
}

function toFiniteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toTrimmedText(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function severityProfile(value: unknown): {
    severity: StatusNoticeSeverity;
    tone: StatusNoticeTone;
    rank: number;
} {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

    if (
        normalized.includes("panic")
        || normalized.includes("emerg")
        || normalized.includes("alert")
        || normalized.includes("critical")
        || normalized.includes("error")
        || normalized.includes("fault")
    ) {
        return { severity: "critical", tone: "critical", rank: 0 };
    }

    if (normalized.includes("warn")) {
        return { severity: "warning", tone: "caution", rank: 1 };
    }

    if (normalized.includes("notice")) {
        return { severity: "notice", tone: "neutral", rank: 2 };
    }

    return { severity: "info", tone: "neutral", rank: 3 };
}

function normalizeNotice(entry: unknown): (CompactStatusNotice & { rank: number }) | null {
    if (!entry || typeof entry !== "object") {
        return null;
    }

    const record = entry as Record<string, unknown>;
    const text = toTrimmedText(record.text);
    if (!text) {
        return null;
    }

    const sequence = toFiniteNumber(record.sequence);
    const timestampUsec = toFiniteNumber(record.timestamp_usec);
    const profile = severityProfile(record.severity);
    const id = sequence != null
        ? `seq:${sequence}`
        : timestampUsec != null
            ? `ts:${timestampUsec}:${text}`
            : `text:${profile.severity}:${text}`;

    return {
        id,
        text,
        severity: profile.severity,
        tone: profile.tone,
        sequence,
        timestampUsec,
        rank: profile.rank,
    };
}

function identityOrder(notice: CompactStatusNotice): number {
    return notice.sequence ?? notice.timestampUsec ?? Number.MAX_SAFE_INTEGER;
}

export function selectCompactStatusNotices(
    domain: StatusTextDomain | null | undefined,
    limit = 3,
): CompactStatusNotice[] {
    const entries = domain?.value?.entries;
    if (!Array.isArray(entries) || limit <= 0) {
        return [];
    }

    const deduped = new Map<string, CompactStatusNotice & { rank: number }>();
    for (const entry of entries) {
        const normalized = normalizeNotice(entry);
        if (normalized) {
            deduped.set(normalized.id, normalized);
        }
    }

    return [...deduped.values()]
        .sort((left, right) =>
            left.rank - right.rank
            || (right.sequence ?? -1) - (left.sequence ?? -1)
            || (right.timestampUsec ?? -1) - (left.timestampUsec ?? -1)
            || left.text.localeCompare(right.text),
        )
        .slice(0, limit)
        .sort((left, right) =>
            identityOrder(left) - identityOrder(right)
            || left.rank - right.rank
            || left.id.localeCompare(right.id),
        )
        .map(({ rank: _rank, ...notice }) => notice);
}
