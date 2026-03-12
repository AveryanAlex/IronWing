use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

const CACHE_FILENAME: &str = "manifest.json.gz";
const TIMESTAMP_FILENAME: &str = "manifest.timestamp";

pub(crate) struct ManifestCache {
    cache_dir: PathBuf,
    max_age: Duration,
}

impl ManifestCache {
    pub(crate) fn new(cache_dir: PathBuf, max_age: Duration) -> Self {
        Self { cache_dir, max_age }
    }

    pub(crate) fn get_if_fresh(&self) -> Option<Vec<u8>> {
        let ts_path = self.cache_dir.join(TIMESTAMP_FILENAME);
        let data_path = self.cache_dir.join(CACHE_FILENAME);

        let ts_str = fs::read_to_string(&ts_path).ok()?;
        let stored_epoch: u64 = ts_str.trim().parse().ok()?;
        let stored_time = SystemTime::UNIX_EPOCH + Duration::from_secs(stored_epoch);

        let age = SystemTime::now()
            .duration_since(stored_time)
            .unwrap_or(Duration::MAX);

        if age > self.max_age {
            return None;
        }

        fs::read(&data_path).ok()
    }

    pub(crate) fn store(&self, data: &[u8]) -> Result<(), std::io::Error> {
        fs::create_dir_all(&self.cache_dir)?;

        let data_path = self.cache_dir.join(CACHE_FILENAME);
        let ts_path = self.cache_dir.join(TIMESTAMP_FILENAME);

        let mut file = fs::File::create(&data_path)?;
        file.write_all(data)?;

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        fs::write(&ts_path, now.to_string())?;

        Ok(())
    }
}
