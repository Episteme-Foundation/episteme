import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { makeSlugger } from "@/lib/toc";

// Flatten React children of a heading back to plain text, so the anchor id
// matches the slug the TOC computes from the raw markdown.
function textOf(node: ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

// Renders verbatim markdown documents inside the .doc typographic frame.
// Headings get GitHub-style slug ids so the table of contents can link to them.
// `idPrefix` namespaces ids when several docs share one page (e.g. architecture
// + policies); it must match the prefix passed to extractToc for that doc.
export function Markdown({ children, idPrefix = "" }: { children: string; idPrefix?: string }) {
  const slug = makeSlugger();

  const heading = (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") => {
    const Component = ({ children: kids }: { children?: ReactNode }) => {
      const id = idPrefix + slug(textOf(kids));
      return <Tag id={id}>{kids}</Tag>;
    };
    Component.displayName = `MdHeading_${Tag}`;
    return Component;
  };

  const components: Components = {
    h1: heading("h1"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    h5: heading("h5"),
    h6: heading("h6"),
  };

  return (
    <div className="doc">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
