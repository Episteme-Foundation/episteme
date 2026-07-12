import { NextResponse } from "next/server";
import { loadClaim } from "@/lib/data";

// BFF endpoint for the claim map's client-side recentring. Same seam as the
// server pages (loadClaim: live API with fixture fallback), so the browser
// never talks to the backend directly and the API key stays server-side.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { detail, source } = await loadClaim(id);
  if (!detail) {
    return NextResponse.json({ error: "claim not found" }, { status: 404 });
  }
  return NextResponse.json({ detail, source });
}
