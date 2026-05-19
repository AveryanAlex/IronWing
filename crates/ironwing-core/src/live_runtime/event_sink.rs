#[derive(Debug, Clone, Copy, Default)]
pub struct NoopEventSink;

pub trait EventSink: Clone + 'static {
    fn emit<T>(&self, event: &'static str, payload: &T)
    where
        T: serde::Serialize + Clone + Send + 'static;
}

impl EventSink for NoopEventSink {
    fn emit<T>(&self, _event: &'static str, _payload: &T)
    where
        T: serde::Serialize + Clone + Send + 'static,
    {
    }
}
