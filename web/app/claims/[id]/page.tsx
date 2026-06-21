import Link from "next/link";
import { loadClaim } from "@/lib/data";
import { ClaimView } from "@/components/ClaimView";

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { detail, source } = await loadClaim(id);
  if (!detail) {
    return (
      <div className="col">
        <p className="sc"><Link href="/claims">← claims</Link></p>
        <h1 className="claim-hero">Claim not in the local fixture set.</h1>
        <p style={{ color: "var(--muted)" }}>
          The design preview currently ships one fully worked claim. Once the BFF is wired
          to the API, every claim id will resolve here.
        </p>
        <p><Link href="/claims/inflation-2022">→ open the worked example</Link></p>
      </div>
    );
  }
  return (
    <div>
      <p className="sc" style={{ marginBottom: "1.2rem", display: "flex", gap: ".7rem", alignItems: "center" }}>
        <Link href="/claims">← claims</Link>
        {source === "fixture" && (
          <span className="tag" title="The API is not connected; showing a design fixture.">
            fixture data
          </span>
        )}
      </p>
      <ClaimView detail={detail} />
    </div>
  );
}
