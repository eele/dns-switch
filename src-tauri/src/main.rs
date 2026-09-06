// Prevents an extra console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

/// On Windows 11, the DWM automatically rounds window corners.
/// We disable this so CSS border-radius is the single source of truth,
/// ensuring identical appearance on Windows 10 and 11.
#[cfg(target_os = "windows")]
fn disable_dwm_rounded_corners(hwnd: isize) {
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *const std::ffi::c_void,
            dw_attribute: u32,
            pv_attribute: *const u32,
            cb_attribute: u32,
        ) -> i32;
    }
    unsafe {
        let dont_round: u32 = 1; // DWMWCP_DONOTROUND
        let _ = DwmSetWindowAttribute(
            hwnd as *const std::ffi::c_void,
            33, // DWMWA_WINDOW_CORNER_PREFERENCE
            &dont_round,
            std::mem::size_of::<u32>() as u32,
        );
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::list_adapters,
            commands::get_current_dns,
            commands::set_dns,
            commands::reset_dns_to_dhcp
        ])
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                use raw_window_handle::HasWindowHandle;
                use tauri::Manager;
                let window = app.get_webview_window("main").expect("main window");
                let handle = window
                    .window_handle()
                    .expect("failed to get window handle");
                if let raw_window_handle::RawWindowHandle::Win32(h) = handle.as_raw() {
                    disable_dwm_rounded_corners(h.hwnd.get());
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
