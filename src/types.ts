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
