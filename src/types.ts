export interface Adapter {
  name: string;
  index: number;
}

export interface DnsInfo {
  primary: string;
  secondary: string;
  isDhcp: boolean;
}

export interface DnsGroup {
  name: string;
  primary: string;
  secondary: string;
}

/** Persisted application configuration (snake_case matches the on-disk JSON). */
export interface AppConfig {
  dns_groups: DnsGroup[];
  last_adapter: string | null;
  selected_group: string;
}
