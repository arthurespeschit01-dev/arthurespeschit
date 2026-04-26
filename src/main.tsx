import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Suprime warning conhecido do Recharts v3 sobre forwardRef no Tooltip interno.
// Não afeta funcionamento — apenas evita poluição do console em dev.
if (import.meta.env.DEV) {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (
      msg.includes("Function components cannot be given refs") &&
      args.some((a) => typeof a === "string" && a.includes("Tooltip"))
    ) {
      return;
    }
    originalError(...args);
  };
}

createRoot(document.getElementById("root")!).render(<App />);
