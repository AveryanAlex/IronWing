use std::future::Future;
use std::time::Duration;

pub trait LocalTaskSpawner {
    fn spawn_local<F>(&mut self, future: F)
    where
        F: Future<Output = ()> + 'static;
}

pub trait SendTaskSpawner {
    fn spawn_send<F>(&mut self, future: F)
    where
        F: Future<Output = ()> + Send + 'static;
}

pub trait LocalTimer: Clone + 'static {
    type Sleep: Future<Output = ()> + 'static;

    fn sleep(&self, duration: Duration) -> Self::Sleep;
}

pub trait SendTimer: Clone + Send + Sync + 'static {
    type Sleep: Future<Output = ()> + Send + 'static;

    fn sleep(&self, duration: Duration) -> Self::Sleep;
}

pub trait TelemetryIntervalProvider: Clone + 'static {
    fn telemetry_interval(&self) -> Duration;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FixedTelemetryInterval {
    duration: Duration,
}

impl FixedTelemetryInterval {
    pub const fn new(duration: Duration) -> Self {
        Self { duration }
    }

    pub const fn from_millis(milliseconds: u64) -> Self {
        Self::new(Duration::from_millis(milliseconds))
    }
}

impl TelemetryIntervalProvider for FixedTelemetryInterval {
    fn telemetry_interval(&self) -> Duration {
        self.duration
    }
}
