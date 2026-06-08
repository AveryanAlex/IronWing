use crate::transport::TransportDescriptor;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Capability {
    Supported,
    Maybe { reason: String },
    Unsupported { reason: String },
}

impl Capability {
    pub const fn supported() -> Self {
        Self::Supported
    }

    pub fn maybe(reason: impl Into<String>) -> Self {
        Self::Maybe {
            reason: reason.into(),
        }
    }

    pub fn unsupported(reason: impl Into<String>) -> Self {
        Self::Unsupported {
            reason: reason.into(),
        }
    }
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct RuntimeCapabilities {
    pub transports: Vec<TransportDescriptor>,
    pub firmware_install_update: Capability,
    pub log_library_filesystem: Capability,
    pub recording_filesystem: Capability,
    pub mission_transfer: Capability,
    pub parameter_transfer: Capability,
}

impl RuntimeCapabilities {
    pub fn web(transports: Vec<TransportDescriptor>) -> Self {
        Self {
            transports,
            firmware_install_update: Capability::unsupported(
                "firmware install/update is not available in the browser runtime",
            ),
            log_library_filesystem: Capability::unsupported(
                "native log-library filesystem access is not available in the browser runtime",
            ),
            recording_filesystem: Capability::unsupported(
                "native recording filesystem access is not available in the browser runtime",
            ),
            mission_transfer: Capability::maybe(
                "mission transfer depends on the active MAVLink browser transport",
            ),
            parameter_transfer: Capability::maybe(
                "parameter transfer depends on the active MAVLink browser transport",
            ),
        }
    }

    pub fn native(transports: Vec<TransportDescriptor>) -> Self {
        Self {
            transports,
            firmware_install_update: Capability::supported(),
            log_library_filesystem: Capability::supported(),
            recording_filesystem: Capability::supported(),
            mission_transfer: Capability::supported(),
            parameter_transfer: Capability::supported(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_capabilities_serialize_as_typed_results() {
        let value = serde_json::to_value(Capability::unsupported("browser runtime"))
            .expect("serialize capability");

        assert_eq!(value["kind"], "unsupported");
        assert_eq!(value["reason"], "browser runtime");
    }
}
