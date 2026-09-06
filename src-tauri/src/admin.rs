//! Windows elevation: detect admin privileges and self-relaunch via UAC.
//!
//! On startup, if the process is not running elevated, it relaunches itself
//! with the "runas" verb (triggering the UAC prompt) and exits the
//! non-elevated instance immediately.  If the user declines the UAC prompt,
//! the app exits without leaving any window behind.
//!
//! Set the environment variable `DNS_SWITCH_ALLOW_NO_ADMIN=1` to skip the
//! elevation check (used by automated E2E tests that verify the
//! "graceful-failure-when-unprivileged" code path).

use std::ffi::c_void;

// ── Win32 FFI ──────────────────────────────────────────────────

#[cfg(target_os = "windows")]
#[link(name = "shell32")]
extern "system" {
    fn IsUserAnAdmin() -> i32;
    fn ShellExecuteW(
        hwnd: *mut c_void,
        lp_operation: *const u16,
        lp_file: *const u16,
        lp_parameters: *const u16,
        lp_directory: *const u16,
        n_show_cmd: i32,
    ) -> *mut c_void;
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn MessageBoxW(
        hwnd: *mut c_void,
        lp_text: *const u16,
        lp_caption: *const u16,
        u_type: u32,
    ) -> i32;
}

// ── Helpers ────────────────────────────────────────────────────

/// Encode a UTF-8 string as a NUL-terminated wide string (Windows API).
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

// ── Public API ─────────────────────────────────────────────────

/// Returns `true` if the current process is running with elevated
/// (administrator) privileges.
#[cfg(target_os = "windows")]
pub fn is_elevated() -> bool {
    unsafe { IsUserAnAdmin() == 1 }
}

#[cfg(not(target_os = "windows"))]
pub fn is_elevated() -> bool {
    true // non-Windows: no elevation concept; treat as always OK
}

/// Relaunch the current executable with administrator privileges.
///
/// Returns `true` if the UAC prompt was accepted and the elevated copy
/// was launched successfully.  Returns `false` if the user cancelled
/// the UAC prompt or if the launch failed for any other reason.
#[cfg(target_os = "windows")]
pub fn relaunch_elevated() -> bool {
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return false,
    };

    let exe_str = exe.to_str().unwrap_or(".");
    let exe_wide: Vec<u16> = exe_str.encode_utf16().chain(std::iter::once(0)).collect();
    let op_runas = wide_null("runas");

    const SW_SHOWNORMAL: i32 = 1;

    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            op_runas.as_ptr(),
            exe_wide.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };

    // ShellExecuteW returns an HINSTANCE > 32 on success.
    // Return codes <= 32 indicate failure (e.g. 1223 = SE_ERR_CANCEL,
    // user pressed "No" on the UAC prompt).
    result as isize > 32
}

#[cfg(not(target_os = "windows"))]
pub fn relaunch_elevated() -> bool {
    true // no-op on non-Windows
}

/// Show a modal error message box (Windows only).
#[cfg(target_os = "windows")]
pub fn show_error_box(message: &str) {
    let msg = wide_null(message);
    let caption = wide_null("DNS Switch - Admin Privileges Required");
    const MB_ICONERROR: u32 = 0x10;
    unsafe {
        MessageBoxW(std::ptr::null_mut(), msg.as_ptr(), caption.as_ptr(), MB_ICONERROR);
    }
}

#[cfg(not(target_os = "windows"))]
pub fn show_error_box(_message: &str) {}

// ── Startup check ──────────────────────────────────────────────

/// Call this at the very beginning of `main()`, before any window is
/// created.  If the process is not elevated (and the test-override
/// env var is not set), it relaunches itself via UAC and exits the
/// current (non-elevated) process.
pub fn ensure_elevated() {
    // Test / CI escape hatch: allow running without admin.
    if std::env::var("DNS_SWITCH_ALLOW_NO_ADMIN").is_ok() {
        return;
    }

    if !is_elevated() {
        eprintln!("[DNS Switch] Not running as administrator – requesting elevation via UAC…");
        if relaunch_elevated() {
            // Elevated copy launched; exit the unprivileged instance.
            std::process::exit(0);
        } else {
            eprintln!("[DNS Switch] UAC elevation declined or failed – exiting.");
            show_error_box(
                "DNS Switch requires administrator privileges to modify network \
DNS settings.\n\n\
The elevation request was cancelled, so the application cannot start.",
            );
            std::process::exit(1);
        }
    }
}
