use crate::artifact;
use crate::types::{
    DfuDeviceInfo, DfuRecoveryOutcome, DfuRecoveryPhase, DfuRecoverySource, FirmwareError,
};
#[cfg(feature = "dfu-core")]
use futures::{FutureExt, StreamExt};
use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

const RESET_CONFIRMATION_TIMEOUT: Duration = Duration::from_secs(3);
const RESET_CONFIRMATION_POLL_INTERVAL: Duration = Duration::from_millis(100);

#[cfg(feature = "dfu-core")]
pub const STM32_DFUSE_FLASH_BASE: u32 = 0x0800_0000;
#[cfg(feature = "dfu-core")]
pub const STM32_DFUSE_TRANSFER_SIZE: u16 = 2048;
#[cfg(feature = "dfu-core")]
const STM32_DFUSE_ERASE_GRANULARITY: u32 = 16 * 1024;
#[cfg(feature = "dfu-core")]
const STM32_DFUSE_FLASH_SIZE_2MB: u32 = 2 * 1024 * 1024;

#[cfg(target_arch = "wasm32")]
pub type AsyncDfuFuture<'a, T> = Pin<Box<dyn Future<Output = T> + 'a>>;
#[cfg(not(target_arch = "wasm32"))]
pub type AsyncDfuFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;
#[cfg(target_arch = "wasm32")]
pub type AsyncDfuProgressCallback<'a> = Box<dyn FnMut(usize, usize) + 'a>;
#[cfg(not(target_arch = "wasm32"))]
pub type AsyncDfuProgressCallback<'a> = Box<dyn FnMut(usize, usize) + Send + 'a>;

#[cfg(target_arch = "wasm32")]
pub trait DfuAsyncCallbackThreadBound {}
#[cfg(target_arch = "wasm32")]
impl<T> DfuAsyncCallbackThreadBound for T {}

#[cfg(not(target_arch = "wasm32"))]
pub trait DfuAsyncCallbackThreadBound: Send {}
#[cfg(not(target_arch = "wasm32"))]
impl<T: Send> DfuAsyncCallbackThreadBound for T {}

pub trait DfuUsbAccess {
    fn open_device(&self, device: &DfuDeviceInfo) -> Result<(), FirmwareError>;

    fn download(
        &self,
        data: &[u8],
        progress: Box<dyn FnMut(usize, usize) + Send + '_>,
    ) -> Result<(), FirmwareError>;

    fn detach_and_reset(&self) -> Result<ResetDisposition, FirmwareError>;
}

pub trait AsyncDfuUsbAccess {
    fn open_device<'a>(
        &'a mut self,
        device: &'a DfuDeviceInfo,
    ) -> AsyncDfuFuture<'a, Result<(), FirmwareError>>;

    fn download<'a>(
        &'a mut self,
        data: &'a [u8],
        progress: AsyncDfuProgressCallback<'a>,
    ) -> AsyncDfuFuture<'a, Result<(), FirmwareError>>;

    fn detach_and_reset<'a>(
        &'a mut self,
    ) -> AsyncDfuFuture<'a, Result<ResetDisposition, FirmwareError>>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResetDisposition {
    Confirmed,
    Unconfirmed,
}

fn reset_confirmation_attempts(timeout: Duration, poll_interval: Duration) -> usize {
    if poll_interval.is_zero() {
        return 1;
    }

    timeout.as_millis().div_ceil(poll_interval.as_millis()) as usize + 1
}

pub fn confirm_reset_with_presence_check(
    timeout: Duration,
    poll_interval: Duration,
    is_target_present: impl FnMut() -> Result<bool, FirmwareError>,
    sleep: impl FnMut(Duration),
) -> ResetDisposition {
    confirm_reset_with_device_checks(
        timeout,
        poll_interval,
        is_target_present,
        || Ok(false),
        sleep,
    )
}

pub fn confirm_reset_with_device_checks(
    timeout: Duration,
    poll_interval: Duration,
    mut is_dfu_target_present: impl FnMut() -> Result<bool, FirmwareError>,
    mut is_app_target_present: impl FnMut() -> Result<bool, FirmwareError>,
    mut sleep: impl FnMut(Duration),
) -> ResetDisposition {
    let attempts = reset_confirmation_attempts(timeout, poll_interval);

    for attempt in 0..attempts {
        match is_dfu_target_present() {
            Ok(false) => return ResetDisposition::Confirmed,
            Ok(true) => {}
            Err(_) => return ResetDisposition::Unconfirmed,
        }

        match is_app_target_present() {
            Ok(true) => return ResetDisposition::Confirmed,
            Ok(false) => {}
            Err(_) => return ResetDisposition::Unconfirmed,
        }

        if attempt + 1 < attempts {
            sleep(poll_interval);
        }
    }

    ResetDisposition::Unconfirmed
}

pub async fn confirm_reset_with_presence_check_async<DfuCheck, DfuFuture, Sleep, SleepFuture>(
    timeout: Duration,
    poll_interval: Duration,
    is_target_present: DfuCheck,
    sleep: Sleep,
) -> ResetDisposition
where
    DfuCheck: FnMut() -> DfuFuture,
    DfuFuture: Future<Output = Result<bool, FirmwareError>>,
    Sleep: FnMut(Duration) -> SleepFuture,
    SleepFuture: Future<Output = ()>,
{
    confirm_reset_with_device_checks_async(
        timeout,
        poll_interval,
        is_target_present,
        || async { Ok(false) },
        sleep,
    )
    .await
}

pub async fn confirm_reset_with_device_checks_async<
    DfuCheck,
    DfuFuture,
    AppCheck,
    AppFuture,
    Sleep,
    SleepFuture,
>(
    timeout: Duration,
    poll_interval: Duration,
    mut is_dfu_target_present: DfuCheck,
    mut is_app_target_present: AppCheck,
    mut sleep: Sleep,
) -> ResetDisposition
where
    DfuCheck: FnMut() -> DfuFuture,
    DfuFuture: Future<Output = Result<bool, FirmwareError>>,
    AppCheck: FnMut() -> AppFuture,
    AppFuture: Future<Output = Result<bool, FirmwareError>>,
    Sleep: FnMut(Duration) -> SleepFuture,
    SleepFuture: Future<Output = ()>,
{
    let attempts = reset_confirmation_attempts(timeout, poll_interval);

    for attempt in 0..attempts {
        match is_dfu_target_present().await {
            Ok(false) => return ResetDisposition::Confirmed,
            Ok(true) => {}
            Err(_) => return ResetDisposition::Unconfirmed,
        }

        match is_app_target_present().await {
            Ok(true) => return ResetDisposition::Confirmed,
            Ok(false) => {}
            Err(_) => return ResetDisposition::Unconfirmed,
        }

        if attempt + 1 < attempts {
            sleep(poll_interval).await;
        }
    }

    ResetDisposition::Unconfirmed
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DfuUsbDeviceIdentity {
    vid: u16,
    pid: u16,
    serial_number: Option<String>,
    product: Option<String>,
}

impl DfuUsbDeviceIdentity {
    pub fn new(vid: u16, pid: u16, serial_number: Option<&str>, product: Option<&str>) -> Self {
        Self {
            vid,
            pid,
            serial_number: normalize_usb_device_identity_text(serial_number),
            product: normalize_usb_device_identity_text(product),
        }
    }

    pub fn from_device_info(device: &DfuDeviceInfo) -> Self {
        Self::new(
            device.vid,
            device.pid,
            device.serial_number.as_deref(),
            device.product.as_deref(),
        )
    }

    pub fn with_missing_metadata(
        mut self,
        serial_number: Option<&str>,
        product: Option<&str>,
    ) -> Self {
        if self.serial_number.is_none() {
            self.serial_number = normalize_usb_device_identity_text(serial_number);
        }
        if self.product.is_none() {
            self.product = normalize_usb_device_identity_text(product);
        }
        self
    }

    pub fn matches(&self, candidate: &Self) -> bool {
        if self.vid != candidate.vid || self.pid != candidate.pid {
            return false;
        }

        if let Some(serial_number) = self.serial_number.as_deref() {
            return candidate.serial_number.as_deref() == Some(serial_number);
        }

        if let Some(product) = self.product.as_deref() {
            return candidate.product.as_deref() == Some(product);
        }

        true
    }
}

pub fn normalize_usb_device_identity_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub fn is_unambiguous_reset_confirmation_match(initial_matching_count: usize) -> bool {
    initial_matching_count == 1
}

pub const fn default_reset_confirmation_timeout() -> Duration {
    RESET_CONFIRMATION_TIMEOUT
}

pub const fn default_reset_confirmation_poll_interval() -> Duration {
    RESET_CONFIRMATION_POLL_INTERVAL
}

pub fn validate_stm32_dfu_device(device: &DfuDeviceInfo) -> Result<(), FirmwareError> {
    if !crate::discovery::is_stm32_dfu(device) {
        return Err(FirmwareError::ArtifactInvalid {
            reason: format!(
                "device {:04x}:{:04x} is not an STM32 DFU device (expected {:04x}:{:04x}); \
                 only STM32 DFU-mode recovery is supported",
                device.vid,
                device.pid,
                crate::discovery::STM32_DFU_VID,
                crate::discovery::STM32_DFU_PID,
            ),
        });
    }
    Ok(())
}

pub fn classify_usb_error(error: &FirmwareError) -> FirmwareError {
    match error {
        FirmwareError::UsbAccessDenied { guidance } => FirmwareError::UsbAccessDenied {
            guidance: format!("{guidance}. {}", usb_driver_guidance()),
        },
        other => other.clone(),
    }
}

pub fn usb_driver_guidance() -> &'static str {
    "On Windows, install the WinUSB driver using Zadig (https://zadig.akeo.ie): \
     select the STM32 BOOTLOADER device and replace its driver with WinUSB. \
     On Linux, ensure your user has USB permissions (udev rules). \
     On macOS, no extra driver is needed"
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum DfuRecoveryResult {
    Verified,
    Cancelled,
    ResetUnconfirmed,
    Failed { reason: String },
    DriverGuidance { guidance: String },
    PlatformUnsupported,
}

impl DfuRecoveryResult {
    pub fn to_outcome(&self) -> DfuRecoveryOutcome {
        match self {
            Self::Verified => DfuRecoveryOutcome::Verified,
            Self::Cancelled => DfuRecoveryOutcome::Cancelled,
            Self::ResetUnconfirmed => DfuRecoveryOutcome::ResetUnconfirmed,
            Self::Failed { reason } => DfuRecoveryOutcome::Failed {
                reason: reason.clone(),
            },
            Self::DriverGuidance { guidance } => {
                DfuRecoveryOutcome::UnsupportedBootloaderInstallationPath {
                    guidance: guidance.clone(),
                }
            }
            Self::PlatformUnsupported => {
                DfuRecoveryOutcome::UnsupportedBootloaderInstallationPath {
                    guidance: "DFU recovery is not supported on this platform".into(),
                }
            }
        }
    }
}

pub fn apj_to_dfu_bin(apj_bytes: &[u8]) -> Result<Vec<u8>, FirmwareError> {
    let parsed = artifact::parse_apj(apj_bytes)?;
    if parsed.extf.is_some() {
        return Err(FirmwareError::ManualDfuRecoveryRequiresSerialPath {
            guidance: "this APJ contains an external-flash payload; DFU recovery can only write internal flash. Use the serial bootloader path for boards with external flash".into(),
        });
    }
    Ok(parsed.image)
}

pub fn resolve_preloaded_dfu_source(source: DfuRecoverySource) -> Result<Vec<u8>, FirmwareError> {
    match source {
        DfuRecoverySource::LocalBinBytes { data } => Ok(data),
        DfuRecoverySource::LocalApjBytes { data } => apj_to_dfu_bin(&data),
        DfuRecoverySource::OfficialBootloader { .. } => {
            Err(FirmwareError::UnsupportedDfuBootloaderTarget {
                guidance: "official bootloader sources must be resolved before DFU transfer starts"
                    .into(),
            })
        }
    }
}

#[cfg(feature = "dfu-core")]
pub fn stm32_dfuse_protocol() -> dfu_core::DfuProtocol<dfu_core::memory_layout::MemoryLayout> {
    dfu_core::DfuProtocol::Dfuse {
        address: STM32_DFUSE_FLASH_BASE,
        memory_layout: stm32_dfuse_memory_layout(),
    }
}

#[cfg(feature = "dfu-core")]
pub fn stm32_dfuse_memory_layout() -> dfu_core::memory_layout::MemoryLayout {
    let page_count = (STM32_DFUSE_FLASH_SIZE_2MB / STM32_DFUSE_ERASE_GRANULARITY) as usize;
    let pages: Vec<dfu_core::memory_layout::MemoryPage> = (0..page_count)
        .map(|_| STM32_DFUSE_ERASE_GRANULARITY)
        .collect();
    dfu_core::memory_layout::MemoryLayout::from(pages)
}

#[cfg(feature = "dfu-core")]
pub const fn stm32_dfuse_functional_descriptor()
-> dfu_core::functional_descriptor::FunctionalDescriptor {
    dfu_core::functional_descriptor::FunctionalDescriptor {
        can_download: true,
        can_upload: false,
        manifestation_tolerant: false,
        will_detach: true,
        detach_timeout: 5000,
        transfer_size: STM32_DFUSE_TRANSFER_SIZE,
        dfu_version: (1, 1),
    }
}

#[cfg(feature = "dfu-core")]
pub async fn download_dfu_core_async_with_progress<IO, E>(
    mut dfu: dfu_core::asynchronous::DfuAsync<IO, E>,
    data: &[u8],
    mut progress: impl FnMut(usize, usize),
    map_error: impl Fn(E) -> FirmwareError,
) -> Result<Option<dfu_core::asynchronous::DfuAsync<IO, E>>, FirmwareError>
where
    IO: dfu_core::asynchronous::DfuAsyncIo<Read = usize, Write = usize, Reset = (), Error = E>,
    E: From<std::io::Error> + From<dfu_core::Error> + 'static,
{
    let total = data.len();
    let (progress_tx, mut progress_rx) = futures::channel::mpsc::unbounded::<usize>();
    dfu.with_progress(move |written| {
        let _ = progress_tx.unbounded_send(written);
    });

    progress(0, total);
    let download = dfu.download_from_slice(data).fuse();
    futures::pin_mut!(download);
    let mut bytes_written = 0usize;
    let mut next_dfu = loop {
        futures::select! {
            chunk = progress_rx.next().fuse() => {
                if let Some(chunk) = chunk {
                    bytes_written = bytes_written.saturating_add(chunk).min(total);
                    progress(bytes_written, total);
                }
            },
            result = download => break result.map_err(&map_error)?,
        }
    };

    while let Ok(chunk) = progress_rx.try_recv() {
        bytes_written = bytes_written.saturating_add(chunk).min(total);
        progress(bytes_written, total);
    }

    if let Some(dfu) = next_dfu.as_mut() {
        dfu.with_progress(|_| {});
    }

    progress(total, total);
    Ok(next_dfu)
}

pub fn execute_dfu_recovery<D: DfuUsbAccess>(
    usb: &D,
    device: &DfuDeviceInfo,
    bin_data: &[u8],
    is_cancelled: &dyn Fn() -> bool,
    progress: impl FnMut(usize, usize) + Send,
) -> DfuRecoveryResult {
    execute_dfu_recovery_with_phases(usb, device, bin_data, is_cancelled, |_| {}, progress)
}

pub fn execute_dfu_recovery_with_phases<D: DfuUsbAccess>(
    usb: &D,
    device: &DfuDeviceInfo,
    bin_data: &[u8],
    is_cancelled: &dyn Fn() -> bool,
    mut on_phase: impl FnMut(DfuRecoveryPhase) + Send,
    mut progress: impl FnMut(usize, usize) + Send,
) -> DfuRecoveryResult {
    if let Some(result) = validate_dfu_start(device, bin_data, is_cancelled, &mut on_phase) {
        return result;
    }

    if let Err(e) = usb.open_device(device) {
        return map_open_device_error(e);
    }

    if is_cancelled() {
        return DfuRecoveryResult::Cancelled;
    }

    on_phase(DfuRecoveryPhase::Erasing);

    let mut download_started = false;

    if let Err(e) = usb.download(
        bin_data,
        Box::new(|written, total| {
            if !download_started {
                download_started = true;
                on_phase(DfuRecoveryPhase::Downloading);
            }
            progress(written, total);
        }),
    ) {
        return map_download_error(e);
    }

    finish_dfu_after_download(
        usb.detach_and_reset(),
        download_started,
        is_cancelled,
        on_phase,
    )
}

pub async fn execute_async_dfu_recovery<A, C>(
    usb: &mut A,
    device: &DfuDeviceInfo,
    bin_data: &[u8],
    is_cancelled: &C,
    progress: impl FnMut(usize, usize) + DfuAsyncCallbackThreadBound,
) -> DfuRecoveryResult
where
    A: AsyncDfuUsbAccess,
    C: Fn() -> bool + ?Sized,
{
    execute_async_dfu_recovery_with_phases(usb, device, bin_data, is_cancelled, |_| {}, progress)
        .await
}

pub async fn execute_async_dfu_recovery_with_phases<A, C>(
    usb: &mut A,
    device: &DfuDeviceInfo,
    bin_data: &[u8],
    is_cancelled: &C,
    mut on_phase: impl FnMut(DfuRecoveryPhase) + DfuAsyncCallbackThreadBound,
    mut progress: impl FnMut(usize, usize) + DfuAsyncCallbackThreadBound,
) -> DfuRecoveryResult
where
    A: AsyncDfuUsbAccess,
    C: Fn() -> bool + ?Sized,
{
    if let Some(result) = validate_dfu_start(device, bin_data, is_cancelled, &mut on_phase) {
        return result;
    }

    if let Err(e) = usb.open_device(device).await {
        return map_open_device_error(e);
    }

    if is_cancelled() {
        return DfuRecoveryResult::Cancelled;
    }

    on_phase(DfuRecoveryPhase::Erasing);

    let mut download_started = false;

    if let Err(e) = usb
        .download(
            bin_data,
            Box::new(|written, total| {
                if !download_started {
                    download_started = true;
                    on_phase(DfuRecoveryPhase::Downloading);
                }
                progress(written, total);
            }),
        )
        .await
    {
        return map_download_error(e);
    }

    let reset = usb.detach_and_reset().await;
    finish_dfu_after_download(reset, download_started, is_cancelled, on_phase)
}

fn validate_dfu_start(
    device: &DfuDeviceInfo,
    bin_data: &[u8],
    is_cancelled: &(impl Fn() -> bool + ?Sized),
    on_phase: &mut impl FnMut(DfuRecoveryPhase),
) -> Option<DfuRecoveryResult> {
    if is_cancelled() {
        return Some(DfuRecoveryResult::Cancelled);
    }

    on_phase(DfuRecoveryPhase::Detecting);

    if let Err(e) = validate_stm32_dfu_device(device) {
        return Some(DfuRecoveryResult::Failed {
            reason: e.to_string(),
        });
    }

    if bin_data.is_empty() {
        return Some(DfuRecoveryResult::Failed {
            reason: "recovery binary is empty".into(),
        });
    }

    None
}

fn map_open_device_error(error: FirmwareError) -> DfuRecoveryResult {
    match classify_usb_error(&error) {
        FirmwareError::UsbAccessDenied { guidance } => {
            DfuRecoveryResult::DriverGuidance { guidance }
        }
        other => DfuRecoveryResult::Failed {
            reason: other.to_string(),
        },
    }
}

fn map_download_error(error: FirmwareError) -> DfuRecoveryResult {
    DfuRecoveryResult::Failed {
        reason: format!("DFU download failed: {error}"),
    }
}

fn finish_dfu_after_download(
    reset: Result<ResetDisposition, FirmwareError>,
    download_started: bool,
    is_cancelled: &(impl Fn() -> bool + ?Sized),
    mut on_phase: impl FnMut(DfuRecoveryPhase),
) -> DfuRecoveryResult {
    if !download_started {
        on_phase(DfuRecoveryPhase::Downloading);
    }

    if is_cancelled() {
        return DfuRecoveryResult::Cancelled;
    }

    on_phase(DfuRecoveryPhase::ManifestingOrResetting);

    match reset {
        Ok(ResetDisposition::Confirmed) => DfuRecoveryResult::Verified,
        Ok(ResetDisposition::Unconfirmed) => DfuRecoveryResult::ResetUnconfirmed,
        Err(e) => DfuRecoveryResult::Failed {
            reason: format!("DFU reset failed after download: {e}"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockDfuUsb {
        open_result: Result<(), FirmwareError>,
        download_result: Result<(), FirmwareError>,
        detach_result: Result<ResetDisposition, FirmwareError>,
    }

    impl MockDfuUsb {
        fn success() -> Self {
            Self {
                open_result: Ok(()),
                download_result: Ok(()),
                detach_result: Ok(ResetDisposition::Confirmed),
            }
        }
    }

    impl DfuUsbAccess for MockDfuUsb {
        fn open_device(&self, _device: &DfuDeviceInfo) -> Result<(), FirmwareError> {
            self.open_result.clone()
        }

        fn download(
            &self,
            data: &[u8],
            mut progress: Box<dyn FnMut(usize, usize) + Send + '_>,
        ) -> Result<(), FirmwareError> {
            progress(data.len(), data.len());
            self.download_result.clone()
        }

        fn detach_and_reset(&self) -> Result<ResetDisposition, FirmwareError> {
            self.detach_result.clone()
        }
    }

    fn stm32_dfu_device() -> DfuDeviceInfo {
        DfuDeviceInfo {
            vid: crate::discovery::STM32_DFU_VID,
            pid: crate::discovery::STM32_DFU_PID,
            unique_id: "webusb:0483:df11:test".into(),
            serial_number: Some("test".into()),
            manufacturer: Some("STMicroelectronics".into()),
            product: Some("STM32 BOOTLOADER".into()),
        }
    }

    #[test]
    fn dfu_flow_happy_path_verified() {
        let usb = MockDfuUsb::success();
        let mut phases = Vec::new();

        let result = execute_dfu_recovery_with_phases(
            &usb,
            &stm32_dfu_device(),
            &[1, 2, 3],
            &|| false,
            |phase| phases.push(phase),
            |_, _| {},
        );

        assert!(matches!(result, DfuRecoveryResult::Verified));
        assert_eq!(
            phases,
            vec![
                DfuRecoveryPhase::Detecting,
                DfuRecoveryPhase::Erasing,
                DfuRecoveryPhase::Downloading,
                DfuRecoveryPhase::ManifestingOrResetting,
            ]
        );
    }

    #[test]
    fn dfu_flow_reset_confirmation_confirms_app_mode_reenumeration() {
        let disposition = confirm_reset_with_device_checks(
            Duration::from_millis(100),
            Duration::from_millis(50),
            || Ok(true),
            || Ok(true),
            |_| {},
        );

        assert_eq!(disposition, ResetDisposition::Confirmed);
    }

    #[test]
    fn dfu_usb_identity_prefers_serial_number_for_matching() {
        let identity = DfuUsbDeviceIdentity::new(
            crate::discovery::STM32_DFU_VID,
            crate::discovery::STM32_DFU_PID,
            Some("STM32-A"),
            Some("STM32 BOOTLOADER"),
        );
        let same_serial_different_product = DfuUsbDeviceIdentity::new(
            crate::discovery::STM32_DFU_VID,
            crate::discovery::STM32_DFU_PID,
            Some("STM32-A"),
            Some("Different label"),
        );
        let different_serial = DfuUsbDeviceIdentity::new(
            crate::discovery::STM32_DFU_VID,
            crate::discovery::STM32_DFU_PID,
            Some("STM32-B"),
            Some("STM32 BOOTLOADER"),
        );

        assert!(identity.matches(&same_serial_different_product));
        assert!(!identity.matches(&different_serial));
    }

    #[test]
    fn dfu_usb_identity_falls_back_to_product_without_serial_number() {
        let identity = DfuUsbDeviceIdentity::new(
            crate::discovery::STM32_DFU_VID,
            crate::discovery::STM32_DFU_PID,
            None,
            Some("STM32 BOOTLOADER"),
        );
        let matching_product = DfuUsbDeviceIdentity::new(
            crate::discovery::STM32_DFU_VID,
            crate::discovery::STM32_DFU_PID,
            None,
            Some("STM32 BOOTLOADER"),
        );
        let different_product = DfuUsbDeviceIdentity::new(
            crate::discovery::STM32_DFU_VID,
            crate::discovery::STM32_DFU_PID,
            None,
            Some("Other DFU"),
        );

        assert!(identity.matches(&matching_product));
        assert!(!identity.matches(&different_product));
    }

    #[test]
    fn reset_confirmation_polling_requires_exactly_one_initial_match() {
        assert!(!is_unambiguous_reset_confirmation_match(0));
        assert!(is_unambiguous_reset_confirmation_match(1));
        assert!(!is_unambiguous_reset_confirmation_match(2));
    }

    #[test]
    fn reset_confirmation_treats_multiple_weak_matches_as_ambiguous() {
        let identity = DfuUsbDeviceIdentity::new(
            crate::discovery::STM32_DFU_VID,
            crate::discovery::STM32_DFU_PID,
            None,
            Some("STM32 BOOTLOADER"),
        );
        let candidates = [
            DfuUsbDeviceIdentity::new(
                crate::discovery::STM32_DFU_VID,
                crate::discovery::STM32_DFU_PID,
                None,
                Some("STM32 BOOTLOADER"),
            ),
            DfuUsbDeviceIdentity::new(
                crate::discovery::STM32_DFU_VID,
                crate::discovery::STM32_DFU_PID,
                None,
                Some("STM32 BOOTLOADER"),
            ),
        ];
        let initial_matching_count = candidates
            .iter()
            .filter(|candidate| identity.matches(candidate))
            .count();

        assert_eq!(initial_matching_count, 2);
        assert!(!is_unambiguous_reset_confirmation_match(
            initial_matching_count
        ));
    }
}
