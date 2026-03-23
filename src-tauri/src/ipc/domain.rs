#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct DomainValue<T> {
    pub available: bool,
    pub complete: bool,
    pub provenance: DomainProvenance,
    pub value: Option<T>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DomainProvenance {
    Bootstrap,
    Stream,
    Playback,
}

impl<T> DomainValue<T> {
    pub(crate) fn missing(provenance: DomainProvenance) -> Self {
        Self {
            available: false,
            complete: false,
            provenance,
            value: None,
        }
    }

    pub(crate) fn present(value: T, provenance: DomainProvenance) -> Self {
        Self {
            available: true,
            complete: true,
            provenance,
            value: Some(value),
        }
    }
}
