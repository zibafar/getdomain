// Server-only: AI providers via plain fetch (keys never leave the server).
import type { Suggestion } from "./domains";

export type ProviderId = "anthropic" | "openai" | "gemini" | "compatible";

const env = process.env;
export const PROVIDERS: Record<ProviderId, { label: string; ready: () => boolean; model: () => string }> = {
  anthropic: { label: "Anthropic Claude", ready: () => !!env.ANTHROPIC_API_KEY, model: () => env.ANTHROPIC_MODEL || "claude-opus-5-5" },
  openai: { label: "OpenAI", ready: () => !!env.OPENAI_API_KEY, model: () => env.OPENAI_MODEL || "gpt-4.1-mini" },
  gemini: { label: "Google Gemini", ready: () => !!env.GEMINI_API_KEY, model: () => env.GEMINI_MODEL || "gemini-2.5-flash" },
  compatible: {
    label: "OpenAI-compatible",
    ready: () => !!env.COMPAT_BASE_URL,
    model: () => env.COMPAT_MODEL || "llama3.1",
  },
};

export const readyProviders = () =>
  (Object.keys(PROVIDERS) as ProviderId[]).filter((p) => PROVIDERS[p].ready()).map((id) => ({ id, label: PROVIDERS[id].label, model: PROVIDERS[id].model() }));

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${j?.error?.message ?? j?.message ?? res.statusText}`);
  return j;
}

async function complete(provider: ProviderId, model: string, system: string, user: string): Promise<string> {
  switch (provider) {
    case "anthropic": {
      const j = await post(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        { model, max_tokens: 16000, output_config: { effort: "low" }, system, messages: [{ role: "user", content: user }] },
      );
      if (j.stop_reason === "refusal") throw new Error("The model declined this request");
      return (j.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    }
    case "gemini": {
      const j = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { "x-goog-api-key": env.GEMINI_API_KEY! },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json" },
        },
      );
      return j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    }
    default: {
      const base = provider === "openai" ? "https://api.openai.com/v1" : env.COMPAT_BASE_URL!.replace(/\/$/, "");
      const key = provider === "openai" ? env.OPENAI_API_KEY : env.COMPAT_API_KEY;
      const j = await post(`${base}/chat/completions`, key ? { Authorization: `Bearer ${key}` } : {}, {
        model,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      });
      return j.choices?.[0]?.message?.content ?? "";
    }
  }
}

const SYSTEM = `You are a senior brand-naming strategist for global and Iranian markets.
Return ONLY JSON: {"suggestions":[{"name":"label-without-tld","style":"...","score":0-100,"reason":"...","scores":{"brandability":0-100,"memorability":0-100,"pronunciation":0-100,"length":0-100,"relevance":0-100,"international":0-100}}]}
Rules:
- "name" is the second-level label only: lowercase a-z, 0-9, hyphen; 3-20 chars; no TLD, no spaces, no leading/trailing hyphen.
- style is one of: brandable, invented, keyword, prefix-suffix, spelling, persian, international, short.
- Include at least 6 "persian" names: Persian words or Persian-inspired roots written in Latin letters (Finglish) that read well for Iranians and are pronounceable abroad, suited to .ir.
- Mix creative brandables, invented words, industry terms, alternative spellings, prefix/suffix combos (get-, try-, -hub, -ly, -io...), short names, and close variations of the brand name itself.
- No near-duplicates, no generic filler.
- score is your opinion of name quality only. You do NOT know whether any domain is available; never mention availability.
- reason: one short sentence (max 18 words) in the requested language.`;

export async function generateSuggestions(opts: {
  provider: ProviderId; model?: string; name: string; description: string; industry?: string; keywords?: string; tlds: string[]; lang: "en" | "fa"; count?: number;
}): Promise<Suggestion[]> {
  const p = PROVIDERS[opts.provider];
  if (!p?.ready()) throw new Error(`AI provider "${opts.provider}" is not configured on the server`);
  const user = [
    `Brand/project: ${opts.name || "(none yet)"}`,
    `Description: ${opts.description}`,
    opts.industry && `Industry: ${opts.industry}`,
    opts.keywords && `Keywords: ${opts.keywords}`,
    `Target TLDs: ${opts.tlds.map((t) => "." + t).join(" ")}${opts.tlds.includes("ir") ? " (.ir is a priority: Iranian market)" : ""}`,
    `Write "reason" in ${opts.lang === "fa" ? "Persian (Farsi)" : "English"}.`,
    `Generate ${opts.count ?? 32} suggestions.`,
  ].filter(Boolean).join("\n");

  const text = await complete(opts.provider, opts.model || p.model(), SYSTEM, user);
  return parseSuggestions(text);
}

/** Tolerant JSON extraction + sanitising. Exported for tests. */
export function parseSuggestions(text: string): Suggestion[] {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let data: { suggestions?: unknown };
  try { data = JSON.parse(json); } catch { throw new Error("AI returned malformed JSON"); }
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of (Array.isArray(data.suggestions) ? data.suggestions : []) as Record<string, unknown>[]) {
    const name = String(s.name ?? "").toLowerCase().replace(/\.[a-z.]+$/, "").replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    if (name.length < 3 || seen.has(name)) continue;
    seen.add(name);
    const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    out.push({
      name,
      style: String(s.style ?? "brandable"),
      score: clamp(s.score),
      reason: String(s.reason ?? "").slice(0, 200),
      scores: Object.fromEntries(Object.entries((s.scores as Record<string, unknown>) ?? {}).map(([k, v]) => [k, clamp(v)])),
    });
  }
  if (!out.length) throw new Error("AI returned no usable suggestions");
  return out;
}
