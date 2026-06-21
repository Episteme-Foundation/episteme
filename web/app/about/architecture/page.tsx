import Link from "next/link";
import { getDoc } from "@/lib/content";
import { Markdown } from "@/components/Markdown";

export const metadata = { title: "Architecture & policies — Episteme" };

export default function ArchitecturePage() {
  const architecture = getDoc("architecture");
  const policies = getDoc("policies");
  return (
    <div>
      <p className="sc" style={{ marginBottom: "1rem" }}>
        <Link href="/about">← about</Link>
      </p>
      <Markdown>{architecture}</Markdown>
      <hr className="thin" />
      <p className="sc" style={{ marginBottom: ".4rem" }}>Operational policies</p>
      <Markdown>{policies}</Markdown>
    </div>
  );
}
