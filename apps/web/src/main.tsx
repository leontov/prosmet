import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ReferenceApp } from "./app/ReferenceApp";
import "./styles.css";
import "./mobile-overrides.css";
import "./mobile-navigation.css";
import "./mobile-chat-reference.css";
import "./mobile-reference-functional.css";
import "./agent-integrations.css";
import "./workspace-real.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing");

createRoot(root).render(
  <StrictMode>
    <ReferenceApp />
  </StrictMode>
);
