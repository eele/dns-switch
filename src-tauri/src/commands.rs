use serde::Serialize;
use std::process::{Command, Stdio};

/// A network adapter (interface) with an "Up" status.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Adapter {
    pub name: String,
    pub index: u32,
}

/// Current IPv4 DNS configuration for an adapter.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DnsInfo {
    pub primary: String,
    pub secondary: String,
    pub is_dhcp: bool,
}

/// Run a PowerShell command and return its stdout.
fn run_ps(script: &str) -> Result<String, String> {
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    // On Windows, hide the console window
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        let msg = stderr.trim().to_string();
        if msg.is_empty() {
            Err(format!("PowerShell exited with code: {}", output.status))
        } else {
            Err(msg)
        }
    }
}

/// Parse PowerShell ConvertTo-Json output which may be a single object or array.
fn parse_json_array(text: &str) -> Vec<serde_json::Value> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return vec![];
    }
    match serde_json::from_str::<serde_json::Value>(trimmed) {
        Ok(v) if v.is_array() => v.as_array().unwrap().clone(),
        Ok(v) => vec![v],
        Err(_) => vec![],
    }
}

/// List all "Up" network adapters.
#[tauri::command]
pub fn list_adapters() -> Result<Vec<Adapter>, String> {
    let script = "Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name,InterfaceIndex | ConvertTo-Json";
    let out = run_ps(script)?;
    let rows = parse_json_array(&out);
    Ok(rows
        .iter()
        .filter_map(|r| {
            Some(Adapter {
                name: r.get("Name")?.as_str()?.to_string(),
                index: r.get("InterfaceIndex")?.as_u64()? as u32,
            })
        })
        .collect())
}

/// Read the current IPv4 DNS servers for the adapter with the given interface
/// index, and whether the adapter's DNS is set to "Automatic (DHCP)".
///
/// `Get-DnsClientServerAddress` returns the *effective* DNS servers even when
/// they were obtained via DHCP, so an empty list is NOT a reliable indicator of
/// DHCP mode. Instead we inspect the per-interface TCP/IP registry key:
/// `HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\{GUID}`.
/// The `NameServer` value is only present when DNS is configured statically, so
/// its absence means the adapter is using DHCP (Automatic).
///
/// The GUID is obtained directly from `Get-NetAdapter -InterfaceIndex` which
/// avoids the fragile name/IP matching that fails when the IP is DHCP and the
/// registry key lacks a `Name` value.
#[tauri::command]
pub fn get_current_dns(adapter_index: u32) -> Result<DnsInfo, String> {
    let script = format!(
        r#"$nicIndex = {};
$adapter = Get-NetAdapter -InterfaceIndex $nicIndex -ErrorAction SilentlyContinue;
$adapterName = $adapter.Name;
$adapterGuid = $adapter.InterfaceGuid;
$ipAddrs = @(Get-NetIPAddress -InterfaceIndex $nicIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress);

$dnsServers = @();
$dnsEntries = Get-DnsClientServerAddress -InterfaceIndex $nicIndex -AddressFamily IPv4;
foreach ($entry in $dnsEntries) {{
  foreach ($addr in $entry.ServerAddresses) {{
    if ($addr -ne "") {{ $dnsServers += $addr }}
  }}
}}

$isDhcp = $true;
$regHit = $false;
if ($adapterGuid) {{
  $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$adapterGuid";
  $props = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue;
  if ($props) {{
    $regHit = $true;
    if ($props.NameServer) {{ $isDhcp = $false }}
  }}
}}
if (-not $regHit) {{
  $tcpIpBase = 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces';
  $interfaceKeys = Get-ChildItem -Path $tcpIpBase -ErrorAction SilentlyContinue;
  foreach ($key in $interfaceKeys) {{
    $props = Get-ItemProperty -Path $key.PSPath -ErrorAction SilentlyContinue;
    $match = $false;
    if ($adapterName -and $props.Name -eq $adapterName) {{ $match = $true }}
    if (-not $match) {{
      $keyIps = @();
      if ($props.IPAddress) {{ $keyIps = @($props.IPAddress) }}
      foreach ($ip in $keyIps) {{ if ($ipAddrs -contains $ip) {{ $match = $true; break }} }}
    }}
    if ($match) {{
      if ($props.NameServer) {{ $isDhcp = $false }}
      break;
    }}
  }}
}}

@{{ servers = $dnsServers; isDhcp = $isDhcp }} | ConvertTo-Json -Compress"#,
        adapter_index
    );
    let out = run_ps(&script)?;
    let json: serde_json::Value = serde_json::from_str(out.trim())
        .map_err(|e| format!("Failed to parse DNS info JSON: {e}"))?;

    let is_dhcp = json.get("isDhcp").and_then(|v| v.as_bool()).unwrap_or(true);

    let mut servers: Vec<String> = Vec::new();
    if let Some(arr) = json.get("servers").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(s) = item.as_str() {
                if !s.is_empty() {
                    servers.push(s.to_string());
                }
            }
        }
    }

    Ok(DnsInfo {
        primary: servers.first().cloned().unwrap_or_default(),
        secondary: servers.get(1).cloned().unwrap_or_default(),
        is_dhcp,
    })
}

/// Set static IPv4 DNS servers on the adapter with the given interface index.
#[tauri::command]
pub fn set_dns(adapter_index: u32, servers: Vec<String>) -> Result<(), String> {
    let addrs: Vec<String> = servers
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if addrs.is_empty() {
        return Err("No DNS server addresses to set".into());
    }
    let quoted = addrs
        .iter()
        .map(|s| format!("'{}'", s.replace('\'', "")))
        .collect::<Vec<_>>()
        .join(",");
    let script = format!(
        "Set-DnsClientServerAddress -InterfaceIndex {} -ServerAddresses @({}) -Confirm:$false",
        adapter_index, quoted
    );
    run_ps(&script)?;
    Ok(())
}

/// Reset the adapter's DNS to DHCP automatic.
#[tauri::command]
pub fn reset_dns_to_dhcp(adapter_index: u32) -> Result<(), String> {
    let script =
        format!("Set-DnsClientServerAddress -InterfaceIndex {} -Reset", adapter_index);
    run_ps(&script)?;
    Ok(())
}
