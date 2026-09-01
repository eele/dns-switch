/**
 * E2E test script for DNS-Switch.exe
 * Connects to the running Electron app via CDP (port 9222) and verifies:
 *  1. UI renders correctly (title bar, traffic lights, adapters, DNS groups, status bar)
 *  2. Clicking radio buttons triggers mock "apply DNS" and updates status
 *  3. DHCP row resets to automatic
 *  4. Edit / Save flow works (validation + save)
 *  5. Add / Delete with confirmation
 *  6. Context menu (Copy / Copy All)
 *  7. Refresh button
 *  8. Traffic light buttons are clickable without crashing
 */
import { chromium } from "@playwright/test";

const CDP_URL = "http://127.0.0.1:9222";

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✅ ${name}`);
}
function fail(name, err) {
  failed++;
  console.error(`  ❌ ${name}`);
  console.error(`     ${err}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("Connecting to DNS-Switch.exe via CDP...");
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  // Wait for app to be ready
  await page.waitForSelector('[data-testid="status"]', { timeout: 15000 });
  // Wait for status to become "Ready."
  await page.waitForFunction(
    () => document.querySelector('[data-testid="status"]')?.textContent === "Ready.",
    { timeout: 10000 }
  );
  console.log("App is ready.\n");

  // ── 1. UI Rendering ──────────────────────────────────────────
  console.log("── 1. UI Rendering ──");

  try {
    const title = await page.locator("[data-testid='title-bar'] .title-bar-title").textContent();
    assert(title === "DNS Switch", `Title should be "DNS Switch", got "${title}"`);
    ok("Title bar shows 'DNS Switch'");
  } catch (e) { fail("Title bar", e.message); }

  try {
    await page.locator("[data-testid='btn-close']").waitFor({ state: "visible" });
    await page.locator("[data-testid='btn-minimize']").waitFor({ state: "visible" });
    await page.locator("[data-testid='btn-maximize']").waitFor({ state: "visible" });
    ok("Traffic light buttons are visible");
  } catch (e) { fail("Traffic lights", e.message); }

  try {
    const adapters = await page.locator("[data-testid='adapter-select'] option").allTextContents();
    assert(adapters.length >= 3, `Expected >= 3 adapters, got ${adapters.length}`);
    assert(adapters.includes("WLAN"), "Missing WLAN adapter");
    assert(adapters.includes("Ethernet"), "Missing Ethernet adapter");
    ok(`Adapter dropdown shows ${adapters.length} adapters: ${adapters.join(", ")}`);
  } catch (e) { fail("Adapter dropdown", e.message); }

  try {
    await page.locator("[data-testid='row-AliDNS']").waitFor({ state: "visible" });
    await page.locator("[data-testid='row-Google DNS']").waitFor({ state: "visible" });
    await page.locator("[data-testid='row-DNSPod']").waitFor({ state: "visible" });
    await page.locator("[data-testid='row-Automatic (DHCP)']").waitFor({ state: "visible" });
    ok("All 4 DNS group rows are rendered (AliDNS, Google DNS, DNSPod, DHCP)");
  } catch (e) { fail("DNS group rows", e.message); }

  try {
    const currentDns = await page.locator("[data-testid='current-dns']").textContent();
    assert(currentDns.includes("223.5.5.5"), `Current DNS should show AliDNS, got "${currentDns}"`);
    ok(`Current DNS shows: ${currentDns}`);
  } catch (e) { fail("Current DNS display", e.message); }

  // ── 2. Radio selection ───────────────────────────────────────
  console.log("── 2. Radio Selection ──");

  try {
    await page.locator("[data-testid='radio-Google DNS']").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="status"]')?.textContent?.includes("updated successfully"),
      { timeout: 10000 }
    );
    const dns = await page.locator("[data-testid='current-dns']").textContent();
    assert(dns.includes("8.8.8.8"), `Expected 8.8.8.8, got "${dns}"`);
    ok(`Select Google DNS → status "updated successfully", current DNS = ${dns.trim()}`);
  } catch (e) { fail("Select Google DNS", e.message); }

  try {
    await page.locator("[data-testid='radio-dhcp']").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="status"]')?.textContent?.includes("reset to DHCP"),
      { timeout: 10000 }
    );
    const dns = await page.locator("[data-testid='current-dns']").textContent();
    assert(dns.includes("Automatic"), `Expected Automatic (DHCP), got "${dns}"`);
    ok("Select DHCP → status 'reset to DHCP', current DNS = Automatic (DHCP)");
  } catch (e) { fail("Select DHCP", e.message); }

  // ── 3. Edit / Save ──────────────────────────────────────────
  console.log("── 3. Edit / Save ──");

  try {
    await page.locator("[data-testid='btn-edit-AliDNS']").click();
    await page.locator("[data-testid='edit-name-AliDNS']").waitFor({ state: "visible" });
    await page.locator("[data-testid='edit-primary-AliDNS']").waitFor({ state: "visible" });
    await page.locator("[data-testid='edit-secondary-AliDNS']").waitFor({ state: "visible" });
    await page.locator("[data-testid='btn-save-AliDNS']").waitFor({ state: "visible" });
    ok("Edit mode shows input fields and Save button");
  } catch (e) { fail("Enter edit mode", e.message); }

  try {
    await page.locator("[data-testid='edit-primary-AliDNS']").fill("9.9.9.9");
    await page.locator("[data-testid='edit-secondary-AliDNS']").fill("149.112.112.112");
    await page.locator("[data-testid='btn-save-AliDNS']").click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="edit-name-AliDNS"]'),
      { timeout: 5000 }
    );
    const text = await page.locator("[data-testid='row-AliDNS']").textContent();
    assert(text.includes("9.9.9.9"), `AliDNS row should show 9.9.9.9, got "${text}"`);
    ok("Edit AliDNS primary to 9.9.9.9 → saved, edit mode closed");
  } catch (e) { fail("Save valid edit", e.message); }

  try {
    await page.locator("[data-testid='btn-edit-Google DNS']").click();
    await page.locator("[data-testid='edit-primary-Google DNS']").fill("999.1.1.1");
    await page.locator("[data-testid='btn-save-Google DNS']").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="status"]')?.textContent?.includes("Invalid"),
      { timeout: 5000 }
    );
    const stillEditing = await page.locator("[data-testid='edit-name-Google DNS']").isVisible();
    assert(stillEditing, "Should still be in edit mode after invalid save");
    ok("Invalid IP (999.1.1.1) rejected, stays in edit mode");
    // Cancel by re-entering valid value
    await page.locator("[data-testid='edit-primary-Google DNS']").fill("8.8.8.8");
    await page.locator("[data-testid='btn-save-Google DNS']").click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="edit-name-Google DNS"]'),
      { timeout: 5000 }
    );
  } catch (e) { fail("Invalid IP rejection", e.message); }

  try {
    await page.locator("[data-testid='btn-edit-DNSPod']").click();
    await page.locator("[data-testid='edit-name-DNSPod']").fill("AliDNS");
    await page.locator("[data-testid='btn-save-DNSPod']").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="status"]')?.textContent?.includes("already exists"),
      { timeout: 5000 }
    );
    ok("Duplicate name 'AliDNS' rejected");
    // Restore
    await page.locator("[data-testid='edit-name-DNSPod']").fill("DNSPod");
    await page.locator("[data-testid='btn-save-DNSPod']").click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="edit-name-DNSPod"]'),
      { timeout: 5000 }
    );
  } catch (e) { fail("Duplicate name rejection", e.message); }

  // ── 4. Add ─────────────────────────────────────────────────
  console.log("── 4. Add ──");

  try {
    await page.locator("[data-testid='btn-add']").click();
    await page.locator("[data-testid='row-New Group']").waitFor({ state: "visible" });
    await page.locator("[data-testid='edit-name-New Group']").waitFor({ state: "visible" });
    ok("+ Add creates 'New Group' row in edit mode");
  } catch (e) { fail("Add new group", e.message); }

  // ── 5. Delete with confirmation ─────────────────────────────
  console.log("── 5. Delete ──");

  try {
    await page.locator("[data-testid='btn-delete-DNSPod']").click();
    await page.locator("[data-testid='confirm-overlay']").waitFor({ state: "visible" });
    const dialogText = await page.locator(".confirm-dialog").textContent();
    assert(dialogText.includes("DNSPod"), `Dialog should mention DNSPod, got "${dialogText}"`);
    ok(`Confirmation dialog shown: "${dialogText.trim()}"`);

    await page.locator("[data-testid='btn-confirm-yes']").click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="row-DNSPod"]'),
      { timeout: 5000 }
    );
    ok("Confirm → DNSPod row removed");
  } catch (e) { fail("Delete DNSPod", e.message); }

  try {
    await page.locator("[data-testid='btn-delete-Google DNS']").click();
    await page.locator("[data-testid='confirm-overlay']").waitFor({ state: "visible" });
    await page.locator("[data-testid='btn-confirm-no']").click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="confirm-overlay"]'),
      { timeout: 5000 }
    );
    await page.locator("[data-testid='row-Google DNS']").waitFor({ state: "visible" });
    ok("Cancel → Google DNS row kept");
  } catch (e) { fail("Cancel delete", e.message); }

  // ── 6. Context menu ────────────────────────────────────────
  console.log("── 6. Context Menu ──");

  try {
    const addr = page.locator("[data-testid='addr-AliDNS-primary']");
    await addr.click({ button: "right" });
    await page.locator("[data-testid='context-menu']").waitFor({ state: "visible" });
    await page.locator("[data-testid='ctx-copy']").waitFor({ state: "visible" });
    await page.locator("[data-testid='ctx-copy-all']").waitFor({ state: "visible" });
    ok("Right-click on address shows context menu (Copy / Copy All)");

    await page.locator("[data-testid='ctx-copy']").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="status"]')?.textContent?.includes("Copied"),
      { timeout: 5000 }
    );
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="context-menu"]'),
      { timeout: 5000 }
    );
    ok("Copy → status shows 'Copied', menu dismissed");
  } catch (e) { fail("Context menu", e.message); }

  // ── 7. Refresh ─────────────────────────────────────────────
  console.log("── 7. Refresh ──");

  try {
    await page.locator("[data-testid='btn-refresh']").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="status"]')?.textContent?.includes("refreshed"),
      { timeout: 10000 }
    );
    ok("Refresh → status shows 'Adapters refreshed'");
  } catch (e) { fail("Refresh", e.message); }

  // ── 8. Traffic lights (click without crashing) ────────────
  console.log("── 8. Traffic Lights ──");

  try {
    await page.locator("[data-testid='btn-minimize']").click();
    await page.waitForTimeout(500);
    ok("Minimize button clicked without crash");
  } catch (e) { fail("Minimize", e.message); }

  try {
    await page.locator("[data-testid='btn-maximize']").click();
    await page.waitForTimeout(500);
    ok("Maximize button clicked without crash");
  } catch (e) { fail("Maximize", e.message); }

  // ── Summary ────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════");
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════");

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  console.error(err.stack);
  process.exit(1);
});
