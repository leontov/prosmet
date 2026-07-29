"use client";

// Registers deleteEstimate/restoreEstimate on the local repository before the
// document editor is evaluated. Keeping the lifecycle in a separate module
// avoids a hard dependency from the generic repository on estimate UI code.
import "@/lib/local/estimate-lifecycle";

export { EstimateDocumentExperience } from "@/components/tools/estimate-document-experience";
