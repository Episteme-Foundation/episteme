// Table-of-contents extraction and heading slugs for verbatim markdown docs.
// The same slug algorithm is used here and in <Markdown>, so anchor ids and TOC
// links agree. Slugs are deduplicated GitHub-style (foo, foo-1, foo-2 …), so the
// slugger must see every heading in document order — even ones the TOC omits.

export interface TocItem {
  depth: number;
  text: string;
  slug: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // drop punctuation
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A stateful slugger that disambiguates repeated headings deterministically.
export function makeSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugify(text) || "section";
    const n = seen.get(base);
    if (n === undefined) {
      seen.set(base, 0);
      return base;
    }
    const next = n + 1;
    seen.set(base, next);
    return `${base}-${next}`;
  };
}

// Strip the common inline markdown so heading text reads cleanly in the TOC.
function stripInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

export interface TocOptions {
  minDepth?: number; // shallowest heading level to include (default 2)
  maxDepth?: number; // deepest heading level to include (default 3)
  prefix?: string; // prepended to every slug, to namespace multiple docs on one page
  slugger?: (text: string) => string; // share a slugger across docs on the same page
}

export function extractToc(markdown: string, opts: TocOptions = {}): TocItem[] {
  const min = opts.minDepth ?? 2;
  const max = opts.maxDepth ?? 3;
  const prefix = opts.prefix ?? "";
  const slug = opts.slugger ?? makeSlugger();

  const items: TocItem[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const depth = m[1].length;
    const text = stripInline(m[2]);
    const s = prefix + slug(text); // run the slugger for every heading to stay in sync
    if (depth < min || depth > max) continue;
    items.push({ depth, text, slug: s });
  }
  return items;
}
