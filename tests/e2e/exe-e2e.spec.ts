import { test, expect, chromium, Browser } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(currentDir, "..", "..");
const EXE_PATH = join(PROJECT_ROOT, "release", "DNS-Switch-win32-x64", "DNS-Switch.exe");
const CDP_PORT = 9333;
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;

let appProcess: ChildProcess;
let browser: Browser;
let page: any;

test.beforeAll(async () => {
  test.skip(!existsSync(EXE_PATH), `Exe not found at ${EXE_PATH}`);

  appProcess = spawn(EXE_PATH, [`--remote-debugging-port=${CDP_PORT}`], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
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
    { timeout: 10000 }
  );
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

test("app window renders with correct title", async () => {
  await expect(page.locator("[data-testid='title-bar']")).toBeVisible();
  await expect(page.locator(".title-bar-title")).toHaveText("DNS Switch");
});

test("traffic light buttons are present", async () => {
  await expect(page.locator("[data-testid='btn-close']")).toBeVisible();
  await expect(page.locator("[data-testid='btn-minimize']")).toBeVisible();
  await expect(page.locator("[data-testid='btn-maximize']")).toBeVisible();
});

test("adapter dropdown shows mock adapters", async () => {
  const select = page.locator("[data-testid='adapter-select']");
  await expect(select).toBeVisible();
  const options = await select.locator("option").allTextContents();
  expect(options).toContain("WLAN");
  expect(options).toContain("Ethernet");
  expect(options).toContain("Bluetooth Network");
});

test("refresh button updates status", async () => {
  await page.locator("[data-testid='btn-refresh']").click();
  await expect(page.locator("[data-testid='status']")).toContainText("refreshed", { timeout: 8000 });
});

test("DNS group rows are rendered", async () => {
  await expect(page.locator("[data-testid='row-AliDNS']")).toBeVisible();
  await expect(page.locator("[data-testid='row-Google DNS']")).toBeVisible();
  await expect(page.locator("[data-testid='row-DNSPod']")).toBeVisible();
  await expect(page.locator("[data-testid='row-Automatic (DHCP)']")).toBeVisible();
});

test("selecting a DNS group updates status and current DNS", async () => {
  await page.locator("[data-testid='radio-Google DNS']").click();
  await expect(page.locator("[data-testid='status']")).toContainText("updated successfully", { timeout: 8000 });
  await expect(page.locator("[data-testid='current-dns']")).toContainText("8.8.8.8");
});

test("selecting DHCP resets DNS", async () => {
  await page.locator("[data-testid='radio-dhcp']").click();
  await expect(page.locator("[data-testid='status']")).toContainText("reset to DHCP", { timeout: 8000 });
  await expect(page.locator("[data-testid='current-dns']")).toContainText("Automatic (DHCP)");
});

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

test("right-click on address shows context menu", async () => {
  await page.locator("[data-testid='addr-AliDNS-primary']").click({ button: "right" });
  await expect(page.locator("[data-testid='context-menu']")).toBeVisible();
  await expect(page.locator("[data-testid='ctx-copy']")).toBeVisible();
  await expect(page.locator("[data-testid='ctx-copy-all']")).toBeVisible();
  // Dismiss the context menu by clicking on the status bar so it doesn't interfere with next test
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
