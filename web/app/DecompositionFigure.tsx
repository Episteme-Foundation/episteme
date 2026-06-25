// A small, deliberately non-technical drawing for the home page: one claim, two
// arguments (for and against) carried on the links, and the subclaims each
// argument rests on. The boxes are claims; the labelled links are arguments;
// the faint ticks below imply that each subclaim opens into its own arguments.
// Colours reuse the stance palette (argument for/against) and the verdict
// palette (the subclaim chips) so the figure teaches the same vocabulary the
// rest of the page uses.
export function DecompositionFigure() {
  return (
    <figure className="decomp-fig" aria-labelledby="decomp-fig-cap">
      <svg viewBox="0 0 560 250" role="img" width="100%" style={{ display: "block" }}>
        <title>How a claim decomposes</title>

        {/* connectors (drawn first, so the argument pills sit on top) */}
        <g fill="none" stroke="var(--faint)" strokeWidth={1}>
          <path d="M240,66 C206,104 180,112 150,140" />
          <path d="M320,66 C354,104 380,112 410,140" />
          {/* recursion ticks under each subclaim */}
          <path d="M150,206 L150,224" strokeDasharray="2 3" />
          <path d="M410,206 L410,224" strokeDasharray="2 3" />
        </g>

        {/* root claim */}
        <g>
          <rect x="160" y="16" width="240" height="50" rx="3"
            fill="var(--paper-card)" stroke="var(--ink-soft)" strokeWidth={1} />
          <text x="280" y="46" textAnchor="middle"
            style={{ fontFamily: "var(--serif)", fontSize: 14, fill: "var(--ink)" }}>
            Inflation was high in 2022
          </text>
        </g>

        {/* argument pills on the links */}
        <g>
          <rect x="142" y="100" width="96" height="19" rx="9.5"
            fill="var(--st-supported-tint)" stroke="var(--stance-for)" strokeWidth={0.75} />
          <text x="190" y="113.5" textAnchor="middle"
            style={{ fontFamily: "var(--sans)", fontSize: 9.5, letterSpacing: ".07em", fill: "var(--stance-for)" }}>
            ARGUMENT FOR
          </text>

          <rect x="322" y="100" width="116" height="19" rx="9.5"
            fill="var(--st-contradicted-tint)" stroke="var(--stance-against)" strokeWidth={0.75} />
          <text x="380" y="113.5" textAnchor="middle"
            style={{ fontFamily: "var(--sans)", fontSize: 9.5, letterSpacing: ".07em", fill: "var(--stance-against)" }}>
            ARGUMENT AGAINST
          </text>
        </g>

        {/* subclaims (themselves claims) */}
        <g>
          <rect x="34" y="140" width="232" height="66" rx="3"
            fill="var(--paper-card)" stroke="var(--rule)" strokeWidth={1} />
          <text x="150" y="167" textAnchor="middle"
            style={{ fontFamily: "var(--serif)", fontSize: 13, fill: "var(--ink)" }}>
            US CPI rose 6.5% in 2022
          </text>
          <text x="150" y="190" textAnchor="middle"
            style={{ fontFamily: "var(--sans)", fontSize: 9.5, letterSpacing: ".07em" }}>
            <tspan fill="var(--st-verified)">✓ </tspan>
            <tspan fill="var(--muted)">VERIFIED</tspan>
          </text>

          <rect x="294" y="140" width="232" height="66" rx="3"
            fill="var(--paper-card)" stroke="var(--rule)" strokeWidth={1} />
          <text x="410" y="167" textAnchor="middle"
            style={{ fontFamily: "var(--serif)", fontSize: 13, fill: "var(--ink)" }}>
            The surge was mostly transitory
          </text>
          <text x="410" y="190" textAnchor="middle"
            style={{ fontFamily: "var(--sans)", fontSize: 9.5, letterSpacing: ".07em" }}>
            <tspan fill="var(--st-contested)">⇄ </tspan>
            <tspan fill="var(--muted)">CONTESTED</tspan>
          </text>
        </g>
      </svg>
      <figcaption id="decomp-fig-cap">
        Every box is a claim. The labelled links are <em>arguments</em>, which group the
        subclaims a claim rests on. Follow any subclaim and it opens into arguments of its
        own, down to bedrock.
      </figcaption>
    </figure>
  );
}
