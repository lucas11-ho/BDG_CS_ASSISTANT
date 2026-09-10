import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installWebIdentityRuntime } from "./lib/web-identity-runtime";
import "./styles.css";

installWebIdentityRuntime();

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
