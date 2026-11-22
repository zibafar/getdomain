"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown, AudioLines, Ban, Brain, CircleCheck, CircleHelp, CircleX, Copy, ExternalLink, FlaskConical, Gem, Globe,
  KeyRound, Languages, LoaderCircle, Puzzle, RefreshCw, Ruler, Search, ShieldAlert, Sparkles, SpellCheck, Square,
  Target, Wand2, Zap, Columns3, Server, Info, Cpu,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { checkDomain } from "@/lib/availability";
import { MODELS, generateSuggestions, hasWebGPU, heuristicSuggestions } from "@/lib/ai";
import { type CheckResult, type Status, type Suggestion, DEFAULT_TLDS, EXTRA_TLDS, registrarUrl, tldOf } from "@/lib/domains";

type Lang = "en" | "fa";
type Cell = CheckResult | "pending" | undefined;
const COMPARE_TLDS = ["ir", "com", "net", "ai"];

const T = {
  en: {
    tagline: "AI-generated names. Registry-verified availability. .ir first.",
    name: "Brand / project name", namePh: "e.g. Nikan", desc: "What does the business do?",
    descPh: "Online marketplace for handmade Persian rugs, shipping across Iran and to the EU…",
    industry: "Industry", industryPh: "e.g. E-commerce", keywords: "Keywords", keywordsPh: "rug, carpet, handmade",
    tlds: "Extensions", addTld: "Add TLD", model: "In-browser AI model (WebLLM)",
    modelNote: "Runs on your GPU. Downloaded once, then cached. Nothing leaves your browser.",
    noGpu: "WebGPU isn't available in this browser, so AI is off. Using simple keyword combinations instead (Chrome/Edge 113+ enables AI).",
    writing: "Writing suggestions…", providersTip: "Availability: registry RDAP (authoritative) + DNS-over-HTTPS. AI: WebLLM in your browser. No server, no keys.",
    go: "Generate & Check", cancel: "Cancel",
    checking: "Checking availability", of: "of", available: "Available", registered: "Registered", premium: "Premium",
    unknown: "Unknown", pending: "Checking…", all: "All", sortScore: "AI score", sortAvail: "Most available", sortName: "Name",
    copyAvail: "Copy available", recheckUnknown: "Recheck unknown", copied: "Copied", compare: "Compare across TLDs",
    compareTitle: "Same name across extensions", emptyTitle: "Describe your idea to begin",
    emptyBody: "We'll brainstorm 30+ names with AI, then check every domain against the real registries.",
    aiNote: "AI score = naming opinion. Availability = registry lookup. They are never mixed.",
    irTitle: ".ir — checked separately (IRNIC has no public browser API)",
    irHow: "IRNIC (the .ir registry) has no RDAP or browser-accessible lookup; its WHOIS and EPP can't be reached from a web page. We use DNS: names with nameservers are confirmed Registered. Names absent from DNS show as Unknown · may be free, because a name can be registered without nameservers, on hold or reserved. Confirm at whois.nic.ir before buying.",
    irElig: "Eligibility: .ir names must follow IRNIC rules (a–z 0–9 -, 3–63 chars). Geographic, religious and national names need permits. Verify before purchase.",
    likelyFree: "may be free", unverified: "unverified", noResults: "No domains match these filters.",
    recheck: "Recheck", open: "Register / look up", copy: "Copy", source: "Source", checkedAt: "Checked",
    crit: { brandability: "Brandability", memorability: "Memorability", pronunciation: "Pronunciation", length: "Length", relevance: "Relevance", international: "International" },
    other: "Other: ", errors: "AI generation failed", fallback: "using keyword combinations instead",
  },
  fa: {
    tagline: "نام‌های پیشنهادی هوش مصنوعی، استعلام واقعی از رجیستری؛ اولویت با ‎.ir",
    name: "نام برند / پروژه", namePh: "مثلاً نیکان", desc: "کسب‌وکار شما چه می‌کند؟",
    descPh: "فروشگاه آنلاین فرش دستباف ایرانی با ارسال به سراسر ایران و اروپا…",
    industry: "حوزه فعالیت", industryPh: "مثلاً تجارت الکترونیک", keywords: "کلیدواژه‌ها", keywordsPh: "فرش، دستباف، گلیم",
    tlds: "پسوندها", addTld: "افزودن پسوند", model: "مدل هوش مصنوعی درون مرورگر (WebLLM)",
    modelNote: "روی GPU شما اجرا می‌شود؛ یک‌بار دانلود و ذخیره می‌شود. هیچ داده‌ای از مرورگر خارج نمی‌شود.",
    noGpu: "مرورگر شما WebGPU ندارد؛ به‌جای هوش مصنوعی از ترکیب ساده کلیدواژه‌ها استفاده می‌شود (Chrome/Edge 113+).",
    writing: "در حال نوشتن پیشنهادها…", providersTip: "وضعیت دامنه: RDAP رجیستری (معتبر) + DNS-over-HTTPS. هوش مصنوعی: WebLLM در مرورگر. بدون سرور و بدون کلید.",
    go: "تولید و استعلام", cancel: "توقف",
    checking: "در حال استعلام", of: "از", available: "آزاد", registered: "ثبت‌شده", premium: "پریمیوم",
    unknown: "نامشخص", pending: "در حال بررسی…", all: "همه", sortScore: "امتیاز هوش مصنوعی", sortAvail: "بیشترین آزاد", sortName: "نام",
    copyAvail: "کپی دامنه‌های آزاد", recheckUnknown: "استعلام مجدد نامشخص‌ها", copied: "کپی شد", compare: "مقایسه پسوندها",
    compareTitle: "یک نام در پسوندهای مختلف", emptyTitle: "ایده‌تان را توصیف کنید",
    emptyBody: "بیش از ۳۰ نام با هوش مصنوعی ساخته و هر دامنه از رجیستری واقعی استعلام می‌شود.",
    aiNote: "امتیاز هوش مصنوعی فقط نظر درباره نام است؛ وضعیت دامنه از رجیستری استعلام می‌شود.",
    irTitle: "‎.ir — استعلام جداگانه (ایرنیک API عمومی برای مرورگر ندارد)",
    irHow: "ایرنیک (رجیستری ‎.ir) سرویس RDAP یا استعلام قابل‌دسترس از مرورگر ندارد و WHOIS و EPP آن از صفحه وب در دسترس نیستند. از DNS استفاده می‌کنیم: دامنه‌های دارای نیم‌سرور «ثبت‌شده» تأیید می‌شوند. دامنه‌های غایب در DNS «نامشخص · شاید آزاد» نمایش داده می‌شوند، چون ممکن است بدون نیم‌سرور ثبت، معلق یا رزرو شده باشند. پیش از خرید در whois.nic.ir بررسی کنید.",
    irElig: "شرایط: نام ‎.ir باید طبق قواعد ایرنیک باشد (a–z، ۰–۹، خط تیره؛ ۳ تا ۶۳ نویسه). نام‌های جغرافیایی، مذهبی و ملی نیاز به مجوز دارند. پیش از خرید بررسی کنید.",
    likelyFree: "شاید آزاد", unverified: "تأییدنشده", noResults: "دامنه‌ای با این فیلترها نیست.",
    recheck: "استعلام مجدد", open: "ثبت / جستجو", copy: "کپی", source: "منبع", checkedAt: "زمان استعلام",
    crit: { brandability: "برندپذیری", memorability: "به‌یادماندنی", pronunciation: "تلفظ", length: "طول", relevance: "ارتباط", international: "بین‌المللی" },
    other: "دیگر: ", errors: "تولید نام با هوش مصنوعی ناموفق بود", fallback: "از ترکیب کلیدواژه‌ها استفاده شد",
  },
} as const;

const STATUS: Record<Status | "pending", { icon: typeof CircleCheck; cls: string; dot: string }> = {
  available: { icon: CircleCheck, cls: "text-emerald-600 bg-emerald-500/10 ring-emerald-500/30 dark:text-emerald-400", dot: "bg-emerald-500" },
  registered: { icon: CircleX, cls: "text-rose-600/80 bg-rose-500/5 ring-rose-500/20 dark:text-rose-400/80", dot: "bg-rose-400" },
  premium: { icon: Gem, cls: "text-amber-600 bg-amber-500/10 ring-amber-500/30 dark:text-amber-400", dot: "bg-amber-500" },
  unknown: { icon: CircleHelp, cls: "text-zinc-500 bg-zinc-500/10 ring-zinc-500/20", dot: "bg-zinc-400" },
  pending: { icon: LoaderCircle, cls: "text-indigo-500 bg-indigo-500/5 ring-indigo-500/20", dot: "bg-indigo-400 animate-pulse" },
};
const STYLE_ICON: Record<string, typeof Sparkles> = {
  brandable: Sparkles, invented: FlaskConical, keyword: KeyRound, "prefix-suffix": Puzzle, spelling: SpellCheck,
  persian: Languages, international: Globe, short: Zap,
};
const CRIT_ICON = { brandability: Sparkles, memorability: Brain, pronunciation: AudioLines, length: Ruler, relevance: Target, international: Globe };

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
const statusOf = (c: Cell): Status | "pending" | undefined => (c === "pending" ? "pending" : c?.status);
const likelyFree = (c: Cell) => typeof c === "object" && c.status === "unknown" && c.hint === "not-delegated";

export function DomainFinder() {
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  }, [lang]);

  // form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [keywords, setKeywords] = useState("");
  const [tlds, setTlds] = useState<string[]>(["ir", "com", "net", "ai", "io"]);
  const [customTld, setCustomTld] = useState("");
  const [model, setModel] = useState<string>(MODELS[0].id);
  const [gpu, setGpu] = useState(true);
  useEffect(() => { hasWebGPU().then(setGpu); }, []);
  const [aiStage, setAiStage] = useState<{ text: string; pct: number } | null>(null);

  // results
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checks, setChecks] = useState<Record<string, Cell>>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [compareName, setCompareName] = useState("");
  const [searchTlds, setSearchTlds] = useState<string[]>([]);

  // filters
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [tldFilter, setTldFilter] = useState("all");
  const [sort, setSort] = useState<"score" | "avail" | "name">("score");

  // ---------- concurrent check queue (cancellable, partial results stream in) ----------
  const q = useRef({ items: [] as { d: string; fresh: boolean }[], active: 0, ctrl: new AbortController() });
  const genCtrl = useRef<AbortController | null>(null);

  async function worker() {
    const s = q.current;
    const ctrl = s.ctrl;
    while (s.items.length && !ctrl.signal.aborted) {
      const { d, fresh } = s.items.shift()!;
      try {
        const r = await checkDomain(d, fresh, ctrl.signal); // never throws except on abort
        setChecks((c) => ({ ...c, [d]: r }));
      } catch {
        if (ctrl.signal.aborted) break;
        setChecks((c) => ({ ...c, [d]: { domain: d, status: "unknown", source: "app", checkedAt: new Date().toISOString(), note: "Network error" } }));
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    s.active--;
  }

  function enqueue(domains: string[], fresh = false) {
    const s = q.current;
    const queued = new Set(s.items.map((i) => i.d));
    const add = [...new Set(domains)].filter((d) => !queued.has(d));
    if (!add.length) return;
    s.items.push(...add.map((d) => ({ d, fresh })));
    setChecks((c) => ({ ...c, ...Object.fromEntries(add.map((d) => [d, "pending" as const])) }));
    setProgress((p) => ({ ...p, total: p.total + add.length }));
    while (s.active < 8 && s.items.length) { s.active++; void worker(); }
  }

  function cancel() {
    genCtrl.current?.abort();
    const s = q.current;
    s.ctrl.abort();
    s.items = [];
    s.ctrl = new AbortController();
    setChecks((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== "pending")));
    setProgress((p) => ({ done: p.done, total: p.done }));
    setGenerating(false);
    setAiStage(null);
  }

  async function submit() {
    cancel();
    setChecks({}); setProgress({ done: 0, total: 0 }); setSuggestions(null);
    const brand = slug(name);
    const searchT = [...tlds];
    setSearchTlds(searchT);
    setCompareName(brand);
    if (brand) enqueue([...new Set([...COMPARE_TLDS, ...searchT])].map((x) => `${brand}.${x}`));
    if (!description.trim() && !name.trim()) return;

    setGenerating(true);
    const ctrl = (genCtrl.current = new AbortController());
    try {
      let list: Suggestion[];
      try {
        if (!gpu) throw new Error(t.noGpu);
        list = await generateSuggestions({
          model, name, description, industry, keywords, tlds: searchT, lang, signal: ctrl.signal,
          onLoad: (r) => setAiStage({ text: r.text, pct: Math.round(r.progress * 100) }),
          onCount: (n) => setAiStage({ text: `${t.writing} ${n}`, pct: Math.min(99, Math.round((n / 30) * 100)) }),
        });
      } catch (e) {
        if (ctrl.signal.aborted) throw e;
        if (gpu) toast.warning(t.errors, { description: `${(e as Error).message} — ${t.fallback}` });
        list = heuristicSuggestions(name, `${keywords} ${industry}`);
      }
      setSuggestions(list);
      // round-robin by name so every TLD host gets work in parallel; best names first
      const ordered = [...list].sort((a, b) => b.score - a.score);
      enqueue(ordered.flatMap((s) => searchT.map((x) => `${s.name}.${x}`)));
    } catch (e) {
      if (!ctrl.signal.aborted) toast.error(t.errors, { description: (e as Error).message });
    } finally {
      setGenerating(false);
      setAiStage(null);
    }
  }

  // ---------- derived ----------
  const running = progress.done < progress.total;
  const allDomains = useMemo(
    () => (suggestions ?? []).flatMap((s) => searchTlds.map((x) => `${s.name}.${x}`)),
    [suggestions, searchTlds],
  );
  const counts = useMemo(() => {
    const c = { available: 0, registered: 0, premium: 0, unknown: 0 };
    for (const d of allDomains) { const s = statusOf(checks[d]); if (s && s !== "pending") c[s]++; }
    return c;
  }, [allDomains, checks]);

  const rowVisible = (d: string) =>
    (tldFilter === "all" || tldOf(d) === tldFilter) && (statusFilter === "all" || statusOf(checks[d]) === statusFilter);

  const visible = useMemo(() => {
    const list = (suggestions ?? []).filter((s) => searchTlds.some((x) => rowVisible(`${s.name}.${x}`)));
    const avail = (s: Suggestion) => searchTlds.filter((x) => statusOf(checks[`${s.name}.${x}`]) === "available").length;
    return list.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "avail" ? avail(b) - avail(a) || b.score - a.score : b.score - a.score));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, searchTlds, checks, sort, statusFilter, tldFilter]);

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success(t.copied, { description: text.length > 60 ? undefined : text }));
  const availableList = allDomains.filter((d) => statusOf(checks[d]) === "available" && rowVisible(d));

  // ---------- render ----------
  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative min-h-screen overflow-x-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent)]" />
        <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
              <Globe className="size-5" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">DomainForge</div>
              <div className="hidden text-xs text-muted-foreground sm:block">{t.tagline}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="hidden gap-1 sm:flex"><Server className="size-3" />RDAP · DNS · WebLLM</Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{t.providersTip}</TooltipContent>
            </Tooltip>
            <Button variant="outline" size="sm" onClick={() => setLang(lang === "en" ? "fa" : "en")} className="gap-1.5">
              <Languages className="size-4" />{lang === "en" ? "فارسی" : "English"}
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-6 px-4 pb-24">
          {/* ---------- search ---------- */}
          <section className="rounded-2xl border bg-card/80 p-4 shadow-xl shadow-indigo-500/5 backdrop-blur sm:p-6">
            <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
              <div className="space-y-3">
                <Field icon={Sparkles} label={t.name}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} className="h-11 text-base" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field icon={Target} label={t.industry}>
                    <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder={t.industryPh} />
                  </Field>
                  <Field icon={KeyRound} label={t.keywords}>
                    <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={t.keywordsPh} />
                  </Field>
                </div>
              </div>
              <Field icon={Wand2} label={t.desc}>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.descPh} className="min-h-[124px] resize-none" />
              </Field>
            </div>

            <div className="mt-4 space-y-2">
              <Label icon={Globe}>{t.tlds}</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {[...new Set([...DEFAULT_TLDS, ...EXTRA_TLDS, ...tlds])].map((x) => {
                  const on = tlds.includes(x);
                  return (
                    <button key={x} type="button" onClick={() => setTlds(on ? tlds.filter((y) => y !== x) : [...tlds, x])}
                      className={cn("rounded-full border px-3 py-1 font-mono text-sm transition-all active:scale-95",
                        on ? "border-primary bg-primary text-primary-foreground shadow-sm" : "hover:border-primary/50 hover:bg-accent",
                        x === "ir" && !on && "border-emerald-500/40", x === "ir" && on && "bg-emerald-600 border-emerald-600")}>
                      .{x}{x === "ir" && <span className="ms-1 text-[10px]">🇮🇷</span>}
                    </button>
                  );
                })}
                <form className="flex" onSubmit={(e) => { e.preventDefault(); const v = slug(customTld.replace(/^\./, "")); if (v && !tlds.includes(v)) setTlds([...tlds, v]); setCustomTld(""); }}>
                  <Input value={customTld} onChange={(e) => setCustomTld(e.target.value)} placeholder={`+ ${t.addTld}`} className="h-8 w-28 rounded-full font-mono text-sm" />
                </form>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end">
              {gpu ? (
                <div className="flex-1 space-y-1.5">
                  <Label icon={Brain}>{t.model}</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="w-full sm:w-96"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <Cpu className="size-4" />{m.label} <span className="text-muted-foreground">· {m.size}{m.note && ` · ${m.note}`}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t.modelNote}</p>
                </div>
              ) : (
                <div className="flex flex-1 items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                  <ShieldAlert className="size-4 shrink-0" />{t.noGpu}
                </div>
              )}
              {running || generating ? (
                <Button size="lg" variant="outline" onClick={cancel} className="gap-2"><Square className="size-4" />{t.cancel}</Button>
              ) : (
                <Button size="lg" onClick={submit} disabled={!tlds.length || (!name.trim() && !description.trim())}
                  className="gap-2 bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/25 transition-transform hover:scale-[1.02] hover:from-indigo-500 hover:to-fuchsia-500">
                  <Search className="size-4" />{t.go}
                </Button>
              )}
            </div>
          </section>

          {/* ---------- AI progress ---------- */}
          {aiStage && (
            <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 animate-in fade-in slide-in-from-top-2">
              <Brain className="size-4 animate-pulse text-fuchsia-500" />
              <span className="min-w-0 flex-1 truncate text-sm" dir="ltr">{aiStage.text}</span>
              <Progress value={aiStage.pct} className="h-2 w-40 shrink-0" />
            </div>
          )}

          {/* ---------- progress ---------- */}
          {progress.total > 0 && (
            <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 animate-in fade-in slide-in-from-top-2">
              {running ? <LoaderCircle className="size-4 animate-spin text-primary" /> : <CircleCheck className="size-4 text-emerald-500" />}
              <span className="text-sm whitespace-nowrap">{t.checking} <b className="tabular-nums">{progress.done}</b> {t.of} <span className="tabular-nums">{progress.total}</span></span>
              <Progress value={(progress.done / progress.total) * 100} className="h-2" />
            </div>
          )}

          {/* ---------- brand / name comparison across TLDs ---------- */}
          {compareName && (
            <CompareStrip name={compareName} tlds={[...new Set([...COMPARE_TLDS, ...searchTlds])]} checks={checks} t={t}
              onRecheck={(d) => enqueue([d], true)} onCopy={copy} />
          )}

          {/* ---------- .ir info ---------- */}
          {searchTlds.includes("ir") && (suggestions || generating) && (
            <div className="grid gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm sm:grid-cols-[auto_1fr]">
              <div className="grid size-9 place-items-center rounded-lg bg-emerald-600 font-bold text-white">IR</div>
              <div className="space-y-1">
                <div className="font-medium">{t.irTitle}</div>
                <p className="text-muted-foreground">{t.irHow}</p>
                <p className="flex gap-1.5 text-amber-700 dark:text-amber-300"><ShieldAlert className="mt-0.5 size-4 shrink-0" />{t.irElig}</p>
              </div>
            </div>
          )}

          {/* ---------- toolbar ---------- */}
          {suggestions && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["available", "premium", "registered", "unknown"] as const).map((s) => {
                  const I = STATUS[s].icon;
                  return (
                    <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                      className={cn("flex items-center gap-3 rounded-xl border bg-card p-3 text-start transition-all hover:-translate-y-0.5 hover:shadow-md",
                        statusFilter === s && "ring-2 ring-primary")}>
                      <span className={cn("grid size-9 place-items-center rounded-lg ring-1", STATUS[s].cls)}><I className="size-5" /></span>
                      <span>
                        <span className="block text-2xl font-semibold tabular-nums leading-none">{counts[s]}</span>
                        <span className="text-xs text-muted-foreground">{t[s]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
                  {["all", ...searchTlds].map((x) => (
                    <button key={x} onClick={() => setTldFilter(x)}
                      className={cn("rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
                        tldFilter === x ? (x === "ir" ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground") : "hover:bg-muted",
                        x === "ir" && tldFilter !== x && "text-emerald-600 font-semibold")}>
                      {x === "all" ? t.all : `.${x}`}
                    </button>
                  ))}
                </div>
                <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
                  <SelectTrigger size="sm" className="w-auto gap-1.5"><ArrowUpDown className="size-3.5" /><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="score">{t.sortScore}</SelectItem>
                    <SelectItem value="avail">{t.sortAvail}</SelectItem>
                    <SelectItem value="name">{t.sortName}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="ms-auto flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={running}
                    onClick={() => enqueue(allDomains.filter((d) => statusOf(checks[d]) === "unknown" && checks[d] && (checks[d] as CheckResult).source !== "validation"), true)}>
                    <RefreshCw className="size-3.5" />{t.recheckUnknown}
                  </Button>
                  <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500" disabled={!availableList.length}
                    onClick={() => copy(availableList.join("\n"))}>
                    <Copy className="size-3.5" />{t.copyAvail} ({availableList.length})
                  </Button>
                </div>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="size-3.5" />{t.aiNote}</p>
            </div>
          )}

          {/* ---------- results ---------- */}
          {generating && !suggestions && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-3 rounded-2xl border bg-card p-4">
                  <div className="flex justify-between"><Skeleton className="h-6 w-32" /><Skeleton className="size-12 rounded-full" /></div>
                  <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" />
                  <div className="space-y-1.5 pt-2">{[0, 1, 2].map((j) => <Skeleton key={j} className="h-8 w-full" />)}</div>
                </div>
              ))}
            </div>
          )}

          {!suggestions && !generating && !compareName && (
            <div className="grid place-items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                <div className="relative grid size-14 place-items-center rounded-full bg-primary/10 text-primary"><Wand2 className="size-7" /></div>
              </div>
              <div className="font-medium">{t.emptyTitle}</div>
              <p className="max-w-sm text-sm text-muted-foreground">{t.emptyBody}</p>
              <div className="flex gap-3 pt-2">
                {(["available", "registered", "premium", "unknown"] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1 text-xs text-muted-foreground"><span className={cn("size-2 rounded-full", STATUS[s].dot)} />{t[s]}</span>
                ))}
              </div>
            </div>
          )}

          {suggestions && !visible.length && (
            <div className="grid place-items-center gap-2 py-12 text-muted-foreground"><Ban className="size-6" />{t.noResults}</div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((s, i) => (
              <NameCard key={s.name} s={s} i={i} t={t} checks={checks}
                tlds={searchTlds.filter((x) => rowVisible(`${s.name}.${x}`))}
                onRecheck={(d) => enqueue([d], true)} onCopy={copy}
                onCompare={() => { setCompareName(s.name); enqueue(COMPARE_TLDS.map((x) => `${s.name}.${x}`).filter((d) => !checks[d])); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
            ))}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------

type Dict = (typeof T)[Lang];

function Label({ icon: I, children }: { icon: typeof Sparkles; children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><I className="size-3.5" />{children}</div>;
}
function Field({ icon, label, children }: { icon: typeof Sparkles; label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><Label icon={icon}>{label}</Label>{children}</label>;
}

function ScoreRing({ score }: { score: number }) {
  const r = 20, c = 2 * Math.PI * r;
  const color = score >= 80 ? "stroke-emerald-500" : score >= 60 ? "stroke-indigo-500" : score >= 40 ? "stroke-amber-500" : "stroke-rose-500";
  return (
    <div className="relative size-12 shrink-0">
      <svg viewBox="0 0 48 48" className="size-12 -rotate-90">
        <circle cx="24" cy="24" r={r} className="fill-none stroke-muted" strokeWidth="4" />
        <circle cx="24" cy="24" r={r} className={cn("fill-none transition-[stroke-dashoffset] duration-700", color)} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">{score}</span>
    </div>
  );
}

function StatusPill({ cell, t, compact }: { cell: Cell; t: Dict; compact?: boolean }) {
  const s = statusOf(cell) ?? "unknown";
  const I = STATUS[s].icon;
  const free = likelyFree(cell);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 whitespace-nowrap", free ? "text-teal-600 bg-teal-500/10 ring-teal-500/30 dark:text-teal-400" : STATUS[s].cls)}>
      <I className={cn("size-3.5", s === "pending" && "animate-spin")} />
      {!compact && (free ? `${t.unknown} · ${t.likelyFree}` : t[s])}
    </span>
  );
}

function CellInfo({ cell, t }: { cell: Cell; t: Dict }) {
  if (typeof cell !== "object") return null;
  return (
    <div className="space-y-0.5 text-xs">
      {cell.note && <div>{cell.note}</div>}
      <div className="opacity-70">{t.source}: {cell.source} · {t.checkedAt}: {new Date(cell.checkedAt).toLocaleTimeString()}</div>
    </div>
  );
}

function DomainRow({ d, cell, t, onRecheck, onCopy }: { d: string; cell: Cell; t: Dict; onRecheck: (d: string) => void; onCopy: (s: string) => void }) {
  const isIr = tldOf(d) === "ir";
  const s = statusOf(cell);
  return (
    <div className={cn("group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60",
      isIr && "bg-emerald-500/5 ring-1 ring-emerald-500/20", s === "available" && "bg-emerald-500/5")}>
      <Tooltip>
        <TooltipTrigger asChild><span><StatusPill cell={cell} t={t} compact /></span></TooltipTrigger>
        <TooltipContent className="max-w-xs"><CellInfo cell={cell} t={t} /></TooltipContent>
      </Tooltip>
      <span dir="ltr" className={cn("min-w-0 flex-1 truncate font-mono text-sm", s === "registered" && "text-muted-foreground line-through decoration-rose-400/50")}>
        {d.slice(0, d.indexOf("."))}<span className={cn("font-semibold", isIr ? "text-emerald-600" : "text-primary")}>.{tldOf(d)}</span>
      </span>
      {typeof cell === "object" && cell.price && <Badge variant="secondary" className="font-mono text-[10px]">{cell.price}</Badge>}
      {likelyFree(cell) && <span className="text-[10px] text-teal-600">{t.likelyFree}</span>}
      {isIr && (s === "available" || likelyFree(cell) || (typeof cell === "object" && cell.restricted)) && (
        <Tooltip>
          <TooltipTrigger asChild><ShieldAlert className="size-3.5 text-amber-500" /></TooltipTrigger>
          <TooltipContent className="max-w-xs">{typeof cell === "object" && cell.source === "validation" ? cell.note : t.irElig}</TooltipContent>
        </Tooltip>
      )}
      <div className="flex opacity-60 transition-opacity group-hover:opacity-100">
        <IconBtn label={t.copy} onClick={() => onCopy(d)}><Copy /></IconBtn>
        <IconBtn label={t.recheck} onClick={() => onRecheck(d)} disabled={s === "pending"}><RefreshCw /></IconBtn>
        <IconBtn label={t.open} asLink={registrarUrl(d)}><ExternalLink /></IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ label, children, onClick, disabled, asLink }: { label: string; children: React.ReactNode; onClick?: () => void; disabled?: boolean; asLink?: string }) {
  const cls = "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40 [&_svg]:size-3.5";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {asLink
          ? <a href={asLink} target="_blank" rel="noreferrer" aria-label={label} className={cls}>{children}</a>
          : <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className={cls}>{children}</button>}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function NameCard({ s, i, t, tlds, checks, onRecheck, onCopy, onCompare }: {
  s: Suggestion; i: number; t: Dict; tlds: string[]; checks: Record<string, Cell>;
  onRecheck: (d: string) => void; onCopy: (s: string) => void; onCompare: () => void;
}) {
  const StyleIcon = STYLE_ICON[s.style] ?? Sparkles;
  const ordered = [...tlds].sort((a, b) => (a === "ir" ? -1 : b === "ir" ? 1 : 0)); // .ir first
  const anyAvail = tlds.some((x) => statusOf(checks[`${s.name}.${x}`]) === "available");
  return (
    <article style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
      className={cn("group/card flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 fill-mode-both hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10",
        anyAvail && "border-emerald-500/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 dir="ltr" className="truncate text-start font-mono text-xl font-semibold tracking-tight">{s.name}</h3>
          <Badge variant="secondary" className="gap-1 capitalize"><StyleIcon className="size-3" />{s.style}</Badge>
        </div>
        <Tooltip>
          <TooltipTrigger asChild><div><ScoreRing score={s.score} /></div></TooltipTrigger>
          <TooltipContent>AI score (opinion, not availability)</TooltipContent>
        </Tooltip>
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{s.reason}</p>
      {s.scores && Object.keys(s.scores).length > 0 && (
        <div className="grid grid-cols-6 gap-1.5">
          {(Object.keys(CRIT_ICON) as (keyof typeof CRIT_ICON)[]).map((k) => {
            const I = CRIT_ICON[k]; const v = s.scores?.[k] ?? 0;
            return (
              <Tooltip key={k}>
                <TooltipTrigger asChild>
                  <div className="space-y-1">
                    <I className="mx-auto size-3.5 text-muted-foreground" />
                    <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${v}%` }} /></div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>{t.crit[k]}: {v}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
      <div className="mt-auto space-y-1">
        {ordered.map((x) => <DomainRow key={x} d={`${s.name}.${x}`} cell={checks[`${s.name}.${x}`]} t={t} onRecheck={onRecheck} onCopy={onCopy} />)}
      </div>
      <Button variant="ghost" size="sm" onClick={onCompare} className="gap-1.5 self-start text-xs text-muted-foreground">
        <Columns3 className="size-3.5" />{t.compare}
      </Button>
    </article>
  );
}

function CompareStrip({ name, tlds, checks, t, onRecheck, onCopy }: {
  name: string; tlds: string[]; checks: Record<string, Cell>; t: Dict;
  onRecheck: (d: string) => void; onCopy: (s: string) => void;
}) {
  const ds = tlds.map((x) => `${name}.${x}`);
  return (
    <section className="rounded-2xl border bg-card p-4 animate-in fade-in">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Columns3 className="size-4 text-primary" />{t.compareTitle}: <span dir="ltr" className="font-mono text-primary">{name}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {ds.map((d) => {
          const cell = checks[d]; const s = statusOf(cell) ?? "pending"; const isIr = tldOf(d) === "ir";
          return (
            <Tooltip key={d}>
              <TooltipTrigger asChild>
                <div className={cn("group relative rounded-xl p-3 ring-1 transition-all hover:-translate-y-0.5", likelyFree(cell) ? "bg-teal-500/10 ring-teal-500/30" : STATUS[s].cls, isIr && "ring-2")}>
                  <div dir="ltr" className="font-mono text-lg font-semibold">.{tldOf(d)}{isIr && " 🇮🇷"}</div>
                  <StatusPill cell={cell} t={t} />
                  <div className="absolute end-1 top-1 flex opacity-0 transition-opacity group-hover:opacity-100">
                    <IconBtn label={t.copy} onClick={() => onCopy(d)}><Copy /></IconBtn>
                    <IconBtn label={t.recheck} onClick={() => onRecheck(d)}><RefreshCw /></IconBtn>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs"><div dir="ltr" className="font-mono">{d}</div><CellInfo cell={cell} t={t} /></TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
}
