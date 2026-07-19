import Link from "next/link";
import { loadClaim } from "@/lib/data";
import { ClaimMargins } from "@/components/claim/ClaimMargins";

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { detail, source } = await loadClaim(id);
  if (!detail) {
    // Reader-facing, so plain language either way; the fixture case (no API
    // configured, e.g. a local design preview) gets one extra sentence of
    // explanation instead of internal vocabulary (#195).
    return (
      <div className="col">
        <p className="sc"><Link href="/claims">← claims</Link></p>
        <h1 className="claim-hero">Claim not found.</h1>
        {source === "fixture" ? (
          <>
            <p style={{ color: "var(--muted)" }}>
              This preview is not connected to the live graph, so only a sample claim is
              available.
            </p>
            <p><Link href="/claims/inflation-2022">→ open the sample claim</Link></p>
          </>
        ) : (
          <>
            <p style={{ color: "var(--muted)" }}>
              There is no claim at this address. The link may be mistyped or out of date.
            </p>
            <p><Link href="/claims">→ browse and search all claims</Link></p>
          </>
        )}
      </div>
    );
  }
  return <ClaimMargins detail={detail} source={source} />;
}
