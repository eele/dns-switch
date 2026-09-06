// Prevents an extra console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod admin;
mod commands;
mod config;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

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

/// Restore the main window from the tray: show, un-minimize and focus it.
fn restore_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn main() {
    // ── Force administrator privileges on Windows ──────────────────────
    #[cfg(target_os = "windows")]
    admin::ensure_elevated();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::list_adapters,
            commands::get_current_dns,
            commands::set_dns,
            commands::reset_dns_to_dhcp,
            config::load_config,
            config::save_config
        ])
        // ── Minimize-to-tray ───────────────────────────────────────────
        // Intercept the window close request (red traffic-light / OS close
        // button) and hide the window instead of quitting. The process keeps
        // running in the background with the system tray icon, so the user
        // can restore it via the tray "Open" item. Only the tray "Exit" item
        // actually terminates the app (via `app.exit`).
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                use raw_window_handle::HasWindowHandle;
                let window = app.get_webview_window("main").expect("main window");
                let handle = match window.window_handle() {
                    Ok(h) => h,
                    Err(_) => return Ok(()),
                };
                if let raw_window_handle::RawWindowHandle::Win32(h) = handle.as_raw() {
                    disable_dwm_rounded_corners(h.hwnd.get());
                }
            }

            // ── System tray icon with Open / Exit menu ─────────────────
            let open_item = MenuItem::with_id(app, "tray-open", "Open", true, None::<&str>)?;
            let exit_item = MenuItem::with_id(app, "tray-exit", "Exit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &exit_item])?;

            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("DNS Switch")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "tray-open" => {
                        restore_main_window(app);
                    }
                    "tray-exit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    // Left-click (released) or double-click on the tray icon
                    // restores the main window.
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    }
                    | TrayIconEvent::DoubleClick { .. } => {
                        let app = tray.app_handle();
                        restore_main_window(app);
                    }
                    _ => {}
                });

            // Reuse the application's window icon for the tray icon.
            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }

            tray.build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
