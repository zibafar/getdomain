// Browser-side availability providers (no backend, no keys).
//
// Verified in headless Chrome (2026-11-22) from a foreign origin:
//   - Registry RDAP servers from the IANA bootstrap send `Access-Control-Allow-Origin: *`.
//   - Cloudflare / Google DNS-over-HTTPS send ACAO *.
//   - rdap.org answers 404 "No RDAP service is available" for .ir / .co — an intermediary error,
//     NOT a registry "not found". Never used.
//   - IRNIC (whois.nic.ir web, nic.ir) blocks cross-origin requests; WHOIS :43 and EPP are not
//     reachable from a browser. => .ir can only be confirmed REGISTERED (via DNS), never AVAILABLE.
//
// Rule: AVAILABLE only from an authoritative registry RDAP 404. Everything else is REGISTERED
// (positive evidence) or UNKNOWN (with the reason).
import { type CheckResult, type Status, labelError, tldOf } from "./domains";

const now = () => new Date().toISOString();
const res = (domain: string, status: Status, source: string, extra: Partial<CheckResult> = {}): CheckResult => ({
  domain, status, source, checkedAt: now(), ...extra,
});

// Overridable for tests (simulate an unreachable service).
export const endpoints = {
  bootstrap: "https://data.iana.org/rdap/dns.json",
  doh: ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"],
};

// ---------- per-host spacing (in-memory) ----------
const gates = new Map<string, Promise<unknown>>();
function throttle(key: string, gapMs: number) {
  const prev = gates.get(key) ?? Promise.resolve();
  gates.set(key, prev.then(() => new Promise((r) => setTimeout(r, gapMs))));
  return prev;
}
function timeout(signal?: AbortSignal, ms = 10000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(new Error("timeout")), ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); c.abort(signal.reason); }, { once: true });
  return c.signal;
}

// ---------- Provider 1: authoritative registry RDAP ----------
// Verified to serve CORS but missing from the IANA bootstrap.
const RDAP_OVERRIDES: Record<string, string> = { io: "https://rdap.identitydigital.services/rdap/" };
let bootstrap: Promise<Record<string, string>> | null = null;
function rdapBases() {
  bootstrap ??= fetch(endpoints.bootstrap, { signal: timeout() })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`bootstrap HTTP ${r.status}`))))
    .then((j: { services: [string[], string[]][] }) => {
      const map: Record<string, string> = {};
      for (const [tlds, urls] of j.services) for (const t of tlds) map[t] = urls.find((u) => u.startsWith("https")) ?? urls[0];
      return { ...map, ...RDAP_OVERRIDES };
    })
    .catch((e) => { bootstrap = null; throw e; });
  return bootstrap;
}

export async function rdapSupports(tld: string) {
  return !!(await rdapBases().catch(() => ({} as Record<string, string>)))[tld];
}

/** Interpret one RDAP HTTP response. Exported for tests. */
export function interpretRdap(domain: string, status: number, body: string, servedBy: string, expectedHost: string): CheckResult {
  const src = `rdap:${expectedHost}`;
  if (servedBy !== expectedHost) return res(domain, "unknown", src, { note: `Answered by ${servedBy}, not the registry` });
  let j: Record<string, unknown> | null = null;
  try { j = body ? JSON.parse(body) : null; } catch { /* invalid JSON handled below */ }
  if (status === 200) {
    if (j?.objectClassName === "domain" && String(j.ldhName ?? "").toLowerCase() === domain)
      return res(domain, "registered", src, Array.isArray(j.status) ? { note: `Registry status: ${j.status.join(", ")}` } : {});
    return res(domain, "unknown", src, { note: "Registry returned 200 without a valid domain object" });
  }
  if (status === 404) {
    // Empty body (Verisign) or an RDAP error object with errorCode 404 is a registry "object not found".
    const title = String(j?.title ?? "") + " " + String((j?.description as string[] | undefined)?.join(" ") ?? "");
    if (/no rdap service|not authoritative|unsupported/i.test(title))
      return res(domain, "unknown", src, { note: `RDAP server error: ${title.trim()}` });
    if (!body.trim() || j?.errorCode === 404)
      return res(domain, "available", src, { note: "Registry has no record of this domain (premium/reserved pricing not checked)" });
    return res(domain, "unknown", src, { note: "404 with an unrecognised body" });
  }
  if (status === 429) return res(domain, "unknown", src, { note: "Registry rate limit (429) — retry shortly" });
  return res(domain, "unknown", src, { note: `Registry RDAP HTTP ${status}` });
}

export async function rdapCheck(domain: string, signal?: AbortSignal): Promise<CheckResult> {
  let base: string | undefined;
  try { base = (await rdapBases())[tldOf(domain)]; }
  catch { return res(domain, "unknown", "rdap", { note: "IANA RDAP bootstrap unreachable" }); }
  if (!base) return res(domain, "unknown", "rdap", { note: `No registry RDAP service for .${tldOf(domain)}` });
  const host = new URL(base).host;
  await throttle(host, 200);
  try {
    const r = await fetch(`${base.replace(/\/?$/, "/")}domain/${domain}`, {
      headers: { accept: "application/rdap+json" }, signal: timeout(signal), redirect: "follow",
    });
    return interpretRdap(domain, r.status, await r.text(), new URL(r.url || base).host, host);
  } catch (e) {
    if (signal?.aborted) throw e;
    return res(domain, "unknown", `rdap:${host}`, { note: `Network/CORS error: ${(e as Error).message}` });
  }
}

// ---------- Provider 2: DNS-over-HTTPS (registered-or-unknown only) ----------
/** Interpret a DoH JSON answer for type=NS. Exported for tests. */
export function interpretDoh(domain: string, j: { Status?: number; Answer?: { name: string; type: number }[]; Authority?: { name: string; type: number }[] }): CheckResult {
  const strip = (n: string) => n.replace(/\.$/, "").toLowerCase();
  if (j.Status === 0 && j.Answer?.some((a) => a.type === 2 && strip(a.name) === domain))
    return res(domain, "registered", "dns", { note: "Delegated in DNS (has nameservers)" });
  if (j.Status === 3 && j.Authority?.some((a) => a.type === 6 && strip(a.name) === tldOf(domain)))
    // NXDOMAIN from the TLD zone. A name can still be registered without nameservers,
    // on hold, reserved or restricted — so this is NOT proof of availability.
    return res(domain, "unknown", "dns", { hint: "not-delegated", note: "Not in the TLD's DNS zone — may be free, but DNS can't prove it" });
  return res(domain, "unknown", "dns", { note: `DNS status ${j.Status ?? "?"} — inconclusive` });
}

export async function dohCheck(domain: string, signal?: AbortSignal): Promise<CheckResult> {
  for (const ep of endpoints.doh) {
    await throttle(ep, 50);
    try {
      const r = await fetch(`${ep}?name=${encodeURIComponent(domain)}&type=NS`, {
        headers: { accept: "application/dns-json" }, signal: timeout(signal, 8000),
      });
      if (r.ok) return interpretDoh(domain, await r.json());
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  return res(domain, "unknown", "dns", { note: "DNS-over-HTTPS resolvers unreachable" });
}

// ---------- chain ----------
export function normalize(input: string): { domain: string; error?: string } {
  let ascii = "";
  try { ascii = new URL("http://" + input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).hostname; } catch { /* invalid */ }
  if (!ascii || !ascii.includes(".")) return { domain: input, error: "Invalid domain" };
  const dot = ascii.indexOf(".");
  return { domain: ascii, error: labelError(ascii.slice(0, dot), ascii.slice(dot + 1)) ?? undefined };
}

const cache = new Map<string, { r: CheckResult; exp: number }>();
const TTL: Record<Status, number> = { registered: 6 * 3600e3, available: 10 * 60e3, premium: 30 * 60e3, unknown: 0 };

/**
 * Provider chain:
 *   .ir                -> DNS only (IRNIC is not browser-reachable): REGISTERED or UNKNOWN.
 *   RDAP-capable TLDs  -> registry RDAP; if inconclusive, DNS may still prove REGISTERED.
 *   other TLDs (.co…)  -> DNS only: REGISTERED or UNKNOWN.
 */
export async function checkDomain(input: string, fresh = false, signal?: AbortSignal): Promise<CheckResult> {
  const { domain, error } = normalize(input);
  if (error) return res(domain, "unknown", "validation", { note: error, restricted: tldOf(domain) === "ir" });
  const hit = cache.get(domain);
  if (!fresh && hit && hit.exp > Date.now()) return hit.r;

  const tld = tldOf(domain);
  let r: CheckResult;
  if (tld !== "ir" && (await rdapSupports(tld))) {
    r = await rdapCheck(domain, signal);
    if (r.status === "unknown") {
      const d = await dohCheck(domain, signal);
      if (d.status === "registered") r = { ...d, note: `${d.note}; RDAP: ${r.note}` };
    }
  } else {
    r = await dohCheck(domain, signal);
    if (tld === "ir" && r.status === "unknown")
      r.note = (r.note ?? "") + ". IRNIC offers no browser-accessible lookup; verify at whois.nic.ir.";
  }
  if (TTL[r.status]) cache.set(domain, { r, exp: Date.now() + TTL[r.status] });
  return r;
}
