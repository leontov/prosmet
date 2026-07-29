"use client";

import styles from "@/components/tools/estimate-document-v2.module.css";
import {
  EstimateDocumentEditorV2 as EstimateDocumentEditorCore,
  type EstimateDocumentEditorProps
} from "@/components/tools/estimate-document-v2";

export function EstimateDocumentEditorV2(props: EstimateDocumentEditorProps) {
  return (
    <span className={styles.scope}>
      <EstimateDocumentEditorCore {...props} />
    </span>
  );
}
