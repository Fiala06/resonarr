import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthGate } from "./components/AuthGate";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
);
