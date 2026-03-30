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
        if !self.is_fresh() {
            return None;
        }

        self.get_cached()
    }

    pub(crate) fn get_cached(&self) -> Option<Vec<u8>> {
        fs::read(self.data_path()).ok()
    }

    pub(crate) fn store(&self, data: &[u8]) -> Result<(), std::io::Error> {
        fs::create_dir_all(&self.cache_dir)?;

        let data_path = self.data_path();
        let ts_path = self.timestamp_path();

        let mut file = fs::File::create(&data_path)?;
        file.write_all(data)?;

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        fs::write(&ts_path, now.to_string())?;

        Ok(())
    }

    fn is_fresh(&self) -> bool {
        let ts_str = match fs::read_to_string(self.timestamp_path()) {
            Ok(ts_str) => ts_str,
            Err(_) => return false,
        };
        let stored_epoch: u64 = match ts_str.trim().parse() {
            Ok(stored_epoch) => stored_epoch,
            Err(_) => return false,
        };
        let stored_time = SystemTime::UNIX_EPOCH + Duration::from_secs(stored_epoch);

        let age = SystemTime::now()
            .duration_since(stored_time)
            .unwrap_or(Duration::MAX);

        age <= self.max_age
    }

    fn data_path(&self) -> PathBuf {
        self.cache_dir.join(CACHE_FILENAME)
    }

    fn timestamp_path(&self) -> PathBuf {
        self.cache_dir.join(TIMESTAMP_FILENAME)
    }
}
