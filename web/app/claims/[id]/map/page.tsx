import Link from "next/link";
import type { Metadata } from "next";
import { loadClaim } from "@/lib/data";
import { GraphView } from "@/components/graph/GraphView";

// The claim map (issue #79): /claims/:id/map is a sibling VIEW of /claims/:id,
// not a separate feature — the same address seen as structure instead of prose.
// Orientation happens here; investigation happens on the claim page.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { detail } = await loadClaim(id);
  if (!detail) return { title: "Claim map — Episteme" };
  const text = detail.claim.text;
  return {
    title: `${text.length > 80 ? `${text.slice(0, 77)}…` : text} · map — Episteme`,
    description: `The claim graph around: ${text}`,
  };
}

export default async function ClaimMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { detail, source } = await loadClaim(id);
  if (!detail) {
    return (
      <div className="col">
        <p className="sc"><Link href="/claims">← claims</Link></p>
        <h1 className="claim-hero">Claim not in the local fixture set.</h1>
        <p style={{ color: "var(--muted)" }}>
          The map opens on any claim once the API is connected.
        </p>
        <p><Link href="/claims/inflation-2022/map">→ open the worked example as a map</Link></p>
      </div>
    );
  }
  return <GraphView initialDetail={detail} source={source} />;
}
