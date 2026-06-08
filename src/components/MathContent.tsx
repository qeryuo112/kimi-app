import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { ChemicalStructure } from "./ChemicalStructure";

type PartType = "text" | "inline-math" | "block-math" | "chem";

interface Part {
  type: PartType;
  value: string;
}

interface MathContentProps {
  content: string;
  className?: string;
}

export function MathContent({ content, className = "" }: MathContentProps) {
  const rendered = useMemo(() => {
    if (!content) return null;

    const parts: Part[] = [];

    // Step 1: Match block math $$...$$
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

    // Step 2: For text parts, match inline math $...$ and \chem{...}
    const finalParts: Part[] = [];
    for (const part of parts) {
      if (part.type !== "text") {
        finalParts.push(part);
        continue;
      }

      // Combined regex for inline math and chem
      const combinedRegex = /\$([\s\S]*?)\$|\\chem\{([\s\S]*?)\}/g;
      let combinedMatch: RegExpExecArray | null;
      let combinedLast = 0;
      const text = part.value;

      while ((combinedMatch = combinedRegex.exec(text)) !== null) {
        if (combinedMatch.index > combinedLast) {
          finalParts.push({ type: "text", value: text.slice(combinedLast, combinedMatch.index) });
        }
        if (combinedMatch[1] !== undefined) {
          finalParts.push({ type: "inline-math", value: combinedMatch[1].trim() });
        } else if (combinedMatch[2] !== undefined) {
          finalParts.push({ type: "chem", value: combinedMatch[2].trim() });
        }
        combinedLast = combinedMatch.index + combinedMatch[0].length;
      }

      if (combinedLast < text.length) {
        finalParts.push({ type: "text", value: text.slice(combinedLast) });
      }
    }

    return finalParts.map((part, i) => {
      if (part.type === "text") {
        return (
          <span key={i}>
            {part.value.split("\n").map((line, j) => (
              <span key={j}>
                {line}
                {j < part.value.split("\n").length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      }

      if (part.type === "chem") {
        return <ChemicalStructure key={i} smiles={part.value} className="my-2" />;
      }

      try {
        const html = katex.renderToString(part.value, {
          throwOnError: false,
          strict: false,
          displayMode: part.type === "block-math",
        });
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: html }}
            className={part.type === "block-math" ? "block my-2" : "inline"}
          />
        );
      } catch {
        return <span key={i}>{part.value}</span>;
      }
    });
  }, [content]);

  return <span className={className}>{rendered}</span>;
}
