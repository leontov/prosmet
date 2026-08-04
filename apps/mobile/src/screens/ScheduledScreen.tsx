import { Pressable, StyleSheet, Text, View } from "react-native";
import { CircleButton, ScreenHeader, mobileChromeStyles } from "../MobileChrome";
import { ClockGlyph, MenuGlyph, PlusGlyph } from "../ReferenceIcons";
import { theme } from "../theme";

type Props = {
  attentionCount: number;
  onMenu: () => void;
  onCreate: () => void;
};

export function ScheduledScreen({ attentionCount, onMenu, onCreate }: Props) {
  return (
    <View style={mobileChromeStyles.screen}>
      <ScreenHeader
        title="Запланированные"
        left={<CircleButton accessibilityLabel="Открыть навигацию" onPress={onMenu} badge={attentionCount}><MenuGlyph /></CircleButton>}
        right={<CircleButton accessibilityLabel="Создать задачу" onPress={onCreate}><PlusGlyph /></CircleButton>}
      />
      <View style={styles.empty}>
        <View style={styles.icon}><ClockGlyph /></View>
        <Text style={styles.title}>Задач пока нет</Text>
        <Text style={styles.text}>Запланированные запросы, обновления цен и выпуск документов будут собраны здесь.</Text>
        <Pressable onPress={onCreate} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Создать в чате</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 34, paddingBottom: 80 },
  icon: { width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#f2f2f3", transform: [{ scale: 1.15 }] },
  title: { marginTop: 20, color: "#111214", fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.65 },
  text: { marginTop: 9, maxWidth: 310, color: "#8f9094", fontSize: 15, lineHeight: 22, textAlign: "center" },
  button: { minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 24, borderRadius: 25, backgroundColor: theme.text, paddingHorizontal: 24 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" }
});
