use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// A persisted DNS group (matches the frontend `DnsGroup` shape).
#[derive(Serialize, Deserialize, Clone)]
pub struct DnsGroup {
    pub name: String,
    pub primary: String,
    pub secondary: String,
}

/// Persisted application configuration.
///
/// On-disk shape (snake_case, per spec):
/// ```json
/// {
///   "dns_groups": [{ "name": "...", "primary": "...", "secondary": "..." }],
///   "last_adapter": "WLAN",
///   "selected_group": "AliDNS"
/// }
/// ```
#[derive(Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub dns_groups: Vec<DnsGroup>,
    /// Adapter selected last; restored on startup if it still exists.
    #[serde(default)]
    pub last_adapter: Option<String>,
    /// Last selected group; may be `"Automatic (DHCP)"` or `""` (nothing selected).
    #[serde(default)]
    pub selected_group: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            dns_groups: vec![
                DnsGroup {
                    name: "AliDNS".into(),
                    primary: "223.5.5.5".into(),
                    secondary: "223.6.6.6".into(),
                },
                DnsGroup {
                    name: "Google DNS".into(),
                    primary: "8.8.8.8".into(),
                    secondary: "8.8.4.4".into(),
                },
                DnsGroup {
                    name: "DNSPod".into(),
                    primary: "1.12.12.12".into(),
                    secondary: "1.12.0.0".into(),
                },
            ],
            last_adapter: None,
            selected_group: String::new(),
        }
    }
}

/// Path to `config.json`: next to the executable in release builds (portable),
/// or the project root during development.
fn config_path() -> PathBuf {
    let base = if cfg!(debug_assertions) {
        // Dev mode: project root (parent of src-tauri)
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        manifest_dir
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir)
    } else {
        // Release: directory containing the running executable
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(PathBuf::from))
            .unwrap_or_else(std::env::temp_dir)
    };
    base.join("config.json")
}

/// Load the config from disk. Falls back to defaults on missing/corrupt file.
pub fn load() -> AppConfig {
    let path = config_path();
    if let Ok(data) = fs::read_to_string(&path) {
        if let Ok(cfg) = serde_json::from_str::<AppConfig>(&data) {
            return cfg;
        }
        eprintln!("[dns-switch] config.json corrupt, falling back to defaults");
    }
    AppConfig::default()
}

/// Save the config atomically: write a temp file in the same directory,
/// then rename over `config.json` so a crash mid-write never corrupts it.
pub fn save(cfg: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Cannot create config dir: {e}"))?;
    }
    let data = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| format!("Cannot write config temp file: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Cannot finalize config file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn load_config() -> AppConfig {
    load()
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    save(&config)
}
