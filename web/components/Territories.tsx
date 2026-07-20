import Link from "next/link";
import type { Territory } from "@/lib/territories";
import type { SearchResultItem } from "@/lib/types";
import { STATUS } from "@/lib/ontology";
import { StatusBadge, Unassessed } from "./Assessment";
import styles from "./Territories.module.css";

// The "What's mapped so far" overview shown on /claims before a search (#206):
// one card per curated investigation, fronted by its real core claim and
// verdict, with counts and a verdict mix derived from the anchor's subtree.
// A card teaches "what is a claim" by showing one, and the whole card is the
// front door into the cluster: the footer's "Walk the map" link is stretched
// over the card (same pattern as the search-result cards, #198/#247), with the
// verdict badge sitting above it so its definition popover stays reachable.
// The ↗ after the core claim is the one exit to the claim page itself, the
// same open-claim affordance the tree, argument prose, and map all use.

function TerritoryCard({ t }: { t: Territory }) {
  const s = t.stats;
  const coreText = s?.coreText ?? t.coreText;
  const assessed = s?.assessedCount ?? 0;
  const mapHref = `/claims/${t.anchorId}/map`;

  return (
    <article className={styles.card}>
      <div className={styles.kicker}>Investigation</div>
      <h3 className={styles.name}>{t.name}</h3>
      <p className={styles.question}>{t.question}</p>
      <p className={styles.core}>
        <span className={styles.quote}>&ldquo;</span>
        {coreText}
        <span className={styles.quote}>&rdquo;</span>
        {s?.coreStatus && (
          <>
            {" "}
            <StatusBadge status={s.coreStatus} linkTo={mapHref} />
          </>
        )}{" "}
        <Link className={styles.open} href={`/claims/${t.anchorId}`} title="open this claim">
          ↗&#xFE0E;
        </Link>
      </p>

      <div className={styles.spacer} />

      {s && s.mix.length > 0 && assessed > 0 && (
        <div className={styles.mix}>
          <div className={styles.bar} role="img" aria-label={`Verdict mix across ${assessed} assessed claims`}>
            {s.mix.map((m) => (
              <span
                key={m.status}
                style={{ width: `${(m.count / assessed) * 100}%`, background: `var(--st-${m.status})` }}
                title={`${m.count} ${STATUS[m.status].label.toLowerCase()}`}
              />
            ))}
          </div>
          <div className={styles.legend}>
            {s.mix.map((m) => (
              <span key={m.status}>
                <i style={{ background: `var(--st-${m.status})` }} />
                {m.count} {STATUS[m.status].label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.foot}>
        {s ? (
          <span className={styles.count}>
            {assessed} assessed <span className={styles.total}>· {s.totalCount} total</span>
          </span>
        ) : (
          <span className={styles.count} />
        )}
        <Link className={styles.walk} href={mapHref}>
          Walk the map →
        </Link>
      </div>
    </article>
  );
}

export function Territories({ territories }: { territories: Territory[] }) {
  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>What&rsquo;s mapped so far</h2>
        <span className={styles.aside}>each card opens on its core claim&rsquo;s map</span>
      </div>
      <div className={styles.grid}>
        {territories.map((t) => (
          <TerritoryCard key={t.key} t={t} />
        ))}
      </div>
    </section>
  );
}

// The newest claims, demoted from the pre-search hero to a slim strip below the
// overview (#206). Still one click from any claim; no longer the thing the page
// is about.
export function RecentClaims({ items }: { items: SearchResultItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.recent}>
      <div className={styles.head}>
        <h2 className={styles.recentTitle}>Recently added</h2>
        <span className={styles.aside}>newest claims, across all investigations</span>
      </div>
      <ul className={styles.recentList}>
        {items.map((c) => (
          <li key={c.id} className={styles.recentItem}>
            <Link href={`/claims/${c.id}`} className={styles.recentText}>
              {c.text}
            </Link>
            <span className={styles.recentBadge}>
              {c.assessment_status ? <StatusBadge status={c.assessment_status} /> : <Unassessed />}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
