import { useEffect, useRef } from "react";
import { recordRender } from "@/lib/debugMonitor";

/**
 * Measures time between renders of the component.
 * The reported value is the time elapsed since the previous render commit.
 */
export function useRenderTimer(name: string) {
  const lastRef = useRef<number>(performance.now());
  useEffect(() => {
    const now = performance.now();
    const ms = now - lastRef.current;
    lastRef.current = now;
    recordRender(name, ms);
  });
}
