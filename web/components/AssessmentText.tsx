import { ArgumentText } from "./ArgumentText";

/**
 * Assessment prose (issue #203): a summary or reasoning trace, split on blank
 * lines into paragraphs, with the same inline conventions as argument written
 * forms: [[claim:<id>]] references linked (resolving to canonical text via
 * `texts` when the claim is in the decomposition), bare source URLs linked.
 * Assessments written before the convention are plain prose and render
 * exactly as they always did.
 */
export function AssessmentText({
  content,
  texts,
}: {
  content: string;
  texts?: Map<string, string>;
}) {
  return (
    <>
      {content.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          <ArgumentText content={para} texts={texts} />
        </p>
      ))}
    </>
  );
}
