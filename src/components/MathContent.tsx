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
    console.log("[MathContent] render start", { content, length: content?.length });
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
    console.log("[MathContent] after block math", { partsCount: parts.length, parts: parts.map((p) => ({ type: p.type, value: p.value.slice(0, 50) })) });

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
      console.log("[MathContent] processing text part", { textLength: text.length, text: text.slice(0, 100) });

      let loopCount = 0;
      while ((combinedMatch = combinedRegex.exec(text)) !== null) {
        loopCount++;
        console.log("[MathContent] combined match", { loopCount, index: combinedMatch.index, fullMatch: combinedMatch[0], group1: combinedMatch[1], group2: combinedMatch[2] });
        if (loopCount > 100) {
          console.error("[MathContent] regex loop exceeded 100 iterations, breaking");
          break;
        }
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
      console.log("[MathContent] after combined regex", { loopCount, combinedLast, textLength: text.length });

      if (combinedLast < text.length) {
        finalParts.push({ type: "text", value: text.slice(combinedLast) });
      }
    }
    console.log("[MathContent] finalParts", { count: finalParts.length, parts: finalParts.map((p) => ({ type: p.type, value: p.value.slice(0, 50) })) });

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
        console.log("[MathContent] rendering chem", { smiles: part.value });
        return <ChemicalStructure key={i} smiles={part.value} className="my-2" />;
      }

      try {
        // 兼容 AI 错误：把 \n\ndelta 这种换行+希腊字母名修正为 \delta
        let mathValue = part.value.trim().replace(/^\n+/, "");
        const greekFix: Record<string, string> = {
          delta: "\\delta", alpha: "\\alpha", beta: "\\beta", gamma: "\\gamma",
          epsilon: "\\epsilon", lambda: "\\lambda", nu: "\\nu", mu: "\\mu",
          pi: "\\pi", sigma: "\\sigma", tau: "\\tau", omega: "\\omega",
        };
        const lower = mathValue.toLowerCase();
        if (greekFix[lower] && !mathValue.startsWith("\\")) {
          mathValue = greekFix[lower];
        }
        const html = katex.renderToString(mathValue, {
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
