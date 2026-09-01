import { test, expect } from "@playwright/test";

test.describe("DNS Switch UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the app to finish loading (mock API has ~500ms delay)
    await page.waitForSelector('[data-testid="dns-list"]');
    await page.waitForSelector('[data-testid="status"]');
    // Wait until status is no longer "Loading…"
    await expect(page.getByTestId("status")).not.toHaveText("Loading…");
  });

  // ── 1. Initial render ─────────────────────────────────────
  test("renders initial state with mock data", async ({ page }) => {
    // Title bar
    await expect(page.getByTestId("title-bar")).toBeVisible();

    // Adapter dropdown shows mock adapters
    await expect(page.getByTestId("adapter-select")).toHaveValue("WLAN");

    // Three DNS group rows + 1 DHCP row
    await expect(page.getByTestId("row-AliDNS")).toBeVisible();
    await expect(page.getByTestId("row-Google DNS")).toBeVisible();
    await expect(page.getByTestId("row-DNSPod")).toBeVisible();
    await expect(page.getByTestId("row-Automatic (DHCP)")).toBeVisible();

    // Current DNS reflects mock data (AliDNS is preselected for WLAN)
    await expect(page.getByTestId("current-dns")).toContainText("223.5.5.5");

    // Status bar
    await expect(page.getByTestId("status")).toHaveText(/Ready/);
  });

  // ── 2. Radio selection applies DNS ───────────────────────
  test("selecting a radio group updates DNS and status", async ({ page }) => {
    // Click Google DNS radio
    await page.getByTestId("radio-Google DNS").click();

    // Status should show success
    await expect(page.getByTestId("status")).toContainText("updated successfully");

    // Current DNS should now show Google DNS addresses
    await expect(page.getByTestId("current-dns")).toContainText("8.8.8.8");

    // The radio should be checked
    await expect(page.getByTestId("radio-Google DNS")).toBeChecked();
  });

  // ── 3. DHCP row ───────────────────────────────────────────
  test("selecting Automatic (DHCP) resets DNS", async ({ page }) => {
    await page.getByTestId("radio-dhcp").click();

    await expect(page.getByTestId("status")).toContainText("reset to DHCP");
    await expect(page.getByTestId("current-dns")).toContainText("Automatic (DHCP)");
  });

  // ── 4. Edit / Save flow ──────────────────────────────────
  test("edit a group and save with valid values", async ({ page }) => {
    await page.getByTestId("btn-edit-AliDNS").click();

    // Should switch to edit mode
    await expect(page.getByTestId("edit-name-AliDNS")).toBeVisible();
    await expect(page.getByTestId("edit-primary-AliDNS")).toBeVisible();
    await expect(page.getByTestId("btn-save-AliDNS")).toBeVisible();

    // Change values
    await page.getByTestId("edit-primary-AliDNS").fill("9.9.9.9");
    await page.getByTestId("btn-save-AliDNS").click();

    // Should exit edit mode and show updated value
    await expect(page.getByTestId("edit-name-AliDNS")).not.toBeVisible();
    await expect(page.getByTestId("addr-AliDNS-primary")).toContainText("9.9.9.9");
    await expect(page.getByTestId("status")).toContainText("saved");
  });

  test("save with invalid IP is rejected", async ({ page }) => {
    await page.getByTestId("btn-edit-Google DNS").click();

    await page.getByTestId("edit-primary-Google DNS").fill("999.999.1.1");
    await page.getByTestId("btn-save-Google DNS").click();

    // Should stay in edit mode
    await expect(page.getByTestId("edit-name-Google DNS")).toBeVisible();
    await expect(page.getByTestId("status")).toContainText("Invalid primary IPv4");
  });

  test("save with duplicate name is rejected", async ({ page }) => {
    await page.getByTestId("btn-edit-AliDNS").click();

    await page.getByTestId("edit-name-AliDNS").fill("Google DNS");
    await page.getByTestId("btn-save-AliDNS").click();

    await expect(page.getByTestId("edit-name-AliDNS")).toBeVisible();
    await expect(page.getByTestId("status")).toContainText("already exists or is reserved");
  });

  test("save with reserved name 'Automatic (DHCP)' is rejected", async ({ page }) => {
    await page.getByTestId("btn-edit-AliDNS").click();

    await page.getByTestId("edit-name-AliDNS").fill("Automatic (DHCP)");
    await page.getByTestId("btn-save-AliDNS").click();

    await expect(page.getByTestId("edit-name-AliDNS")).toBeVisible();
    await expect(page.getByTestId("status")).toContainText("already exists or is reserved");
  });

  // ── 5. Add new group ─────────────────────────────────────
  test("add creates a new group in edit mode", async ({ page }) => {
    await page.getByTestId("btn-add").click();

    // New group should appear in edit mode
    await expect(page.getByTestId("edit-name-New Group")).toBeVisible();
    await expect(page.getByTestId("status")).toContainText("Added");
  });

  // ── 6. Delete with confirmation ──────────────────────────
  test("delete shows confirmation and removes group", async ({ page }) => {
    const rowBefore = await page.getByTestId("row-DNSPod").count();
    expect(rowBefore).toBe(1);

    await page.getByTestId("btn-delete-DNSPod").click();
    await expect(page.getByTestId("confirm-overlay")).toBeVisible();
    await expect(page.getByTestId("confirm-overlay")).toContainText("Delete DNS group \"DNSPod\"");

    // Confirm
    await page.getByTestId("btn-confirm-yes").click();
    await expect(page.getByTestId("confirm-overlay")).not.toBeVisible();

    // Row should be gone
    await expect(page.getByTestId("row-DNSPod")).not.toBeVisible();
    await expect(page.getByTestId("status")).toContainText("Deleted");
  });

  test("delete cancel keeps the group", async ({ page }) => {
    await page.getByTestId("btn-delete-DNSPod").click();
    await expect(page.getByTestId("confirm-overlay")).toBeVisible();

    // Cancel
    await page.getByTestId("btn-confirm-no").click();
    await expect(page.getByTestId("confirm-overlay")).not.toBeVisible();

    // Row should still be there
    await expect(page.getByTestId("row-DNSPod")).toBeVisible();
  });

  // ── 7. Refresh ───────────────────────────────────────────
  test("refresh reloads adapters and DNS", async ({ page }) => {
    await page.getByTestId("btn-refresh").click();
    await expect(page.getByTestId("status")).toContainText("refreshed");
  });

  // ── 8. Adapter switch ────────────────────────────────────
  test("switching adapter reloads DNS", async ({ page }) => {
    // Switch to Ethernet (mock current DNS is 8.8.8.8 / 8.8.4.4 → Google DNS)
    await page.getByTestId("adapter-select").selectOption("Ethernet");
    await expect(page.getByTestId("current-dns")).toContainText("8.8.8.8");
    await expect(page.getByTestId("radio-Google DNS")).toBeChecked();
  });

  // ── 9. Context menu / Copy ───────────────────────────────
  test("right-click on DNS address shows context menu", async ({ page }) => {
    const addr = page.getByTestId("addr-AliDNS-primary");
    await addr.click({ button: "right" });

    await expect(page.getByTestId("context-menu")).toBeVisible();
    await expect(page.getByTestId("ctx-copy")).toBeVisible();
    await expect(page.getByTestId("ctx-copy-all")).toBeVisible();
  });

  test("context menu Copy writes to clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const addr = page.getByTestId("addr-AliDNS-primary");
    await addr.click({ button: "right" });
    await page.getByTestId("ctx-copy").click();

    await expect(page.getByTestId("context-menu")).not.toBeVisible();
    await expect(page.getByTestId("status")).toContainText("Copied 223.5.5.5");

    // Verify clipboard
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toBe("223.5.5.5");
  });

  test("context menu Copy All copies full address", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const addr = page.getByTestId("addr-Google DNS-secondary");
    await addr.click({ button: "right" });
    await page.getByTestId("ctx-copy-all").click();

    await expect(page.getByTestId("status")).toContainText("Copied 8.8.4.4");
  });

  // ── 10. Traffic light buttons ────────────────────────────
  test("traffic light buttons are present and clickable", async ({ page }) => {
    await expect(page.getByTestId("btn-close")).toBeVisible();
    await expect(page.getByTestId("btn-minimize")).toBeVisible();
    await expect(page.getByTestId("btn-maximize")).toBeVisible();

    // Click each – should not crash (mock just logs)
    await page.getByTestId("btn-close").click();
    await page.getByTestId("btn-minimize").click();
    await page.getByTestId("btn-maximize").click();

    // App should still be visible
    await expect(page.getByTestId("app-root")).toBeVisible();
  });

  // ── 11. DHCP row has no Edit/Delete ──────────────────────
  test("DHCP row has no edit or delete buttons", async ({ page }) => {
    const dhcpRow = page.getByTestId("row-Automatic (DHCP)");
    await expect(dhcpRow.locator("button")).toHaveCount(0);
  });

  // ── 12. Address cells are selectable ─────────────────────
  test("DNS addresses have user-select text", async ({ page }) => {
    const addr = page.getByTestId("addr-AliDNS-primary");
    const style = await addr.evaluate((el) => getComputedStyle(el).userSelect);
    expect(style).toBe("text");
  });
});
