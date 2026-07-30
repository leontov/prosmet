import { useMemo, useState } from "react";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getApiBase } from "@/src/config";
import { enqueue, saveEstimateDraft } from "@/src/storage/offline";

type Item = { id: string; name?: string; unit?: string; quantity?: number; norm?: number; coefficient?: number; unitPrice?: number };
type Section = { id: string; title?: string; items?: Item[] };
type Draft = { id?: string; title?: string; objectName?: string; customerName?: string; sections?: Section[]; overheadPercent?: number; profitPercent?: number; discountPercent?: number; vatPercent?: number };

function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function calculate(draft: Draft) {
  const direct = money((draft.sections || []).flatMap((section) => section.items || []).reduce((sum, item) => sum + money(money(Number(item.quantity || 0)) * Number(item.norm ?? 1) * Number(item.coefficient ?? 1) * Number(item.unitPrice || 0)), 0));
  const overhead = money(direct * Number(draft.overheadPercent || 0) / 100);
  const profit = money((direct + overhead) * Number(draft.profitPercent || 0) / 100);
  const discount = money((direct + overhead + profit) * Number(draft.discountPercent || 0) / 100);
  const subtotal = money(direct + overhead + profit - discount);
  const vat = money(subtotal * Number(draft.vatPercent || 0) / 100);
  return money(subtotal + vat);
}
function rub(value: number) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(value); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char)); }

export function NativeEstimateCard({ args }: { args: unknown }) {
  const original = (args && typeof args === "object" ? args : {}) as Draft;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(original);
  const [message, setMessage] = useState("");
  const total = useMemo(() => calculate(draft), [draft]);
  const items = draft.sections?.flatMap((section) => section.items || []) || [];

  const updateItem = (id: string, patch: Partial<Item>) => setDraft((current) => ({
    ...current,
    sections: (current.sections || []).map((section) => ({
      ...section,
      items: (section.items || []).map((item) => item.id === id ? { ...item, ...patch } : item)
    }))
  }));

  const save = async () => {
    const id = draft.id || `native-estimate-${Date.now()}`;
    const next = { ...draft, id };
    setDraft(next);
    await saveEstimateDraft(id, next);
    await enqueue("estimate_upsert", next);
    setMessage("Черновик сохранён на устройстве и поставлен в очередь синхронизации.");
  };

  const approve = async () => {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/api/engine/calculate`, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(draft)
    });
    const result = await response.json();
    if (!response.ok || result.engine !== "rust") throw new Error(result.message || "Rust-движок не подтвердил расчёт");
    await saveEstimateDraft(draft.id || `native-estimate-${Date.now()}`, { ...draft, engineDigest: result.digest }, "approved");
    setMessage(`Утверждено Rust ${result.engineVersion}. Итог ${rub(result.calculation.total)}.`);
  };

  const sharePdf = async () => {
    const rows = items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.name || "Позиция")}</td><td>${escapeHtml(item.unit || "")}</td><td>${item.quantity || 0}</td><td>${item.unitPrice || 0}</td></tr>`).join("");
    const html = `<html><body style="font-family:-apple-system;padding:32px"><h1>${escapeHtml(draft.title || "Смета")}</h1><p>${escapeHtml(draft.objectName || "")}</p><table width="100%" cellspacing="0" cellpadding="8" border="1"><tr><th>№</th><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена</th></tr>${rows}</table><h2 style="text-align:right">Итого: ${rub(total)}</h2></body></html>`;
    const file = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Передать смету" });
  };

  return (
    <>
      <Pressable style={styles.card} onPress={() => setOpen(true)}>
        <Text style={styles.eyebrow}>СМЕТА</Text>
        <Text style={styles.title}>{draft.title || "Черновик сметы"}</Text>
        <View style={styles.row}><Text style={styles.muted}>{items.length} позиций</Text><Text style={styles.total}>{rub(total)}</Text></View>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setOpen(false)}><Text style={styles.close}>Закрыть</Text></Pressable>
            <Text style={styles.headerTitle}>Смета</Text>
            <Pressable onPress={save}><Text style={styles.save}>Сохранить</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <TextInput style={styles.documentTitle} value={draft.title || ""} onChangeText={(title) => setDraft((current) => ({ ...current, title }))} placeholder="Название сметы" />
            <TextInput style={styles.metaInput} value={draft.objectName || ""} onChangeText={(objectName) => setDraft((current) => ({ ...current, objectName }))} placeholder="Объект" />
            {items.map((item, index) => (
              <View key={item.id} style={styles.item}>
                <Text style={styles.itemIndex}>{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name || "Позиция"}</Text>
                  <View style={styles.inputs}>
                    <TextInput style={styles.numberInput} keyboardType="decimal-pad" value={String(item.quantity || 0)} onChangeText={(value) => updateItem(item.id, { quantity: Number(value.replace(",", ".")) || 0 })} />
                    <Text style={styles.unit}>{item.unit || "ед."}</Text>
                    <TextInput style={styles.numberInput} keyboardType="decimal-pad" value={String(item.unitPrice || 0)} onChangeText={(value) => updateItem(item.id, { unitPrice: Number(value.replace(",", ".")) || 0 })} />
                    <Text style={styles.unit}>₽</Text>
                  </View>
                </View>
              </View>
            ))}
            <View style={styles.summary}><Text style={styles.summaryLabel}>Итого</Text><Text style={styles.summaryValue}>{rub(total)}</Text></View>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            <Pressable style={styles.primary} onPress={() => void approve().catch((error) => setMessage(error.message))}><Text style={styles.primaryText}>Утвердить через Rust</Text></Pressable>
            <Pressable style={styles.secondary} onPress={() => void sharePdf()}><Text style={styles.secondaryText}>Передать PDF</Text></Pressable>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d4d4cf", borderRadius: 16, backgroundColor: "#fafaf9", padding: 16, gap: 7 },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, color: "#787872", fontWeight: "700" },
  title: { fontSize: 16, lineHeight: 22, color: "#1b1b19", fontWeight: "600" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  muted: { color: "#73736d", fontSize: 13 },
  total: { color: "#1b1b19", fontSize: 15, fontWeight: "650" },
  modalRoot: { flex: 1, backgroundColor: "#f7f7f5" },
  modalHeader: { height: 58, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#d9d9d4" },
  close: { color: "#62625d", fontSize: 15 },
  save: { color: "#1b1b19", fontSize: 15, fontWeight: "600" },
  headerTitle: { fontSize: 16, fontWeight: "600" },
  content: { padding: 18, gap: 12, paddingBottom: 44 },
  documentTitle: { fontSize: 24, fontWeight: "650", color: "#171716", paddingVertical: 8 },
  metaInput: { height: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#cfcfca", fontSize: 15 },
  item: { flexDirection: "row", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#deded9" },
  itemIndex: { width: 22, color: "#8a8a83" },
  itemName: { color: "#252523", fontSize: 15, lineHeight: 21 },
  inputs: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9 },
  numberInput: { minWidth: 68, height: 38, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfcfca", backgroundColor: "#fff", textAlign: "right", paddingHorizontal: 9 },
  unit: { color: "#73736d", fontSize: 12 },
  summary: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 18 },
  summaryLabel: { fontSize: 17, fontWeight: "600" },
  summaryValue: { fontSize: 19, fontWeight: "700" },
  message: { color: "#62625d", fontSize: 13, lineHeight: 19 },
  primary: { height: 50, backgroundColor: "#20201e", borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  secondary: { height: 50, borderWidth: StyleSheet.hairlineWidth, borderColor: "#bdbdb7", borderRadius: 14, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#292927", fontSize: 15, fontWeight: "600" }
});
