import { invoke } from "@tauri-apps/api/core";
import type { Adapter, DnsGroup, DnsInfo, AppConfig } from "./types";

/**
 * API layer – talks to the Tauri Rust backend via `invoke`.
 * Falls back to mock data when running in a plain browser (dev mode without Tauri).
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// ── Mock data (browser-only fallback for pure `vite dev` without Tauri) ─────
const MOCK_ADAPTERS: Adapter[] = [
  { name: "WLAN", index: 5 },
  { name: "Ethernet", index: 3 },
  { name: "Bluetooth Network", index: 12 },
];

const MOCK_CURRENT_DNS: Record<string, DnsInfo> = {
  WLAN: { primary: "223.5.5.5", secondary: "223.6.6.6", isDhcp: false },
  Ethernet: { primary: "8.8.8.8", secondary: "8.8.4.4", isDhcp: false },
  "Bluetooth Network": { primary: "", secondary: "", isDhcp: true },
};

const MOCK_CONFIG_KEY = "dns_switch_config";

function defaultConfig(): AppConfig {
  return {
    dns_groups: [
      { name: "AliDNS", primary: "223.5.5.5", secondary: "223.6.6.6" },
      { name: "Google DNS", primary: "8.8.8.8", secondary: "8.8.4.4" },
      { name: "DNSPod", primary: "1.12.12.12", secondary: "1.12.0.0" },
    ],
    last_adapter: null,
    selected_group: "",
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mockAdapterNameByIndex(adapterIndex: number): string | undefined {
  return MOCK_ADAPTERS.find((a) => a.index === adapterIndex)?.name;
}

// ── Commands (mirror the Tauri IPC interface) ───────────────────────

export async function listAdapters(): Promise<Adapter[]> {
  if (isTauri()) return invoke<Adapter[]>("list_adapters");
  await delay(200);
  return [...MOCK_ADAPTERS];
}

export async function getCurrentDns(adapterIndex: number): Promise<DnsInfo> {
  if (isTauri()) return invoke<DnsInfo>("get_current_dns", { adapterIndex });
  await delay(400);
  const name = mockAdapterNameByIndex(adapterIndex);
  const info = name ? MOCK_CURRENT_DNS[name] : undefined;
  if (info) return { ...info };
  return { primary: "", secondary: "", isDhcp: true };
}

export async function setDns(adapterIndex: number, servers: string[]): Promise<void> {
  if (isTauri()) {
    await invoke("set_dns", { adapterIndex, servers });
    return;
  }
  await delay(500);
  const name = mockAdapterNameByIndex(adapterIndex);
  if (!name) return;
  const primary = servers[0] ?? "";
  const secondary = servers[1] ?? "";
  MOCK_CURRENT_DNS[name] = { primary, secondary, isDhcp: false };
}

export async function resetDnsToDhcp(adapterIndex: number): Promise<void> {
  if (isTauri()) {
    await invoke("reset_dns_to_dhcp", { adapterIndex });
    return;
  }
  await delay(500);
  const name = mockAdapterNameByIndex(adapterIndex);
  if (!name) return;
  MOCK_CURRENT_DNS[name] = { primary: "", secondary: "", isDhcp: true };
}

// ── Config persistence ───────────────────────────────────────────

export async function loadConfig(): Promise<AppConfig> {
  if (isTauri()) return invoke<AppConfig>("load_config");
  await delay(50);
  try {
    const raw = localStorage.getItem(MOCK_CONFIG_KEY);
    if (raw) return JSON.parse(raw) as AppConfig;
  } catch { /* corrupt or unavailable — fall back to defaults */ }
  return defaultConfig();
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  if (isTauri()) {
    await invoke("save_config", { config: cfg });
    return;
  }
  await delay(50);
  try {
    localStorage.setItem(MOCK_CONFIG_KEY, JSON.stringify(cfg));
  } catch { /* best-effort in browser fallback */ }
}

// ── Validation helpers ──────────────────────────────────────────

export function isValidIPv4(ip: string): boolean {
  if (!ip.trim()) return false;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

export function isDuplicateName(
  name: string,
  groups: DnsGroup[],
  ignoreIndex?: number
): boolean {
  const trimmed = name.trim().toLowerCase();
  return groups.some(
    (g, i) => i !== ignoreIndex && g.name.trim().toLowerCase() === trimmed
  );
}
