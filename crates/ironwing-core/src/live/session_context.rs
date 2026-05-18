use crate::ipc::{SessionConnection, VehicleState};

#[derive(Debug, Clone, PartialEq)]
pub struct SessionContext {
    pub connection: SessionConnection,
    pub vehicle_state: Option<VehicleState>,
    pub home_position: Option<mavkit::HomePosition>,
}

impl SessionContext {
    pub fn new() -> Self {
        Self {
            connection: SessionConnection::Disconnected,
            vehicle_state: None,
            home_position: None,
        }
    }

    pub fn reset(&mut self) {
        self.connection = SessionConnection::Disconnected;
        self.vehicle_state = None;
        self.home_position = None;
    }
}

impl Default for SessionContext {
    fn default() -> Self {
        Self::new()
    }
}
