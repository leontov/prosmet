import { useMemo } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import type { Estimate, EstimateItem } from "@prosmet/contracts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../theme";

type Props = {
  estimate: Estimate;
  onChange: (estimate: Estimate) => void;
  onClose: () => void;
  libraryMode?: boolean;
};

export function EstimateScreen({ estimate, onChange, onClose, libraryMode = false }: Props) {
  const insets = useSafeAreaInsets();
  const totals = useMemo(() => calculate(estimate), [estimate]);

  const update = (sectionId: string, itemId: string, patch: Partial<EstimateItem>) => onChange({
    ...estimate,
    updatedAt: new Date().toISOString(),
    sections: estimate.sections.map((section) => section.id === sectionId ? {
      ...section,
      items: section.items.map((item) => item.id === itemId ? { ...item, ...patch } : item)
    } : section)
  });

  const addItem = (sectionId: string) => onChange({
    ...estimate,
    updatedAt: new Date().toISOString(),
    sections: estimate.sections.map((section) => section.id === sectionId ? {
      ...section,
      items: [...section.items, {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: "Новая позиция",
        unit: "шт",
        quantity: 1,
        unitPrice: 0,
        category: "work"
      }]
    } : section)
  });

  const removeItem = (sectionId: string, itemId: string) => onChange({
    ...estimate,
    updatedAt: new Date().toISOString(),
    sections: estimate.sections.map((section) => section.id === sectionId ? {
      ...section,
      items: section.items.filter((item) => item.id !== itemId)
    } : section)
  });

  const save = () => onChange({
    ...estimate,
    revision: estimate.revision + 1,
    status: "review",
    updatedAt: new Date().toISOString()
  });

  const approve = () => onChange({
    ...estimate,
    status: "approved",
    updatedAt: new Date().toISOString()
  });

  const share = async () => {
    await Share.share({
      title: estimate.title,
      message: estimateSummary(estimate, totals.total)
    });
    onChange({ ...estimate, status: "sent", updatedAt: new Date().toISOString() });
  };

  return (
    <View style={styles.root}>
      <View style={styles.topbar}>
        <Pressable onPress={onClose} style={styles.topButton} accessibilityRole="button" accessibilityLabel="Закрыть смету"><Text style={styles.topButtonText}>‹</Text></Pressable>
        <View style={styles.topTitle}><Text style={styles.topTitleMain}>{libraryMode ? "Сметы" : "Смета"}</Text><Text style={styles.topTitleSub}>Версия {estimate.revision}</Text></View>
        <Pressable style={styles.topButton} onPress={() => void share()} accessibilityRole="button" accessibilityLabel="Передать смету"><Text style={styles.shareTop}>↗</Text></Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 122 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.status}>{statusLabel(estimate.status)}</Text>
          <TextInput style={styles.titleInput} value={estimate.title} onChangeText={(value) => onChange({ ...estimate, title: value, updatedAt: new Date().toISOString() })} multiline />
          <Text style={styles.meta}>{estimate.project}{"\n"}{estimate.region}</Text>
          <View style={styles.heroTotal}><Text style={styles.heroTotalLabel}>Итого</Text><Text style={styles.heroTotalValue}>{formatMoney(totals.total)}</Text></View>
        </View>

        {estimate.sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>{section.title}</Text><Text style={styles.sectionMeta}>{section.items.length} позиций</Text></View><Text style={styles.sectionTotal}>{formatMoney(totals.sectionTotals[section.id] || 0)}</Text></View>
            <View style={styles.items}>
              {section.items.map((item, index) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.number}>{index + 1}</Text>
                    <TextInput value={item.name} onChangeText={(value) => update(section.id, item.id, { name: value })} style={styles.itemName} multiline />
                    <Pressable style={styles.removeButton} onPress={() => removeItem(section.id, item.id)} accessibilityRole="button" accessibilityLabel={`Удалить ${item.name}`}><Text style={styles.removeText}>×</Text></Pressable>
                  </View>
                  <View style={styles.fields}>
                    <View style={styles.field}><Text style={styles.fieldLabel}>Количество</Text><View style={styles.fieldInputWrap}><TextInput value={String(item.quantity)} onChangeText={(value) => update(section.id, item.id, { quantity: Math.max(0, Number(value.replace(",", ".")) || 0) })} keyboardType="decimal-pad" style={styles.fieldInput} /><Text style={styles.fieldSuffix}>{item.unit}</Text></View></View>
                    <View style={styles.field}><Text style={styles.fieldLabel}>Цена</Text><View style={styles.fieldInputWrap}><TextInput value={String(item.unitPrice)} onChangeText={(value) => update(section.id, item.id, { unitPrice: Math.max(0, Number(value.replace(",", ".")) || 0) })} keyboardType="decimal-pad" style={styles.fieldInput} /><Text style={styles.fieldSuffix}>₽</Text></View></View>
                  </View>
                  <View style={styles.cardFooter}><Text style={styles.cardFooterLabel}>Сумма</Text><Text style={styles.cardFooterValue}>{formatMoney(totals.itemTotals[item.id] || 0)}</Text></View>
                </View>
              ))}
            </View>
            <Pressable style={styles.addButton} onPress={() => addItem(section.id)} accessibilityRole="button"><Text style={styles.addButtonText}>＋ Добавить позицию</Text></Pressable>
          </View>
        ))}

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Структура цены</Text>
          <SummaryRow label="Прямые затраты" value={totals.direct} />
          <PercentRow label="Накладные" value={estimate.overheadPercent} amount={totals.overhead} onChange={(value) => onChange({ ...estimate, overheadPercent: value, updatedAt: new Date().toISOString() })} />
          <PercentRow label="Прибыль" value={estimate.profitPercent} amount={totals.profit} onChange={(value) => onChange({ ...estimate, profitPercent: value, updatedAt: new Date().toISOString() })} />
          <PercentRow label="НДС" value={estimate.vatPercent} amount={totals.vat} onChange={(value) => onChange({ ...estimate, vatPercent: value, updatedAt: new Date().toISOString() })} />
          <View style={styles.grand}><Text style={styles.grandLabel}>Итого</Text><Text style={styles.grandValue}>{formatMoney(totals.total)}</Text></View>
        </View>
      </ScrollView>

      {!libraryMode ? (
        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable style={styles.share} onPress={() => void share()} accessibilityRole="button" accessibilityLabel="Передать клиенту"><Text style={styles.shareText}>↗</Text></Pressable>
          <Pressable style={styles.secondary} onPress={approve} disabled={estimate.status === "approved"}><Text style={styles.secondaryText}>{estimate.status === "approved" ? "Утверждена" : "Утвердить"}</Text></Pressable>
          <Pressable style={styles.primary} onPress={save}><Text style={styles.primaryText}>Сохранить версию</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}

function calculate(estimate: Estimate) {
  const itemTotals: Record<string, number> = {};
  const sectionTotals: Record<string, number> = {};
  let direct = 0;
  for (const section of estimate.sections) {
    let sectionTotal = 0;
    for (const item of section.items) {
      const value = Math.max(0, item.quantity) * Math.max(0, item.unitPrice);
      itemTotals[item.id] = value;
      sectionTotal += value;
    }
    sectionTotals[section.id] = sectionTotal;
    direct += sectionTotal;
  }
  const overhead = direct * Math.max(0, estimate.overheadPercent) / 100;
  const profit = (direct + overhead) * Math.max(0, estimate.profitPercent) / 100;
  const vat = (direct + overhead + profit) * Math.max(0, estimate.vatPercent) / 100;
  return { itemTotals, sectionTotals, direct, overhead, profit, vat, total: direct + overhead + profit + vat };
}

function estimateSummary(estimate: Estimate, total: number) {
  const lines = [estimate.title, estimate.project, estimate.customer, estimate.region].filter(Boolean);
  for (const section of estimate.sections) {
    lines.push("", section.title);
    for (const item of section.items) lines.push(`• ${item.name}: ${item.quantity} ${item.unit} × ${item.unitPrice.toLocaleString("ru-RU")} ₽`);
  }
  lines.push("", `Итого: ${formatMoney(total)}`);
  return lines.join("\n");
}

function formatMoney(value: number) { return `${Math.round(value).toLocaleString("ru-RU")} ₽`; }
function statusLabel(status: Estimate["status"]) { return status === "approved" ? "Утверждена" : status === "review" ? "Версия сохранена" : status === "sent" ? "Передана клиенту" : "Черновик"; }
function SummaryRow({ label, value }: { label: string; value: number }) { return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{formatMoney(value)}</Text></View>; }
function PercentRow({ label, value, amount, onChange }: { label: string; value: number; amount: number; onChange: (value: number) => void }) {
  return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><View style={styles.percentWrap}><TextInput value={String(value)} onChangeText={(text) => onChange(Math.max(0, Number(text.replace(",", ".")) || 0))} keyboardType="decimal-pad" style={styles.percentInput} /><Text style={styles.percentSuffix}>%</Text></View><Text style={styles.summaryValue}>{formatMoney(amount)}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f6f7" },
  topbar: { minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border, backgroundColor: theme.canvas, paddingHorizontal: 7 },
  topButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 13 },
  topButtonText: { color: theme.text, fontSize: 34, lineHeight: 36, fontWeight: "300" },
  shareTop: { color: theme.text, fontSize: 22 },
  topTitle: { flex: 1, alignItems: "center" },
  topTitleMain: { color: theme.text, fontSize: 15, fontWeight: "700" },
  topTitleSub: { marginTop: 2, color: theme.muted, fontSize: 10 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 14 },
  hero: { borderWidth: 1, borderColor: theme.border, borderRadius: 22, backgroundColor: theme.canvas, padding: 20 },
  status: { alignSelf: "flex-start", overflow: "hidden", borderRadius: 999, backgroundColor: "#f1f1f2", paddingHorizontal: 10, paddingVertical: 7, color: theme.muted, fontSize: 11, fontWeight: "700" },
  titleInput: { marginTop: 14, color: theme.text, fontSize: 29, lineHeight: 34, fontWeight: "700", letterSpacing: -1.1, padding: 0 },
  meta: { marginTop: 10, color: theme.muted, fontSize: 16, lineHeight: 24 },
  heroTotal: { marginTop: 24, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: 18 },
  heroTotalLabel: { color: theme.muted, fontSize: 14 },
  heroTotalValue: { color: theme.text, fontSize: 27, fontWeight: "800", letterSpacing: -1 },
  section: { marginTop: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingHorizontal: 4, paddingBottom: 10 },
  sectionTitle: { color: theme.text, fontSize: 19, fontWeight: "700", letterSpacing: -0.4 },
  sectionMeta: { marginTop: 4, color: theme.muted, fontSize: 12 },
  sectionTotal: { color: theme.text, fontSize: 14, fontWeight: "700" },
  items: { gap: 10 },
  card: { minHeight: 154, borderWidth: 1, borderColor: theme.border, borderRadius: 19, backgroundColor: theme.canvas, padding: 14 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  number: { width: 28, height: 28, overflow: "hidden", borderRadius: 9, backgroundColor: theme.soft, color: theme.muted, textAlign: "center", textAlignVertical: "center", fontSize: 11, fontWeight: "700" },
  itemName: { minHeight: 44, flex: 1, color: theme.text, fontSize: 17, lineHeight: 23, fontWeight: "700", padding: 0 },
  removeButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  removeText: { color: "#a32920", fontSize: 25, lineHeight: 27 },
  fields: { marginTop: 10, flexDirection: "row", gap: 8 },
  field: { flex: 1 },
  fieldLabel: { marginLeft: 2, marginBottom: 5, color: theme.faint, fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  fieldInputWrap: { minHeight: 52, flexDirection: "row", alignItems: "center", borderRadius: 14, backgroundColor: theme.soft, paddingHorizontal: 11 },
  fieldInput: { minWidth: 0, flex: 1, color: theme.text, fontSize: 18, fontWeight: "700", padding: 0 },
  fieldSuffix: { color: theme.muted, fontSize: 12, fontWeight: "600" },
  cardFooter: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: 12 },
  cardFooterLabel: { color: theme.muted, fontSize: 13 },
  cardFooterValue: { color: theme.text, fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  addButton: { minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 15, backgroundColor: theme.canvas },
  addButtonText: { color: theme.text, fontSize: 14, fontWeight: "700" },
  summary: { marginTop: 20, borderWidth: 1, borderColor: theme.border, borderRadius: 19, backgroundColor: theme.canvas, padding: 16 },
  summaryTitle: { marginBottom: 10, color: theme.text, fontSize: 19, fontWeight: "700" },
  summaryRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  summaryLabel: { flex: 1, color: theme.muted, fontSize: 14 },
  summaryValue: { color: theme.text, fontSize: 14, fontWeight: "700" },
  percentWrap: { minHeight: 38, flexDirection: "row", alignItems: "center", borderRadius: 11, backgroundColor: theme.soft, paddingHorizontal: 8 },
  percentInput: { width: 44, color: theme.text, fontSize: 14, fontWeight: "700", textAlign: "right", padding: 0 },
  percentSuffix: { color: theme.muted, fontSize: 12 },
  grand: { marginTop: 8, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16 },
  grandLabel: { color: theme.text, fontSize: 16, fontWeight: "700" },
  grandValue: { color: theme.text, fontSize: 25, fontWeight: "800", letterSpacing: -0.8 },
  actions: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, backgroundColor: theme.canvas, paddingHorizontal: 10, paddingTop: 10 },
  share: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 15 },
  shareText: { color: theme.text, fontSize: 22 },
  secondary: { minHeight: 52, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 15, paddingHorizontal: 13 },
  secondaryText: { color: theme.text, fontSize: 13, fontWeight: "700" },
  primary: { minHeight: 52, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: theme.text, paddingHorizontal: 14 },
  primaryText: { color: "white", fontSize: 13, fontWeight: "800" }
});
