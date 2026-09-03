"use strict";

/**
 * dns-core.cjs – real Windows DNS operations via PowerShell.
 *
 * All commands are documented in 开发计划.md §3.1:
 *   - list adapters:  Get-NetAdapter | Where-Object Status -eq 'Up'
 *   - read current DNS: Get-DnsClientServerAddress -InterfaceIndex <n> -AddressFamily IPv4
 *   - set DNS:        Set-DnsClientServerAddress -InterfaceIndex <n> -ServerAddresses (...)
 *   - reset to DHCP:  Set-DnsClientServerAddress -InterfaceIndex <n> -Reset
 *
 * runPs() resolves with stdout; non-zero exit / timeout / spawn failure
 * reject with an Error carrying the PowerShell stderr text so the UI
 * status bar can show it.
 */

const { spawn } = require("child_process");

const PS_TIMEOUT_MS = 15000;

function assertIndex(adapterIndex) {
  const idx = Number(adapterIndex);
  if (!Number.isInteger(idx) || idx < 0) {
    throw new Error(`Invalid adapter index: ${String(adapterIndex)}`);
  }
  return idx;
}

/**
 * Run a PowerShell script and resolve with its stdout.
 */
function runPs(script) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        { windowsHide: true }
      );
    } catch (err) {
      reject(new Error(`Failed to start PowerShell: ${err.message}`));
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          child.kill();
        } catch {}
        reject(new Error(`PowerShell timed out after ${PS_TIMEOUT_MS}ms: ${script}`));
      }
    }, PS_TIMEOUT_MS);

    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to run PowerShell: ${err.message}`));
      }
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
      }
    });
  });
}

/**
 * Normalize ConvertTo-Json output that may be a single object, an array of
 * objects, or an empty string.
 */
function toArray(data) {
  if (data == null) return [];
  return Array.isArray(data) ? data : [data];
}

/**
 * List Up-status network adapters.
 * @returns {Promise<{name: string, index: number}[]>}
 */
async function listAdapters() {
  const out = await runPs(
    "Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name,InterfaceIndex | ConvertTo-Json"
  );
  const text = out.trim();
  if (!text) return [];
  const data = JSON.parse(text);
  return toArray(data).map((a) => ({ name: a.Name, index: Number(a.InterfaceIndex) }));
}

/**
 * Read the current IPv4 DNS servers of an adapter.
 * @param {number} adapterIndex
 * @returns {Promise<{primary: string, secondary: string, isDhcp: boolean}>}
 */
async function getCurrentDns(adapterIndex) {
  const idx = assertIndex(adapterIndex);
  const out = await runPs(
    `Get-DnsClientServerAddress -InterfaceIndex ${idx} -AddressFamily IPv4 | Select-Object -Property ServerAddresses | ConvertTo-Json`
  );
  let servers = [];
  const text = out.trim();
  if (text) {
    const data = JSON.parse(text);
    for (const row of toArray(data)) {
      if (row && Array.isArray(row.ServerAddresses)) {
        servers = servers.concat(row.ServerAddresses);
      }
    }
  }
  servers = servers.filter((s) => typeof s === "string" && s.length > 0);
  return {
    primary: servers[0] || "",
    secondary: servers[1] || "",
    // No configured server at all → treat as automatic (DHCP) for the UI.
    isDhcp: servers.length === 0,
  };
}

/**
 * Set static IPv4 DNS servers on an adapter.
 * @param {number} adapterIndex
 * @param {string[]} servers
 */
async function setDns(adapterIndex, servers) {
  const idx = assertIndex(adapterIndex);
  const addrs = (servers || []).map((s) => String(s).trim()).filter((s) => s.length > 0);
  if (addrs.length === 0) throw new Error("No DNS server addresses to set");
  const quoted = addrs.map((s) => `'${s}'`).join(",");
  await runPs(
    `Set-DnsClientServerAddress -InterfaceIndex ${idx} -ServerAddresses @(${quoted}) -Confirm:$false`
  );
}

/**
 * Reset an adapter's DNS to DHCP automatic.
 * @param {number} adapterIndex
 */
async function resetDnsToDhcp(adapterIndex) {
  const idx = assertIndex(adapterIndex);
  await runPs(`Set-DnsClientServerAddress -InterfaceIndex ${idx} -Reset`);
}

module.exports = { listAdapters, getCurrentDns, setDns, resetDnsToDhcp, runPs };
