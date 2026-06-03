import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface MathContentProps {
  content: string;
  className?: string;
}

export function MathContent({ content, className = "" }: MathContentProps) {
  const rendered = useMemo(() => {
    console.log("[MathContent] render start", { content: content?.slice(0, 100), contentLength: content?.length, className });

    if (!content) {
      console.log("[MathContent] content is empty/null, returning null");
      return null;
    }

    const parts: Array<{ type: "text" | "inline-math" | "block-math"; value: string }> = [];

    // Match block math $$...$$
    const blockRegex = /\$\$([\s\S]*?)\$\$/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = blockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: "block-math", value: match[1].trim() });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push({ type: "text", value: content.slice(lastIndex) });
    }

    console.log("[MathContent] after block parse", { blockParts: parts.length, parts: parts.map((p) => ({ type: p.type, value: p.value.slice(0, 50) })) });

    // Process text parts for inline math $...$
    const finalParts: typeof parts = [];
    for (const part of parts) {
      if (part.type !== "text") {
        finalParts.push(part);
        continue;
      }

      const inlineRegex = /\$([\s\S]*?)\$/g;
      let inlineMatch: RegExpExecArray | null;
      let inlineLast = 0;
      const text = part.value;

      while ((inlineMatch = inlineRegex.exec(text)) !== null) {
        if (inlineMatch.index > inlineLast) {
          finalParts.push({ type: "text", value: text.slice(inlineLast, inlineMatch.index) });
        }
        finalParts.push({ type: "inline-math", value: inlineMatch[1].trim() });
        inlineLast = inlineMatch.index + inlineMatch[0].length;
      }

      if (inlineLast < text.length) {
        finalParts.push({ type: "text", value: text.slice(inlineLast) });
      }
    }

    console.log("[MathContent] after inline parse", { finalParts: finalParts.length, parts: finalParts.map((p) => ({ type: p.type, value: p.value.slice(0, 50) })) });

    const result = finalParts.map((part, i) => {
      if (part.type === "text") {
        const textEl = (
          <span key={i}>
            {part.value.split("\n").map((line, j) => (
              <span key={j}>
                {line}
                {j < part.value.split("\n").length - 1 && <br />}
              </span>
            ))}
          </span>
        );
        return textEl;
      }

      try {
        console.log(`[MathContent] katex.renderToString #${i}`, { type: part.type, latex: part.value });
        const html = katex.renderToString(part.value, {
          throwOnError: false,
          displayMode: part.type === "block-math",
        });
        console.log(`[MathContent] katex.renderToString #${i} success`, { htmlLength: html.length });
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: html }}
            className={part.type === "block-math" ? "block my-2" : "inline"}
          />
        );
      } catch (err) {
        console.error(`[MathContent] katex.renderToString #${i} FAILED`, { type: part.type, latex: part.value, error: err instanceof Error ? err.message : String(err) });
        return <span key={i}>{part.value}</span>;
      }
    });

    console.log("[MathContent] render end", { resultCount: result.length });
    return result;
  }, [content]);

  console.log("[MathContent] JSX return", { hasRendered: !!rendered, renderedCount: rendered?.length });
  return <span className={className}>{rendered}</span>;
}
