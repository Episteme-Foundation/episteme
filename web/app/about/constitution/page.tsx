import Link from "next/link";
import { getDoc } from "@/lib/content";
import { Markdown } from "@/components/Markdown";

export const metadata = { title: "The Administrator Constitution — Episteme" };

export default function ConstitutionPage() {
  const text = getDoc("constitution");
  return (
    <div>
      <p className="sc" style={{ marginBottom: "1rem" }}>
        <Link href="/about">← about</Link>
      </p>
      <aside className="sidenote" style={{ marginTop: "3rem" }}>
        <span className="sc">Verbatim</span>
        This is the canonical text given, in full, to every administrator agent as the
        first layer of its system prompt. Shown here exactly as the agents receive it.
      </aside>
      <Markdown>{text}</Markdown>
    </div>
  );
}
