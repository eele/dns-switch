import { test, expect, chromium, Browser } from "@playwright/test";
import { spawn, ChildProcess, execSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * E2E tests against the packaged DNS-Switch.exe.
 *
 * The app now reads REAL system network adapters and real current DNS via
 * PowerShell, so the assertions below are computed from the live system
 * (Get-NetAdapter / Get-DnsClientServerAddress) instead of hardcoded mocks.
 *
 * Tests that mutate the system DNS (apply a group / reset to DHCP) require
 * an elevated process; they are skipped when the test runner is not
 * administrator.
 */

const currentDir = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(currentDir, "..", "..");
const EXE_PATH = join(PROJECT_ROOT, "release", "DNS-Switch-win32-x64", "DNS-Switch.exe");
const CDP_PORT = 9333;
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;

// ── Real-system helpers (mirror electron/dns-core.cjs) ────────
function runPs(cmd: string): string {
  return execSync(
    `powershell -NoProfile -NonInteractive -Command "${cmd}"`,
    { encoding: "utf8", timeout: 30000, windowsHide: true }
  );
}

function getRealAdapters(): { name: string; index: number }[] {
  const out = runPs(
    "Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name,InterfaceIndex | ConvertTo-Json"
  ).trim();
  if (!out) return [];
  const data = JSON.parse(out);
  const arr = Array.isArray(data) ? data : [data];
  return arr.map((a: any) => ({ name: String(a.Name), index: Number(a.InterfaceIndex) }));
}

function getRealDns(adapterIndex: number): string[] {
  const out = runPs(
    `Get-DnsClientServerAddress -InterfaceIndex ${adapterIndex} -AddressFamily IPv4 | Select-Object -Property ServerAddresses | ConvertTo-Json`
  ).trim();
  if (!out) return [];
  const data = JSON.parse(out);
  const rows = Array.isArray(data) ? data : [data];
  return rows.flatMap((r: any) =>
    Array.isArray(r?.ServerAddresses) ? r.ServerAddresses.filter(Boolean) : []
  );
}

/**
 * Determine whether the adapter's DNS is set to "Automatic (DHCP)" by
 * checking the registry, mirroring the Rust backend logic.
 * A `NameServer` registry value means static DNS; its absence means DHCP.
 */
function isRealDnsDhcp(adapterIndex: number): boolean {
  const cmd = `
$nicIndex = ${adapterIndex};
$adapter = Get-NetAdapter -Index $nicIndex -ErrorAction SilentlyContinue;
$adapterName = $adapter.Name;
$ipAddrs = @(Get-NetIPAddress -InterfaceIndex $nicIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress);
$isDhcp = $true;
$tcpIpBase = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces';
$interfaceKeys = Get-ChildItem -Path $tcpIpBase -ErrorAction SilentlyContinue;
foreach ($key in $interfaceKeys) {
  $props = Get-ItemProperty -Path $key.PSPath -ErrorAction SilentlyContinue;
  $match = $false;
  if ($adapterName -and $props.Name -eq $adapterName) { $match = $true }
  if (-not $match) {
    $keyIps = @();
    if ($props.IPAddress) { $keyIps = @($props.IPAddress) }
    foreach ($ip in $keyIps) { if ($ipAddrs -contains $ip) { $match = $true; break } }
  }
  if ($match) {
    $ns = $props.NameServer;
    if ($ns -and $ns -ne '') { $isDhcp = $false }
    break;
  }
}
if ($isDhcp) { 'True' } else { 'False' }
`;
  try {
    return runPs(cmd).trim() === "True";
  } catch {
    return true; // default to DHCP if we can't determine
  }
}

function isElevated(): boolean {
  try {
    const out = runPs(
      "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
    ).trim();
    return out === "True";
  } catch {
    return false;
  }
}

let appProcess: ChildProcess;
let browser: Browser;
let page: any;
let ELEVATED = false;
/** Adapter names as seen by the app at launch (re-fetched on refresh). */
let realAdapterNames: string[] = [];

test.beforeAll(async () => {
  test.skip(!existsSync(EXE_PATH), `Exe not found at ${EXE_PATH}`);

  appProcess = spawn(EXE_PATH, [], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      // The app now forces UAC elevation on startup; this documented escape
      // hatch lets the automated runner launch it unprivileged so the UI
      // tests can run. Elevation-dependent DNS tests gate on isElevated().
      DNS_SWITCH_ALLOW_NO_ADMIN: "1",
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
    },
    stdio: "pipe",
    detached: false,
  });

  appProcess.stderr?.on("data", (d: Buffer) => {
    process.stderr.write(`[app-stderr] ${d.toString()}`);
  });

  let lastError: any;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      browser = await chromium.connectOverCDP(CDP_URL);
      break;
    } catch (e) {
      lastError = e;
    }
  }

  if (!browser) {
    throw new Error(`CDP not reachable after 30s. Last error: ${lastError?.message}`);
  }

  const context = browser.contexts()[0];
  page = context.pages()[0] || (await context.waitForEvent("page"));
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("[data-testid='status']", { timeout: 10000 });
  await page.waitForFunction(
    () => !document.querySelector("[data-testid='status']")?.textContent?.includes("Loading"),
    { timeout: 30000 }
  );

  ELEVATED = isElevated();
  realAdapterNames = getRealAdapters().map((a) => a.name);
});

test.afterAll(async () => {
  if (browser) {
    try { await browser.close(); } catch {}
  }
  if (appProcess && !appProcess.killed) {
    appProcess.kill();
    await new Promise((r) => setTimeout(r, 1500));
    if (appProcess.exitCode === null) appProcess.kill("SIGKILL");
  }
});

// Re-sync expected adapter names from the live system (retry a few times in
// case the adapter set changed between the app's load and this check).
async function expectRealAdapterList() {
  const select = page.locator("[data-testid='adapter-select']");
  for (let attempt = 0; attempt < 5; attempt++) {
    const options = await select.locator("option").allTextContents();
    const expected = getRealAdapters().map((a) => a.name);
    if (options.length === expected.length && options.every((o) => expected.includes(o))) {
      realAdapterNames = options;
      return;
    }
    // refresh the app's list and try again
    await page.locator("[data-testid='btn-refresh']").click();
    await expect(page.locator("[data-testid='status']")).toContainText("refreshed", { timeout: 15000 });
  }
  const options = await select.locator("option").allTextContents();
  expect(options).toEqual(getRealAdapters().map((a) => a.name));
}

// ── 1. Rendering ───────────────────────────────────────────────
test("app window renders with correct title", async () => {
  await expect(page.locator("[data-testid='title-bar']")).toBeVisible();
  await expect(page.locator(".title-bar-title")).toHaveText("DNS Switch");
});

test("traffic light buttons are present", async () => {
  await expect(page.locator("[data-testid='btn-close']")).toBeVisible();
  await expect(page.locator("[data-testid='btn-minimize']")).toBeVisible();
  await expect(page.locator("[data-testid='btn-maximize']")).toBeVisible();
});

// ── 2. Real system data (the core of this change) ─────────────
test("adapter dropdown lists the real system network adapters", async () => {
  await expectRealAdapterList();
  expect(realAdapterNames.length).toBeGreaterThanOrEqual(1);
  // none of the old mock adapters may appear
  for (const mockName of ["WLAN", "Bluetooth Network"]) {
    expect(realAdapterNames, `mock adapter "${mockName}" must not be listed`).not.toContain(mockName);
  }
});

test("Current DNS shows the real DNS of the selected adapter", async () => {
  await expectRealAdapterList();
  const realAdapters = getRealAdapters();
  const select = page.locator("[data-testid='adapter-select']");
  const currentDns = page.locator("[data-testid='current-dns']");

  // Find an adapter that actually has IPv4 DNS servers; prefer it for a
  // stronger assertion, fall back to any adapter.
  const withDns = realAdapters.find((a) => getRealDns(a.index).length > 0);
  const target = withDns ?? realAdapters[0];

  await select.selectOption(target.name);

  if (isRealDnsDhcp(target.index)) {
    // DHCP mode: the app must show "Automatic (DHCP)" regardless of the
    // actual IPs that were obtained from the DHCP server.
    await expect(currentDns).toContainText("Automatic (DHCP)", { timeout: 30000 });
  } else {
    // Static mode: show the specific server addresses
    const servers = getRealDns(target.index);
    if (servers.length > 0) {
      await expect(currentDns).toContainText(servers[0], { timeout: 30000 });
      if (servers.length > 1) {
        await expect(currentDns).toContainText(servers[1], { timeout: 5000 });
      }
    } else {
      await expect(currentDns).toContainText("Automatic (DHCP)", { timeout: 30000 });
    }
  }
});

test("switching to another real adapter shows that adapter's real DNS", async () => {
  const realAdapters = getRealAdapters();
  test.skip(realAdapters.length < 2, "need at least two Up adapters");

  const first = realAdapters[0];
  const second = realAdapters.find((a) => a.name !== first.name)!;
  const select = page.locator("[data-testid='adapter-select']");

  await select.selectOption(second.name);
  const currentDns = page.locator("[data-testid='current-dns']");

  if (isRealDnsDhcp(second.index)) {
    await expect(currentDns).toContainText("Automatic (DHCP)", { timeout: 30000 });
  } else {
    const servers = getRealDns(second.index);
    if (servers.length > 0) {
      await expect(currentDns).toContainText(servers[0], { timeout: 30000 });
    } else {
      await expect(currentDns).toContainText("Automatic (DHCP)", { timeout: 30000 });
    }
  }
});

// ── 3. UI regression (adapter-independent) ────────────────────
test("refresh button updates status", async () => {
  await page.locator("[data-testid='btn-refresh']").click();
  await expect(page.locator("[data-testid='status']")).toContainText("refreshed", { timeout: 15000 });
});

test("DNS group rows are rendered", async () => {
  await expect(page.locator("[data-testid='row-AliDNS']")).toBeVisible();
  await expect(page.locator("[data-testid='row-Google DNS']")).toBeVisible();
  await expect(page.locator("[data-testid='row-DNSPod']")).toBeVisible();
  await expect(page.locator("[data-testid='row-Automatic (DHCP)']")).toBeVisible();
});

// ── 4. Applying DNS (mutates the system; requires elevation) ──
test("selecting a DNS group applies it to the selected adapter", async () => {
  test.skip(!ELEVATED, "not running as administrator – real DNS change skipped");

  await page.locator("[data-testid='radio-Google DNS']").click();
  await expect(page.locator("[data-testid='status']")).toContainText("updated successfully", { timeout: 30000 });
  await expect(page.locator("[data-testid='current-dns']")).toContainText("8.8.8.8");
  await expect(page.locator("[data-testid='radio-Google DNS']")).toBeChecked();
});

test("selecting a DNS group without elevation fails gracefully", async () => {
  test.skip(ELEVATED, "only relevant when NOT running as administrator");

  const select = page.locator("[data-testid='adapter-select']");
  const selected = await select.inputValue();
  const real = getRealAdapters().find((a) => a.name === selected);
  const before = getRealDns(real.index);
  const expectedBefore = before.length > 0 ? before[0] : "Automatic (DHCP)";

  await page.locator("[data-testid='radio-Google DNS']").click();
  await expect(page.locator("[data-testid='status']")).toContainText("Failed to apply", { timeout: 30000 });
  // current DNS display must still reflect the real (unchanged) system DNS
  await expect(page.locator("[data-testid='current-dns']")).toContainText(expectedBefore, { timeout: 5000 });
});

test("selecting DHCP resets the adapter to automatic DNS", async () => {
  test.skip(!ELEVATED, "not running as administrator – real DNS change skipped");

  await page.locator("[data-testid='radio-dhcp']").click();
  await expect(page.locator("[data-testid='status']")).toContainText("reset to DHCP", { timeout: 30000 });
  await expect(page.locator("[data-testid='current-dns']")).toContainText("Automatic (DHCP)");
});

test("selecting DHCP without elevation fails gracefully", async () => {
  test.skip(ELEVATED, "only relevant when NOT running as administrator");

  await page.locator("[data-testid='radio-dhcp']").click();
  await expect(page.locator("[data-testid='status']")).toContainText("Failed to reset DNS", { timeout: 30000 });
});

// ── 5. Group management (in-memory UI state) ──────────────────
test("edit and save a DNS group", async () => {
  await page.locator("[data-testid='btn-edit-AliDNS']").click();
  await expect(page.locator("[data-testid='edit-name-AliDNS']")).toBeVisible();
  await expect(page.locator("[data-testid='btn-save-AliDNS']")).toBeVisible();

  await page.locator("[data-testid='edit-primary-AliDNS']").fill("9.9.9.9");
  await page.locator("[data-testid='btn-save-AliDNS']").click();

  await expect(page.locator("[data-testid='edit-name-AliDNS']")).not.toBeVisible();
  await expect(page.locator("[data-testid='row-AliDNS']")).toContainText("9.9.9.9");
});

test("save rejects invalid IP address", async () => {
  await page.locator("[data-testid='btn-edit-Google DNS']").click();
  await page.locator("[data-testid='edit-primary-Google DNS']").fill("999.999.1.1");
  await page.locator("[data-testid='btn-save-Google DNS']").click();
  await expect(page.locator("[data-testid='edit-name-Google DNS']")).toBeVisible();
  await expect(page.locator("[data-testid='status']")).toContainText("Invalid primary IPv4");
});

test("save rejects duplicate group name", async () => {
  await page.locator("[data-testid='btn-edit-DNSPod']").click();
  await page.locator("[data-testid='edit-name-DNSPod']").fill("Google DNS");
  await page.locator("[data-testid='btn-save-DNSPod']").click();
  await expect(page.locator("[data-testid='edit-name-DNSPod']")).toBeVisible();
  await expect(page.locator("[data-testid='status']")).toContainText("already exists or is reserved");
});

test("add creates a new group in edit mode", async () => {
  await page.locator("[data-testid='btn-add']").click();
  await expect(page.locator("[data-testid='row-New Group']")).toBeVisible();
  await expect(page.locator("[data-testid='edit-name-New Group']")).toBeVisible();
});

test("delete with confirmation removes group", async () => {
  await page.locator("[data-testid='btn-delete-DNSPod']").click();
  await expect(page.locator("[data-testid='confirm-overlay']")).toBeVisible();
  await expect(page.locator("[data-testid='confirm-overlay']")).toContainText("DNSPod");

  await page.locator("[data-testid='btn-confirm-yes']").click();
  await expect(page.locator("[data-testid='confirm-overlay']")).not.toBeVisible();
  await expect(page.locator("[data-testid='row-DNSPod']")).not.toBeVisible();
});

test("cancel delete keeps the group", async () => {
  await page.locator("[data-testid='btn-add']").click();
  await expect(page.locator("[data-testid='row-New Group']")).toBeVisible();

  await page.locator("[data-testid='btn-delete-New Group']").click();
  await expect(page.locator("[data-testid='confirm-overlay']")).toBeVisible();

  await page.locator("[data-testid='btn-confirm-no']").click();
  await expect(page.locator("[data-testid='confirm-overlay']")).not.toBeVisible();
  await expect(page.locator("[data-testid='row-New Group']")).toBeVisible();
});

// ── 6. Context menu / copy ────────────────────────────────────
test("right-click on address shows context menu", async () => {
  await page.locator("[data-testid='addr-Google DNS-primary']").click({ button: "right" });
  await expect(page.locator("[data-testid='context-menu']")).toBeVisible();
  await expect(page.locator("[data-testid='ctx-copy']")).toBeVisible();
  await expect(page.locator("[data-testid='ctx-copy-all']")).toHaveCount(0);
  // Dismiss the context menu by clicking on the status bar so it doesn't
  // interfere with the next test
  await page.locator("[data-testid='status']").click();
  await expect(page.locator("[data-testid='context-menu']")).not.toBeVisible();
});

test("copy via context menu updates status", async () => {
  await page.locator("[data-testid='addr-Google DNS-primary']").click({ button: "right" });
  await page.locator("[data-testid='ctx-copy']").click();
  await expect(page.locator("[data-testid='status']")).toContainText("Copied");
});

test("DHCP row has no edit or delete buttons", async () => {
  const dhcpRow = page.locator("[data-testid='row-Automatic (DHCP)']");
  await expect(dhcpRow.locator("button")).toHaveCount(0);
});
