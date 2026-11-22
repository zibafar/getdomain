// Server-only: domain availability providers.
// Rule: "available" is only ever produced by an authoritative positive signal
// (registry RDAP 404, registrar API avail=yes, IRNIC EPP avail=1). Everything else -> "unknown".
import net from "node:net";
import { domainToASCII } from "node:url";
import { type CheckResult, type Status, labelError, tldOf } from "./domains";

const now = () => new Date().toISOString();
const result = (domain: string, status: Status, source: string, extra: Partial<CheckResult> = {}): CheckResult => ({
  domain, status, source, checkedAt: now(), ...extra,
});

// ---------- tiny per-host throttle (in-memory) ----------
// ponytail: per-process spacing; a shared limiter (Redis) is needed only if you run several instances.
const gates = new Map<string, Promise<unknown>>();
function throttle(key: string, gapMs: number) {
  const prev = gates.get(key) ?? Promise.resolve();
  gates.set(key, prev.then(() => new Promise((r) => setTimeout(r, gapMs))));
  return prev;
}

async function withRetry(fn: () => Promise<CheckResult>, tries = 2): Promise<CheckResult> {
  let last!: CheckResult;
  for (let i = 0; i < tries; i++) {
    last = await fn().catch((e) => result("", "unknown", "error", { note: `Lookup failed: ${e?.message ?? e}` }));
    if (last.status !== "unknown" || !last.note?.match(/rate|timeout|failed|HTTP 5/i)) return last;
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return last;
}

// ---------- RDAP (IANA bootstrap) ----------
const RDAP_OVERRIDES: Record<string, string> = {
  io: "https://rdap.identitydigital.services/rdap/", // not in IANA bootstrap but served (verified)
};
let bootstrap: Promise<Record<string, string>> | null = null;
function rdapBases() {
  bootstrap ??= fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(10000) })
    .then((r) => r.json())
    .then((j: { services: [string[], string[]][] }) => {
      const map: Record<string, string> = {};
      for (const [tlds, urls] of j.services) for (const t of tlds) map[t] = urls.find((u) => u.startsWith("https")) ?? urls[0];
      return { ...map, ...RDAP_OVERRIDES };
    })
    .catch((e) => { bootstrap = null; throw e; });
  return bootstrap;
}

export async function rdapCheck(domain: string): Promise<CheckResult> {
  const base = (await rdapBases())[tldOf(domain)];
  if (!base) return result(domain, "unknown", "rdap", { note: "No RDAP service for this TLD — configure a registrar API" });
  const host = new URL(base).host;
  await throttle(host, 200);
  const res = await fetch(`${base.replace(/\/?$/, "/")}domain/${domain}`, {
    headers: { accept: "application/rdap+json" },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 200) return result(domain, "registered", "rdap");
  if (res.status === 404)
    return result(domain, "available", "rdap", { note: "Not registered per registry RDAP (premium/reserved pricing not checked)" });
  if (res.status === 429) return result(domain, "unknown", "rdap", { note: "Registry rate limit — retry shortly" });
  return result(domain, "unknown", "rdap", { note: `Registry RDAP HTTP ${res.status}` });
}

// ---------- Porkbun registrar API (optional; adds premium + price) ----------
const truthy = (v: unknown) => v === true || v === 1 || v === "1" || v === "yes";
export async function porkbunCheck(domain: string): Promise<CheckResult> {
  await throttle("porkbun", 1100); // default budget: 10 checks / 10 s
  const res = await fetch(`https://api.porkbun.com/api/json/v3/domain/checkDomain/${domain}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: process.env.PORKBUN_API_KEY, secretapikey: process.env.PORKBUN_SECRET_KEY }),
    signal: AbortSignal.timeout(10000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.status !== "SUCCESS" || !j.response || !("avail" in j.response))
    return result(domain, "unknown", "porkbun", { note: `Registrar API: ${j?.message ?? `HTTP ${res.status}`}` });
  const r = j.response;
  if (!truthy(r.avail)) return result(domain, "registered", "porkbun");
  return result(domain, truthy(r.premium) ? "premium" : "available", "porkbun", { price: r.price ? `$${r.price}` : undefined });
}

// ---------- IRNIC ----------
function whois(host: string, query: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "";
    const s = net.connect(43, host, () => s.write(query + "\r\n"));
    s.setTimeout(timeoutMs, () => s.destroy(new Error("WHOIS timeout")));
    s.on("data", (d) => (out += d.toString("utf8")));
    s.on("end", () => resolve(out));
    s.on("error", reject);
  });
}

const IR_RESTRICTED = /only available for registration under certain conditions/i;

/** Parse IRNIC WHOIS text. Exported for tests. */
export function parseIrnicWhois(domain: string, txt: string): CheckResult {
  if (/^domain:\s+\S/m.test(txt))
    return result(domain, "registered", "irnic-whois", IR_RESTRICTED.test(txt) ? { restricted: true, note: "Registered; IRNIC marks this name as restricted" } : {});
  if (/ERROR:101|no entries found/i.test(txt))
    // IRNIC answers ERROR:101 for invalid and reserved names too (e.g. "a.ir", "bad_name.ir"),
    // so absence from WHOIS is NOT proof of availability.
    return result(domain, "unknown", "irnic-whois", {
      note: "Not in IRNIC WHOIS — likely free but unverified. Confirm at nic.ir or configure IRNIC EPP.",
    });
  if (/ERROR:\d+/.test(txt) || /limit|denied|too many/i.test(txt))
    return result(domain, "unknown", "irnic-whois", { note: "IRNIC WHOIS refused the query (rate limit?) — retry shortly" });
  return result(domain, "unknown", "irnic-whois", { note: "Unrecognised IRNIC WHOIS response" });
}

export async function irnicWhoisCheck(domain: string): Promise<CheckResult> {
  await throttle("whois.nic.ir", 1000);
  return parseIrnicWhois(domain, await whois(process.env.IRNIC_WHOIS_HOST || "whois.nic.ir", domain));
}

/** Parse an IRNIC EPP <domain:check> response. Exported for tests. */
export function parseIrnicEpp(domain: string, xml: string): CheckResult {
  const code = xml.match(/<result[^>]*code="(\d+)"/)?.[1];
  if (code !== "1000")
    return result(domain, "unknown", "irnic-epp", { note: `IRNIC EPP code ${code ?? "?"}: ${xml.match(/<msg[^>]*>([^<]*)/)?.[1] ?? "no message"}` });
  const avail = xml.match(/<(?:\w+:)?name[^>]*\savail="(\w+)"/)?.[1];
  const reason = xml.match(/<(?:\w+:)?reason[^>]*>([^<]*)/)?.[1];
  if (avail === "1" || avail === "true") return result(domain, "available", "irnic-epp");
  if (avail === "0" || avail === "false") return result(domain, "registered", "irnic-epp", reason ? { note: reason } : {});
  return result(domain, "unknown", "irnic-epp", { note: "EPP response had no avail flag" });
}

// IRNIC EPP-over-HTTPS (reseller/نماینده credentials). Shape follows IRNIC's domain-1.0 namespace.
export async function irnicEppCheck(domain: string): Promise<CheckResult> {
  await throttle("epp.nic.ir", 500);
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?><epp xmlns="urn:ietf:params:xml:ns:epp-1.0"><command><check>` +
    `<domain:check xmlns:domain="http://epp.nic.ir/ns/domain-1.0"><domain:name>${domain}</domain:name>` +
    `<domain:authInfo><domain:pw>${process.env.IRNIC_DEPOSIT_CODE ?? ""}</domain:pw></domain:authInfo></domain:check></check>` +
    `<clTRID>DF-${Date.now()}</clTRID></command></epp>`;
  const res = await fetch(process.env.IRNIC_EPP_URL || "https://epp.nic.ir/submit", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.IRNIC_EPP_TOKEN}`, "Content-Type": "application/xml", Accept: "application/xml" },
    body: xml,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return result(domain, "unknown", "irnic-epp", { note: `IRNIC EPP HTTP ${res.status}` });
  return parseIrnicEpp(domain, await res.text());
}

// ---------- entry point ----------
export const providers = {
  ir: () => (process.env.IRNIC_EPP_TOKEN ? "irnic-epp" : "irnic-whois"),
  other: () => (process.env.PORKBUN_API_KEY && process.env.PORKBUN_SECRET_KEY ? "porkbun → rdap" : "rdap"),
};

const cache = new Map<string, { r: CheckResult; exp: number }>();
const TTL: Record<Status, number> = { registered: 6 * 3600e3, available: 10 * 60e3, premium: 30 * 60e3, unknown: 0 };

export function normalize(input: string): { domain: string; error?: string } {
  const ascii = domainToASCII(input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  if (!ascii || !ascii.includes(".")) return { domain: input, error: "Invalid domain" };
  const dot = ascii.indexOf(".");
  const error = labelError(ascii.slice(0, dot), ascii.slice(dot + 1));
  return { domain: ascii, error: error ?? undefined };
}

export async function checkDomain(input: string, fresh = false): Promise<CheckResult> {
  const { domain, error } = normalize(input);
  if (error) return result(domain, "unknown", "validation", { note: error, restricted: tldOf(domain) === "ir" });
  const hit = cache.get(domain);
  if (!fresh && hit && hit.exp > Date.now()) return hit.r;

  const tld = tldOf(domain);
  let r: CheckResult;
  if (tld === "ir") {
    r = await withRetry(() => (process.env.IRNIC_EPP_TOKEN ? irnicEppCheck(domain) : irnicWhoisCheck(domain)));
  } else {
    r = process.env.PORKBUN_API_KEY ? await withRetry(() => porkbunCheck(domain)) : result(domain, "unknown", "none");
    if (r.status === "unknown") r = await withRetry(() => rdapCheck(domain));
  }
  r.domain = domain;
  if (TTL[r.status]) cache.set(domain, { r, exp: Date.now() + TTL[r.status] });
  return r;
}
