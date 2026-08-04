import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { Estimate } from "@prosmet/contracts";
import { CircleButton, ScreenHeader, SearchDock, SegmentTabs, mobileChromeStyles } from "../MobileChrome";
import { FolderGlyph, MenuGlyph, PinGlyph, PlusGlyph } from "../ReferenceIcons";
import { formatRelativeDate, groupProjects } from "../mobile-data";
import { theme } from "../theme";

type ProjectTab = "all" | "mine" | "recent";

type Props = {
  estimates: Estimate[];
  attentionCount: number;
  onMenu: () => void;
  onCreate: () => void;
  onOpenProject: (id: string) => void;
};

const tabs: Array<{ id: ProjectTab; label: string }> = [
  { id: "all", label: "Все" },
  { id: "mine", label: "Созданные вами" },
  { id: "recent", label: "Недавние" }
];

export function ProjectsScreen({ estimates, attentionCount, onMenu, onCreate, onOpenProject }: Props) {
  const [tab, setTab] = useState<ProjectTab>("all");
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const projects = useMemo(() => groupProjects(estimates), [estimates]);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const recentThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return projects
      .filter((project) => tab !== "recent" || Date.parse(project.updatedAt) >= recentThreshold)
      .filter((project) => !normalized || project.title.toLowerCase().includes(normalized))
      .sort((left, right) => {
        const pinDifference = Number(pinned.has(right.id)) - Number(pinned.has(left.id));
        if (pinDifference) return pinDifference;
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      });
  }, [pinned, projects, query, tab]);

  const togglePin = (id: string) => setPinned((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <View style={mobileChromeStyles.screen}>
      <ScreenHeader
        title="Проекты"
        left={<CircleButton accessibilityLabel="Открыть навигацию" onPress={onMenu} badge={attentionCount}><MenuGlyph /></CircleButton>}
        right={<CircleButton accessibilityLabel="Создать проект" onPress={onCreate}><PlusGlyph /></CircleButton>}
      />
      <SegmentTabs items={tabs} value={tab} onChange={setTab} />

      <FlatList
        data={visibleProjects}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => onOpenProject(item.id)}
            onLongPress={() => togglePin(item.id)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.folderTile}><FolderGlyph /></View>
            <View style={styles.copy}>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.date}>{formatRelativeDate(item.updatedAt)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={pinned.has(item.id) ? "Открепить проект" : "Закрепить проект"} onPress={() => togglePin(item.id)} hitSlop={8} style={styles.pinButton}>
              {pinned.has(item.id) ? <PinGlyph /> : null}
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{query ? "Проекты не найдены" : "Проектов пока нет"}</Text>
            <Text style={styles.emptyText}>{query ? "Измените запрос поиска." : "Новый проект появится после создания первой сметы."}</Text>
            {!query ? <Pressable onPress={onCreate} style={styles.emptyButton}><Text style={styles.emptyButtonText}>Начать в чате</Text></Pressable> : null}
          </View>
        )}
      />

      <SearchDock value={query} onChangeText={setQuery} placeholder="Поиск проектов" />
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  list: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 118 },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 20, paddingVertical: 7 },
  folderTile: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#f2f2f3", transform: [{ scale: 1 }] },
  copy: { minWidth: 0, flex: 1 },
  title: { color: "#111214", fontSize: 23, lineHeight: 28, fontWeight: "700", letterSpacing: -0.6 },
  date: { marginTop: 3, color: "#999a9d", fontSize: 18, lineHeight: 22, fontWeight: "600", letterSpacing: -0.3 },
  pinButton: { width: 42, height: 48, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, minHeight: 420, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 },
  emptyTitle: { color: "#111214", fontSize: 23, lineHeight: 29, fontWeight: "800", textAlign: "center" },
  emptyText: { marginTop: 9, color: "#8f9094", fontSize: 15, lineHeight: 22, textAlign: "center" },
  emptyButton: { minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 22, borderRadius: 25, backgroundColor: theme.text, paddingHorizontal: 24 },
  emptyButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" }
});
