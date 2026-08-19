import { useMemo, useRef, useEffect } from "react";
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

/**
 * KaTeX rendered via ref instead of dangerouslySetInnerHTML.
 * Prevents React 19 "insertBefore NotFoundError" when browser extensions
 * (translation, grammarly, etc.) modify DOM nodes inside KaTeX output.
 */
function KatexSpan({ tex, displayMode }: { tex: string; displayMode: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current) {
      try {
        ref.current.innerHTML = katex.renderToString(tex, {
          throwOnError: false,
          displayMode,
        });
      } catch {
        ref.current.textContent = tex;
      }
    }
  }, [tex, displayMode]);

  return (
    <span
      ref={ref}
      className={displayMode ? "block my-2" : "inline"}
    />
  );
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

      return (
        <KatexSpan
          key={i}
          tex={part.value}
          displayMode={part.type === "block-math"}
        />
      );
    });
  }, [content]);

  return <span className={className}>{rendered}</span>;
}
