import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders verbatim markdown documents inside the .doc typographic frame.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="doc">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
