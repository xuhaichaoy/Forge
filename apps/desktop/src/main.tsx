import React from "react";
import { createRoot } from "react-dom/client";
import { HiCodexApp } from "@hicodex/ui";
import "@hicodex/ui/styles.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HiCodexApp />
  </React.StrictMode>,
);
