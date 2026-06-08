import { useEffect, useRef } from "react";
import SmilesDrawer from "smiles-drawer";

interface ChemicalStructureProps {
  smiles: string;
  className?: string;
  width?: number;
  height?: number;
}

export function ChemicalStructure({ smiles, className = "", width = 200, height = 150 }: ChemicalStructureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log("[ChemicalStructure] useEffect", { smiles, width, height, hasCanvas: !!canvasRef.current });
    if (!smiles || !canvasRef.current) {
      console.log("[ChemicalStructure] early return", { smiles, hasCanvas: !!canvasRef.current });
      return;
    }

    try {
      console.log("[ChemicalStructure] creating drawer");
      const drawer = new SmilesDrawer.Drawer({ width, height });
      console.log("[ChemicalStructure] parsing smiles", { smiles });
      SmilesDrawer.parse(smiles, (tree) => {
        console.log("[ChemicalStructure] parse success", { tree });
        drawer.draw(tree, canvasRef.current!, "light");
        console.log("[ChemicalStructure] draw done");
      }, (err) => {
        console.error("[ChemicalStructure] SMILES parse failed", { smiles, error: err });
      });
    } catch (err) {
      console.error("[ChemicalStructure] render failed", { smiles, error: err instanceof Error ? err.message : String(err) });
    }
  }, [smiles, width, height]);

  if (!smiles) {
    console.log("[ChemicalStructure] no smiles, return null");
    return null;
  }

  return (
    <div ref={containerRef} className={`inline-block ${className}`}>
      <canvas ref={canvasRef} width={width} height={height} className="rounded border border-border/50" />
    </div>
  );
}
