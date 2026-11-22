// In-browser AI via WebLLM (WebGPU). No server, no API keys. Weights are cached by the browser.
import type { InitProgressReport, MLCEngineInterface } from "@mlc-ai/web-llm";
import type { Suggestion } from "./domains";

export const MODELS = [
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 · 1.5B", size: "≈1.6 GB", note: "recommended · multilingual" },
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 · 0.5B", size: "≈0.9 GB", note: "fastest" },
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 · 3B", size: "≈2.5 GB", note: "best quality" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 · 3B", size: "≈2.3 GB", note: "" },
  { id: "gemma-2-2b-it-q4f16_1-MLC", label: "Gemma 2 · 2B", size: "≈1.9 GB", note: "" },
] as const;

/** True only if a real GPU adapter is available ("gpu" in navigator alone is not enough). */
export async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

let engine: Promise<MLCEngineInterface> | null = null;
let current = "";

export async function loadModel(model: string, onProgress: (r: InitProgressReport) => void): Promise<MLCEngineInterface> {
  if (!engine) {
    const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
    current = model;
    engine = CreateWebWorkerMLCEngine(
      new Worker(new URL("./llm.worker.ts", import.meta.url), { type: "module" }),
      model,
      { initProgressCallback: onProgress },
    );
    engine.catch(() => { engine = null; current = ""; });
    return engine;
  }
  const e = await engine;
  e.setInitProgressCallback(onProgress);
  if (current !== model) { current = model; await e.reload(model); }
  return e;
}

const SYSTEM = `You are a brand-naming expert for global and Iranian markets. Output JSON only.
Each suggestion: "name" = second-level label only (lowercase a-z, 0-9, hyphen; 3-20 chars; no TLD, no spaces).
"style" is one of: brandable, invented, keyword, prefix-suffix, spelling, persian, international, short.
Include several "persian" names: Persian words/roots in Latin letters (Finglish), easy to say abroad, good for .ir.
Mix invented words, industry terms, alternative spellings, prefix/suffix combos and short names. No duplicates.
"score" (0-100) and "scores" rate only the NAME. You do not know if any domain is available; never claim it.
"reason": one short sentence.`;

const SCORE = { type: "integer" };
const SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" }, style: { type: "string" }, score: SCORE, reason: { type: "string" },
          scores: {
            type: "object",
            properties: { brandability: SCORE, memorability: SCORE, pronunciation: SCORE, length: SCORE, relevance: SCORE, international: SCORE },
            required: ["brandability", "memorability", "pronunciation", "length", "relevance", "international"],
          },
        },
        required: ["name", "style", "score", "reason", "scores"],
      },
    },
  },
  required: ["suggestions"],
};

export async function generateSuggestions(opts: {
  model: string; name: string; description: string; industry?: string; keywords?: string; tlds: string[]; lang: "en" | "fa";
  signal: AbortSignal; onLoad: (r: InitProgressReport) => void; onCount: (n: number) => void;
}): Promise<Suggestion[]> {
  const e = await loadModel(opts.model, opts.onLoad);
  const user = [
    `Brand/project: ${opts.name || "(none yet)"}`,
    `Description: ${opts.description}`,
    opts.industry && `Industry: ${opts.industry}`,
    opts.keywords && `Keywords: ${opts.keywords}`,
    `Target extensions: ${opts.tlds.map((t) => "." + t).join(" ")}${opts.tlds.includes("ir") ? " (.ir is a priority: Iranian market)" : ""}`,
    `Write "reason" in ${opts.lang === "fa" ? "Persian (Farsi)" : "English"}.`,
    `Give 30 suggestions.`,
  ].filter(Boolean).join("\n");

  const stream = await e.chat.completions.create({
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
    stream: true,
    temperature: 0.9,
    max_tokens: 3500,
    response_format: { type: "json_object", schema: JSON.stringify(SCHEMA) },
  });
  let text = "";
  for await (const chunk of stream) {
    if (opts.signal.aborted) { e.interruptGenerate(); throw new DOMException("Aborted", "AbortError"); }
    text += chunk.choices[0]?.delta?.content ?? "";
    opts.onCount((text.match(/"name"/g) ?? []).length);
  }
  return parseSuggestions(text);
}

/** Tolerant JSON extraction + sanitising (also salvages a truncated array). Exported for tests. */
export function parseSuggestions(text: string): Suggestion[] {
  let items: Record<string, unknown>[] = [];
  try {
    items = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).suggestions ?? [];
  } catch {
    // truncated output: keep every complete {...} object that has a name
    for (const m of text.matchAll(/\{[^{}]*"name"[^{}]*(\{[^{}]*\})?[^{}]*\}/g)) {
      try { items.push(JSON.parse(m[0])); } catch { /* skip partial */ }
    }
  }
  const seen = new Set<string>();
  const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const out: Suggestion[] = [];
  for (const s of Array.isArray(items) ? items : []) {
    const name = String(s.name ?? "").toLowerCase().replace(/\.[a-z.]+$/, "").replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    if (name.length < 3 || name.length > 30 || seen.has(name)) continue;
    seen.add(name);
    out.push({
      name, style: String(s.style ?? "brandable"), score: clamp(s.score), reason: String(s.reason ?? "").slice(0, 200),
      scores: Object.fromEntries(Object.entries((s.scores as Record<string, unknown>) ?? {}).map(([k, v]) => [k, clamp(v)])),
    });
  }
  if (!out.length) throw new Error("The model returned no usable suggestions — try again or pick a larger model");
  return out;
}

// ---------- fallback without WebGPU: deterministic combinations, clearly labelled ----------
const PRE = ["get", "try", "go", "my", "hey"];
const SUF = ["hub", "ly", "lab", "app", "io", "yar", "ban", "sara", "kade", "estan", "now"]; // yar/ban/sara/kade/estan: Persian suffixes
export function heuristicSuggestions(name: string, keywords: string): Suggestion[] {
  const words = [name, ...keywords.split(/[,،\s]+/)].map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((w) => w.length >= 2);
  const out = new Map<string, Suggestion>();
  const add = (n: string, style: string) => {
    if (n.length < 3 || n.length > 20 || out.has(n)) return;
    const score = Math.max(20, 95 - Math.max(0, n.length - 6) * 6 - (n.includes("-") ? 10 : 0));
    out.set(n, { name: n, style, score, reason: "Heuristic combination (no AI): score reflects length only" });
  };
  for (const w of words) {
    add(w, "keyword");
    SUF.forEach((s, i) => add(w + s, i >= 5 ? "persian" : "prefix-suffix"));
    PRE.forEach((p) => add(p + w, "prefix-suffix"));
    if (w.length > 5) add(w.replace(/[aeiou]/g, "").slice(0, 6), "short");
  }
  for (const a of words) for (const b of words) if (a !== b) add(a + b, "keyword");
  return [...out.values()].slice(0, 40);
}
