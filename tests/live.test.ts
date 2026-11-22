// Real-world tests against live registries / resolvers. No mocks, no simulated availability.
// Run: npm run test:live
import { afterEach, describe, expect, it } from "vitest";
import { checkDomain, endpoints } from "@/lib/availability";

const rand = () => "zq" + Math.random().toString(36).slice(2, 12);
const DOH = [...endpoints.doh];
afterEach(() => { endpoints.doh = [...DOH]; });

describe.runIf(process.env.LIVE)("live .ir", () => {
  it("existing .ir domain -> registered (DNS delegation)", async () => {
    const r = await checkDomain("google.ir", true);
    expect(r.status).toBe("registered");
    expect(r.source).toBe("dns");
  });
  it("potentially available .ir -> UNKNOWN (never available from the browser)", async () => {
    const r = await checkDomain(`${rand()}.ir`, true);
    expect(r.status).toBe("unknown");
    expect(r.hint).toBe("not-delegated");
    expect(r.note).toMatch(/whois\.nic\.ir/);
  });
  it("invalid .ir domains -> unknown via validation, no lookup", async () => {
    for (const d of ["a.ir", "ab.ir", "bad_name.ir", "-abc.ir"]) {
      const r = await checkDomain(d, true);
      expect(r.status).toBe("unknown");
      expect(r.source).toBe("validation");
    }
  });
  it("failed lookup (resolvers unreachable) -> unknown", async () => {
    endpoints.doh = ["https://127.0.0.1:9/dns-query"];
    const r = await checkDomain("google.ir", true);
    expect(r.status).toBe("unknown");
    expect(r.note).toMatch(/unreachable/);
  });
});

describe.runIf(process.env.LIVE)("live other TLDs", () => {
  it("google.co -> registered via DNS (.co has no RDAP)", async () => expect((await checkDomain("google.co", true)).status).toBe("registered"));
  it("random .co -> unknown, not available", async () => expect((await checkDomain(`${rand()}.co`, true)).status).toBe("unknown"));
  it("google.com -> registered via Verisign RDAP", async () => {
    const r = await checkDomain("google.com", true);
    expect(r).toMatchObject({ status: "registered", source: "rdap:rdap.verisign.com" });
  });
  it("random .com -> available via registry RDAP 404", async () =>
    expect((await checkDomain(`${rand()}.com`, true)).status).toBe("available"));
  it("random .ai -> available via Identity Digital RDAP", async () =>
    expect((await checkDomain(`${rand()}.ai`, true)).status).toBe("available"));
  it("google.io -> registered (RDAP override)", async () => expect((await checkDomain("google.io", true)).status).toBe("registered"));
});

describe.runIf(process.env.LIVE)("CORS headers on every endpoint the browser uses", () => {
  it.each([
    "https://data.iana.org/rdap/dns.json",
    "https://rdap.verisign.com/com/v1/domain/google.com",
    "https://rdap.identitydigital.services/rdap/domain/google.io",
    "https://cloudflare-dns.com/dns-query?name=google.ir&type=NS",
    "https://dns.google/resolve?name=google.ir&type=NS",
  ])("%s", async (u) => {
    const r = await fetch(u, { headers: { Origin: "https://zibafar.github.io", accept: "application/dns-json, application/rdap+json" } });
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
  });
});
