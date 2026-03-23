export type DomainProvenance = "bootstrap" | "stream" | "playback";

export type DomainValue<T> = {
  available: boolean;
  complete: boolean;
  provenance: DomainProvenance;
  value: T | null;
};

export function missingDomainValue<T>(provenance: DomainProvenance = "bootstrap"): DomainValue<T> {
  return {
    available: false,
    complete: false,
    provenance,
    value: null,
  };
}

export function availableDomainValue<T>(value: T, provenance: DomainProvenance): DomainValue<T> {
  return {
    available: true,
    complete: true,
    provenance,
    value,
  };
}
