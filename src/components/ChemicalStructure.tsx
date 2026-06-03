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
    if (!smiles || !canvasRef.current) return;

    try {
      const drawer = new SmilesDrawer.Drawer({ width, height });
      SmilesDrawer.parse(smiles, (tree) => {
        drawer.draw(tree, canvasRef.current!, "light");
      }, (err) => {
        console.error("[ChemicalStructure] SMILES parse failed", { smiles, error: err });
      });
    } catch (err) {
      console.error("[ChemicalStructure] render failed", { smiles, error: err instanceof Error ? err.message : String(err) });
    }
  }, [smiles, width, height]);

  if (!smiles) return null;

  return (
    <div ref={containerRef} className={`inline-block ${className}`}>
      <canvas ref={canvasRef} width={width} height={height} className="rounded border border-border/50" />
    </div>
  );
}
