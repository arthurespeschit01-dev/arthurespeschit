import { useLayoutEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

/** Shared product presentation. Authorization remains in workspace RLS. */
export default function PilotVisualTheme() {
  const { user } = useAuth();
  const userId = user?.id;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (userId) root.setAttribute("data-product-skin", "pilot");
    else root.removeAttribute("data-product-skin");
    return () => root.removeAttribute("data-product-skin");
  }, [userId]);
  return null;
}
