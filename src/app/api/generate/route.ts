import { NextResponse } from "next/server";
import { generateSuggestions, type ProviderId } from "@/lib/ai";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b?.description?.trim() && !b?.name?.trim())
    return NextResponse.json({ error: "Enter a name or a description" }, { status: 400 });
  try {
    const suggestions = await generateSuggestions({
      provider: b.provider as ProviderId,
      model: typeof b.model === "string" ? b.model.slice(0, 100) : undefined,
      name: String(b.name ?? "").slice(0, 100),
      description: String(b.description ?? "").slice(0, 2000),
      industry: String(b.industry ?? "").slice(0, 100),
      keywords: String(b.keywords ?? "").slice(0, 300),
      tlds: Array.isArray(b.tlds) ? b.tlds.map(String).slice(0, 20) : ["com", "ir"],
      lang: b.lang === "fa" ? "fa" : "en",
    });
    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
