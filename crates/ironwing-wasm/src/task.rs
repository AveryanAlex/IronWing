use futures::future::{AbortHandle, Abortable};

pub struct LocalTaskSet {
    handles: Vec<AbortHandle>,
}

impl LocalTaskSet {
    pub fn new() -> Self {
        Self { handles: Vec::new() }
    }

    pub fn spawn(&mut self, future: impl std::future::Future<Output = ()> + 'static) {
        let (handle, registration) = AbortHandle::new_pair();
        self.handles.push(handle);
        wasm_bindgen_futures::spawn_local(async move {
            let _ = Abortable::new(future, registration).await;
        });
    }

    pub fn abort_all(&mut self) {
        for handle in self.handles.drain(..) {
            handle.abort();
        }
    }
}

impl Default for LocalTaskSet {
    fn default() -> Self {
        Self::new()
    }
}
