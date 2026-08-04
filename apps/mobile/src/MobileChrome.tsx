import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MoreGlyph, SearchGlyph } from "./ReferenceIcons";
import { theme } from "./theme";

type CircleButtonProps = {
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
  badge?: number;
  filled?: boolean;
};

export function CircleButton({ accessibilityLabel, onPress, children, badge = 0, filled = false }: CircleButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.circle, filled && styles.circleFilled, pressed && styles.pressed]}
    >
      {children}
      {badge > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(badge, 9)}</Text></View> : null}
    </Pressable>
  );
}

type ScreenHeaderProps = {
  title: string;
  left: ReactNode;
  right?: ReactNode;
  onTitlePress?: () => void;
  titleUnderlined?: boolean;
};

export function ScreenHeader({ title, left, right, onTitlePress, titleUnderlined = false }: ScreenHeaderProps) {
  const titleNode = (
    <View style={[styles.headerTitleWrap, titleUnderlined && styles.headerTitleUnderlined]}>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
    </View>
  );

  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>{left}</View>
      <View pointerEvents="box-none" style={styles.headerCenter}>
        {onTitlePress ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Открыть ${title}`} onPress={onTitlePress} style={({ pressed }) => [styles.headerTitleButton, pressed && styles.pressed]}>
            {titleNode}
          </Pressable>
        ) : titleNode}
      </View>
      <View style={[styles.headerSide, styles.headerSideRight]}>
        {right || <View style={styles.headerPlaceholder} />}
      </View>
    </View>
  );
}

export function MoreButton({ onPress }: { onPress: () => void }) {
  return <CircleButton accessibilityLabel="Больше действий" onPress={onPress}><MoreGlyph /></CircleButton>;
}

type SegmentTabsProps<T extends string> = {
  items: Array<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
};

export function SegmentTabs<T extends string>({ items, value, onChange }: SegmentTabsProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.id)}
            style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.pressed]}
          >
            <Text style={[styles.tabText, selected && styles.tabTextSelected]} numberOfLines={1}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type SearchDockProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
};

export function SearchDock({ value, onChangeText, placeholder }: SearchDockProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.searchLayer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.searchDock}>
        <SearchGlyph color="#999a9d" />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9b9c9f"
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel={placeholder}
        />
      </View>
    </View>
  );
}

export const mobileChromeStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas },
  body: { flex: 1, minHeight: 0 }
});

const styles = StyleSheet.create({
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  circle: {
    width: 50,
    height: 50,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.2,
    borderColor: "rgba(17,18,20,0.78)",
    borderRadius: 25,
    backgroundColor: theme.canvas,
    shadowColor: "#111214",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
  },
  circleFilled: { backgroundColor: "#f0f0f1" },
  badge: {
    position: "absolute",
    top: -8,
    right: -6,
    minWidth: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: theme.canvas,
    borderRadius: 14,
    backgroundColor: "#f0182d",
    paddingHorizontal: 5
  },
  badgeText: { color: "#fff", fontSize: 16, lineHeight: 19, fontWeight: "800" },
  header: {
    minHeight: 74,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.canvas,
    paddingHorizontal: 16
  },
  headerSide: { width: 54, alignItems: "flex-start", justifyContent: "center", zIndex: 2 },
  headerSideRight: { alignItems: "flex-end" },
  headerPlaceholder: { width: 50, height: 50 },
  headerCenter: { position: "absolute", left: 70, right: 70, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  headerTitleButton: { minHeight: 50, maxWidth: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  headerTitleWrap: { maxWidth: "100%", paddingHorizontal: 2, paddingBottom: 4 },
  headerTitleUnderlined: { borderBottomWidth: 2.2, borderBottomColor: "#111214" },
  headerTitle: { color: "#111214", fontSize: 23, lineHeight: 28, fontWeight: "800", letterSpacing: -0.8, textAlign: "center" },
  tabsScroll: { flexGrow: 0, minHeight: 70, maxHeight: 70 },
  tabs: { minHeight: 70, alignItems: "center", gap: 18, paddingHorizontal: 16, paddingVertical: 10 },
  tab: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 25, paddingHorizontal: 17 },
  tabSelected: { backgroundColor: "#f1f1f2" },
  tabText: { color: "#9a9b9e", fontSize: 20, lineHeight: 25, fontWeight: "750", letterSpacing: -0.45 },
  tabTextSelected: { color: "#111214" },
  searchLayer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 34, paddingTop: 10, backgroundColor: "rgba(255,255,255,0.96)" },
  searchDock: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderWidth: 1.2,
    borderColor: "rgba(17,18,20,0.78)",
    borderRadius: 30,
    backgroundColor: theme.canvas,
    paddingHorizontal: 15,
    shadowColor: "#111214",
    shadowOpacity: 0.09,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5
  },
  searchInput: { minHeight: 54, flex: 1, color: "#111214", fontSize: 20, lineHeight: 25, fontWeight: "650", paddingVertical: 0 }
});
