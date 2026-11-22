// Shared, client-safe domain helpers (no secrets, no node APIs).

export const DEFAULT_TLDS = ["ir", "com", "net", "org", "io", "ai", "co", "app", "dev"] as const;
export const EXTRA_TLDS = ["xyz", "me", "tech", "store", "online", "shop"] as const;

export type Status = "available" | "registered" | "premium" | "unknown";

export interface CheckResult {
  domain: string;
  status: Status;
  source: string; // which provider produced the verdict
  checkedAt: string; // ISO
  price?: string;
  note?: string; // human hint: e.g. "Not in IRNIC WHOIS — unverified"
  restricted?: boolean; // .ir eligibility / reserved warning
}

export interface Suggestion {
  name: string; // label without TLD
  style: string; // brandable | invented | keyword | prefix-suffix | spelling | persian | international
  score: number; // AI opinion 0-100 — never mixed with availability
  reason: string;
  scores?: Partial<Record<"brandability" | "memorability" | "pronunciation" | "length" | "relevance" | "international", number>>;
}

export const tldOf = (d: string) => d.slice(d.indexOf(".") + 1);

// IRNIC Annex 1 formal rules for <label>.ir (https://www.nic.ir/docs/ir/annex-1-formal-rules):
// a-z 0-9 hyphen only, 3..63 chars, no leading/trailing hyphen, no hyphen at both pos 3 and 4,
// gTLD names barred.
const IR_BARRED = new Set(["aero", "arpa", "biz", "com", "coop", "edu", "gov", "info", "int", "mil", "museum", "name", "net", "org", "pro"]);

export function irLabelError(label: string): string | null {
  if (!/^[a-z0-9-]+$/.test(label)) return "Only a–z, 0–9 and hyphen are allowed under .ir (Persian script needs .ایران)";
  if (label.length < 3) return "IRNIC requires at least 3 characters";
  if (label.length > 63) return "Max 63 characters";
  if (label.startsWith("-") || label.endsWith("-")) return "Cannot start or end with a hyphen";
  if (label[2] === "-" && label[3] === "-") return "Hyphen cannot be both 3rd and 4th character";
  if (IR_BARRED.has(label)) return "Generic TLD names are reserved by IRNIC";
  return null;
}

// Generic LDH check for other TLDs (IDN labels are accepted already punycoded as xn--).
export function labelError(label: string, tld: string): string | null {
  if (tld === "ir") return irLabelError(label);
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return "Invalid domain label";
  if (label[2] === "-" && label[3] === "-" && !label.startsWith("xn--")) return "Hyphens at positions 3–4 are reserved";
  return null;
}

export function registrarUrl(domain: string) {
  return tldOf(domain) === "ir"
    ? `https://www.nic.ir/` // registration is via IRNIC or an accredited reseller
    : `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`;
}
