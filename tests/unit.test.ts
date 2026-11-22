import { describe, expect, it } from "vitest";
import { irLabelError } from "@/lib/domains";
import { interpretDoh, interpretRdap, normalize } from "@/lib/availability";
import { heuristicSuggestions, parseSuggestions } from "@/lib/ai";

const H = "rdap.verisign.com";
const rdap = (status: number, body: unknown, servedBy = H) =>
  interpretRdap("example.com", status, typeof body === "string" ? body : JSON.stringify(body), servedBy, H).status;

describe("RDAP interpretation (bodies captured from real registries 2026-11-22)", () => {
  it("200 + valid domain object -> registered", () =>
    expect(rdap(200, { objectClassName: "domain", ldhName: "EXAMPLE.COM", status: ["active"] })).toBe("registered"));
  it("200 without a domain object -> unknown", () => expect(rdap(200, { foo: 1 })).toBe("unknown"));
  it("200 for a different domain -> unknown", () => expect(rdap(200, { objectClassName: "domain", ldhName: "other.com" })).toBe("unknown"));
  it("404 empty body (Verisign) -> available", () => expect(rdap(404, "")).toBe("available"));
  it("404 RDAP error object (PIR / Identity Digital) -> available", () =>
    expect(rdap(404, { errorCode: 404, title: "Object not found" })).toBe("available"));
  it("rdap.org-style 'No RDAP service' 404 -> unknown", () =>
    expect(rdap(404, { errorCode: 404, title: "No RDAP service is available for this resource" })).toBe("unknown"));
  it("404 from a non-registry host -> unknown", () => expect(rdap(404, "", "rdap.org")).toBe("unknown"));
  it("404 with HTML/garbage -> unknown", () => expect(rdap(404, "<html>Not found</html>")).toBe("unknown"));
  it.each([403, 429, 500, 502, 503])("HTTP %i -> unknown", (s) => expect(rdap(s, "")).toBe("unknown"));
});

describe("DNS-over-HTTPS interpretation (never 'available')", () => {
  it("NS answer -> registered", () =>
    expect(interpretDoh("google.ir", { Status: 0, Answer: [{ name: "google.ir.", type: 2 }] }).status).toBe("registered"));
  it("NXDOMAIN from TLD zone -> unknown + not-delegated hint", () => {
    const r = interpretDoh("zq1.ir", { Status: 3, Authority: [{ name: "ir.", type: 6 }] });
    expect(r.status).toBe("unknown");
    expect(r.hint).toBe("not-delegated");
  });
  it("SERVFAIL -> unknown, no hint", () => {
    const r = interpretDoh("x.ir", { Status: 2 });
    expect(r.status).toBe("unknown");
    expect(r.hint).toBeUndefined();
  });
});

describe(".ir naming rules (IRNIC Annex 1)", () => {
  it.each([["ab", /3/], ["-abc", /hyphen/], ["ab--cd", /3rd/], ["com", /reserved/], ["bad_name", /a–z/]])(
    "%s rejected", (label, msg) => expect(irLabelError(label)).toMatch(msg));
  it("valid label", () => expect(irLabelError("nikan-shop")).toBeNull());
  it("normalize", () => {
    expect(normalize("Google.IR").domain).toBe("google.ir");
    expect(normalize("نیکان.ir").error).toBeTruthy(); // Persian script not allowed under .ir
    expect(normalize("münchen.com")).toEqual({ domain: "xn--mnchen-3ya.com" });
  });
});

describe("AI output parsing", () => {
  it("cleans, dedupes and clamps", () => {
    const s = parseSuggestions('{"suggestions":[{"name":"Nikan.ir","score":140,"style":"persian","reason":"r"},{"name":"nikan"},{"name":"ab"}]}');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ name: "nikan", score: 100, style: "persian" });
  });
  it("salvages truncated output", () => {
    const s = parseSuggestions('{"suggestions":[{"name":"alpha","score":80,"style":"x","reason":"r","scores":{"length":90}},{"name":"bet');
    expect(s.map((x) => x.name)).toEqual(["alpha"]);
  });
  it("throws on junk", () => expect(() => parseSuggestions("sorry")).toThrow());
  it("heuristic fallback produces valid labels", () => {
    const s = heuristicSuggestions("Nikan", "rug, carpet");
    expect(s.length).toBeGreaterThan(20);
    expect(s.every((x) => /^[a-z0-9-]{3,20}$/.test(x.name))).toBe(true);
  });
});
