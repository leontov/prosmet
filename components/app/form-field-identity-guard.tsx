"use client";

import { useLayoutEffect } from "react";

let sequence = 0;

function slug(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/[^a-zа-яё0-9]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "field";
}

function ensureFieldIdentity(root: ParentNode) {
  const fields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input, textarea, select"
  );

  for (const field of fields) {
    const hint =
      field.getAttribute("aria-label") ||
      field.getAttribute("placeholder") ||
      field.getAttribute("type") ||
      field.tagName.toLocaleLowerCase("en-US");
    const identity = field.id || field.name || `prosmet-${slug(hint)}-${++sequence}`;
    if (!field.id) field.id = identity;
    if (!field.name) field.name = field.id;
  }
}

export function FormFieldIdentityGuard() {
  useLayoutEffect(() => {
    ensureFieldIdentity(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
if (!(node instanceof Element)) continue;
if (node.matches("input, textarea, select")) ensureFieldIdentity(node.parentNode ?? document);
else ensureFieldIdentity(node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
