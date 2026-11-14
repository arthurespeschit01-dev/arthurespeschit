import type { CSSProperties } from "react";
import type { FormPresentation } from "@/components/pilot/WorkspaceFormRunner";
export function presentationStyle(p: FormPresentation = {}): CSSProperties {
  return {
    background: p.background || "#ffffff",
    color: p.text || "#18212f",
    fontFamily:
      p.font === "serif"
        ? "Georgia,serif"
        : p.font === "mono"
          ? "monospace"
          : "inherit",
    textAlign: p.alignment || "left",
    "--form-primary": p.primary || "#7c3aed",
  } as CSSProperties;
}
