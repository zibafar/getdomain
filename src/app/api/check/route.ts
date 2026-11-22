import { NextResponse } from "next/server";
import { checkDomain } from "@/lib/availability";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (typeof b?.domain !== "string" || b.domain.length > 253)
    return NextResponse.json({ error: "domain required" }, { status: 400 });
  // checkDomain never throws for lookup failures — they become status "unknown".
  return NextResponse.json(await checkDomain(b.domain, !!b.fresh));
}
