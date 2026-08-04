import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Estimate } from "@prosmet/contracts";
import { CircleButton, MoreButton, ScreenHeader, SearchDock, SegmentTabs, mobileChromeStyles } from "../MobileChrome";
import { DocumentGlyph, FolderGlyph, MenuGlyph } from "../ReferenceIcons";
import { groupProjects } from "../mobile-data";
import { theme } from "../theme";

type LibraryTab = "all" | "estimates" | "projects" | "documents";

type Props = {
  estimates: Estimate[];
  initialTab?: LibraryTab;
  attentionCount: number;
  onMenu: () => void;
  onOpenProject: (id: string) => void;
  onOpenEstimate: (id: string) => void;
};

type LibraryCard = {
  id: string;
  type: "project" | "estimate" | "document";
  title: string;
  subtitle?: string;
  targetId: string;
};

const tabs: Array<{ id: LibraryTab; label: string }> = [
  { id: "all", label: "Все" },
  { id: "estimates", label: "Сметы" },
  { id: "projects", label: "Проекты" },
  { id: "documents", label: "Документы" }
];

export function LibraryScreen({ estimates, initialTab = "all", attentionCount, onMenu, onOpenProject, onOpenEstimate }: Props) {
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);

  useEffect(() => setTab(initialTab), [initialTab]);

  const projects = useMemo(() => groupProjects(estimates), [estimates]);
  const cards = useMemo(() => {
    const projectCards: LibraryCard[] = projects.map((project) => ({
      id: `project:${project.id}`,
      type: "project",
      title: project.title,
      subtitle: `${project.estimates.length} ${project.estimates.length === 1 ? "смета" : "сметы"}`,
      targetId: project.id
    }));
    const estimateCards: LibraryCard[] = [...estimates]
      .sort((left, right) => (newestFirst ? 1 : -1) * (Date.parse(right.updatedAt) - Date.parse(left.updatedAt)))
      .map((estimate) => ({
        id: `estimate:${estimate.id}`,
        type: estimate.status === "approved" || estimate.status === "sent" ? "document" : "estimate",
        title: estimate.title,
        subtitle: estimate.project || estimate.region,
        targetId: estimate.id
      }));

    let source = tab === "projects"
      ? projectCards
      : tab === "estimates"
        ? estimateCards.filter((card) => card.type === "estimate")
        : tab === "documents"
          ? estimateCards.filter((card) => card.type === "document")
          : [...projectCards, ...estimateCards];

    const normalized = query.trim().toLowerCase();
    if (normalized) source = source.filter((card) => `${card.title} ${card.subtitle || ""}`.toLowerCase().includes(normalized));
    return source;
  }, [estimates, newestFirst, projects, query, tab]);

  const cardWidth = Math.max(150, (width - 50) / 2);

  return (
    <View style={mobileChromeStyles.screen}>
      <ScreenHeader
        title="Библиотека"
        left={<CircleButton accessibilityLabel="Открыть навигацию" onPress={onMenu} badge={attentionCount}><MenuGlyph /></CircleButton>}
        right={<MoreButton onPress={() => setMenuOpen((value) => !value)} />}
      />
      <SegmentTabs items={tabs} value={tab} onChange={setTab} />

      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        numColumns={2}
        style={styles.list}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => item.type === "project" ? onOpenProject(item.targetId) : onOpenEstimate(item.targetId)}
            style={({ pressed }) => [styles.card, { width: cardWidth, height: cardWidth }, pressed && styles.pressed]}
          >
            <View>
              <Text style={styles.cardTitle} numberOfLines={3}>{item.title}</Text>
              {item.subtitle ? <Text style={styles.cardSubtitle} numberOfLines={1}>{item.subtitle}</Text> : null}
            </View>
            <View style={styles.cardIcon}>
              {item.type === "project" ? <FolderGlyph /> : <DocumentGlyph color={item.type === "document" ? "#0a84ff" : "#111214"} />}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{query ? "Ничего не найдено" : "Библиотека пока пуста"}</Text>
            <Text style={styles.emptyText}>{query ? "Измените поисковый запрос." : "Новые сметы и проекты появятся здесь после работы с агентом."}</Text>
          </View>
        )}
      />

      {menuOpen ? (
        <View style={styles.sortMenu}>
          <Pressable onPress={() => { setNewestFirst(true); setMenuOpen(false); }} style={styles.sortRow}><Text style={styles.sortText}>Сначала новые</Text>{newestFirst ? <Text style={styles.sortCheck}>✓</Text> : null}</Pressable>
          <Pressable onPress={() => { setNewestFirst(false); setMenuOpen(false); }} style={styles.sortRow}><Text style={styles.sortText}>Сначала старые</Text>{!newestFirst ? <Text style={styles.sortCheck}>✓</Text> : null}</Pressable>
        </View>
      ) : null}

      <SearchDock value={query} onChangeText={setQuery} placeholder="Поиск в библиотеке" />
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  list: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 118 },
  row: { justifyContent: "space-between" },
  card: {
    justifyContent: "space-between",
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(17,18,20,0.08)",
    borderRadius: 27,
    backgroundColor: theme.canvas,
    padding: 17,
    shadowColor: "#111214",
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1
  },
  cardTitle: { color: "#111214", fontSize: 20, lineHeight: 25, fontWeight: "800", letterSpacing: -0.55 },
  cardSubtitle: { marginTop: 5, color: "#999a9d", fontSize: 12, lineHeight: 16, fontWeight: "600" },
  cardIcon: { minHeight: 38, alignItems: "flex-start", justifyContent: "flex-end" },
  empty: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 },
  emptyTitle: { color: "#111214", fontSize: 23, lineHeight: 29, fontWeight: "800", textAlign: "center" },
  emptyText: { marginTop: 9, color: "#8f9094", fontSize: 15, lineHeight: 22, textAlign: "center" },
  sortMenu: { position: "absolute", top: 68, right: 16, zIndex: 20, width: 214, borderWidth: 1, borderColor: "rgba(17,18,20,0.14)", borderRadius: 20, backgroundColor: theme.canvas, padding: 8, shadowColor: "#111214", shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  sortRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, paddingHorizontal: 12 },
  sortText: { color: "#111214", fontSize: 16, fontWeight: "600" },
  sortCheck: { color: "#111214", fontSize: 20, fontWeight: "800" }
});
