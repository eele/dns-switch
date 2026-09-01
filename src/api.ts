import type { Adapter, DnsGroup, DnsInfo } from "./types";

/**
 * Mock API layer – simulates the Tauri backend commands.
 * No real DNS / PowerShell / network calls are made.
 */

// ── Mock data ──────────────────────────────────────────────────
const MOCK_ADAPTERS: Adapter[] = [
  { name: "WLAN", index: 5 },
  { name: "Ethernet", index: 3 },
  { name: "Bluetooth Network", index: 12 },
];

const MOCK_DNS_GROUPS: DnsGroup[] = [
  { name: "AliDNS", primary: "223.5.5.5", secondary: "223.6.6.6" },
  { name: "Google DNS", primary: "8.8.8.8", secondary: "8.8.4.4" },
  { name: "DNSPod", primary: "1.12.12.12", secondary: "1.12.0.0" },
];

// Simulated current DNS per adapter (mock)
const MOCK_CURRENT_DNS: Record<string, DnsInfo> = {
  WLAN: { primary: "223.5.5.5", secondary: "223.6.6.6", isDhcp: false },
  Ethernet: { primary: "8.8.8.8", secondary: "8.8.4.4", isDhcp: false },
  "Bluetooth Network": { primary: "", secondary: "", isDhcp: true },
};

// ── Helpers ────────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Mock commands (mirror the Tauri invoke interface) ────────
export async function listAdapters(): Promise<Adapter[]> {
  await delay(200);
  return [...MOCK_ADAPTERS];
}

export async function getCurrentDns(adapterName: string): Promise<DnsInfo> {
  await delay(400);
  const info = MOCK_CURRENT_DNS[adapterName];
  if (info) return { ...info };
  return { primary: "", secondary: "", isDhcp: true };
}

export async function setDns(
  adapterName: string,
  servers: string[]
): Promise<void> {
  await delay(500);
  // Mutate the mock so subsequent reads reflect the change
  const primary = servers[0] ?? "";
  const secondary = servers[1] ?? "";
  MOCK_CURRENT_DNS[adapterName] = {
    primary,
    secondary,
    isDhcp: false,
  };
}

export async function resetDnsToDhcp(adapterName: string): Promise<void> {
  await delay(500);
  MOCK_CURRENT_DNS[adapterName] = {
    primary: "",
    secondary: "",
    isDhcp: true,
  };
}

// ── Validation helpers (mirrors Rust-side checks) ─────────────
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
