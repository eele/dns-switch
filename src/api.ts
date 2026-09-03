import type { Adapter, DnsGroup, DnsInfo } from "./types";

/**
 * API layer – talks to the Electron main process (electron/dns-core.cjs) via
 * the `electronAPI` bridge exposed by electron/preload.cjs, which in turn
 * shells out to PowerShell for real system network-adapter / DNS operations.
 *
 * When running outside Electron (plain browser dev server), a mock fallback is
 * used so the UI can still be developed and tested (see 开发计划 §7.2).
 */

// ── Electron IPC bridge ─────────────────────────────────────────
interface ElectronDnsApi {
  listAdapters(): Promise<Adapter[]>;
  getCurrentDns(adapterIndex: number): Promise<DnsInfo>;
  setDns(adapterIndex: number, servers: string[]): Promise<void>;
  resetDnsToDhcp(adapterIndex: number): Promise<void>;
}

const electronAPI: ElectronDnsApi | undefined =
  typeof window !== "undefined"
    ? (window as unknown as { electronAPI?: ElectronDnsApi }).electronAPI
    : undefined;

const isElectron = (): boolean => !!electronAPI;

// ── Mock data (browser-only fallback) ───────────────────────────
const MOCK_ADAPTERS: Adapter[] = [
  { name: "WLAN", index: 5 },
  { name: "Ethernet", index: 3 },
  { name: "Bluetooth Network", index: 12 },
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

function mockAdapterNameByIndex(adapterIndex: number): string | undefined {
  return MOCK_ADAPTERS.find((a) => a.index === adapterIndex)?.name;
}

// ── Commands (mirror the Electron IPC interface) ───────────────
/**
 * List the real system network adapters (Up status) via
 * `Get-NetAdapter`; falls back to mock data outside Electron.
 */
export async function listAdapters(): Promise<Adapter[]> {
  if (isElectron()) return electronAPI!.listAdapters();
  await delay(200);
  return [...MOCK_ADAPTERS];
}

/**
 * Read the real current IPv4 DNS servers of the adapter with the given
 * InterfaceIndex via `Get-DnsClientServerAddress`.
 */
export async function getCurrentDns(adapterIndex: number): Promise<DnsInfo> {
  if (isElectron()) return electronAPI!.getCurrentDns(adapterIndex);
  await delay(400);
  const name = mockAdapterNameByIndex(adapterIndex);
  const info = name ? MOCK_CURRENT_DNS[name] : undefined;
  if (info) return { ...info };
  return { primary: "", secondary: "", isDhcp: true };
}

/**
 * Set static DNS on the adapter via `Set-DnsClientServerAddress`.
 */
export async function setDns(
  adapterIndex: number,
  servers: string[]
): Promise<void> {
  if (isElectron()) {
    await electronAPI!.setDns(adapterIndex, servers);
    return;
  }
  await delay(500);
  // Mutate the mock so subsequent reads reflect the change
  const name = mockAdapterNameByIndex(adapterIndex);
  if (!name) return;
  const primary = servers[0] ?? "";
  const secondary = servers[1] ?? "";
  MOCK_CURRENT_DNS[name] = {
    primary,
    secondary,
    isDhcp: false,
  };
}

/**
 * Reset the adapter's DNS to DHCP via `Set-DnsClientServerAddress -Reset`.
 */
export async function resetDnsToDhcp(adapterIndex: number): Promise<void> {
  if (isElectron()) {
    await electronAPI!.resetDnsToDhcp(adapterIndex);
    return;
  }
  await delay(500);
  const name = mockAdapterNameByIndex(adapterIndex);
  if (!name) return;
  MOCK_CURRENT_DNS[name] = {
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
