import { StyleSheet, View } from "react-native";

export function MenuGlyph() {
  return <View style={styles.menu}><View style={styles.menuLine} /><View style={styles.menuLine} /></View>;
}

export function ChevronGlyph() {
  return <View style={styles.chevron}><View style={[styles.chevronLine, styles.chevronLeft]} /><View style={[styles.chevronLine, styles.chevronRight]} /></View>;
}

export function VoiceGlyph({ color = "#111214" }: { color?: string }) {
  return (
    <View style={[styles.voiceRing, { borderColor: color }]}>
      <View style={styles.waveRow}>
        {[12, 22, 16, 25, 11].map((height, index) => <View key={index} style={[styles.waveBar, { height, backgroundColor: color }]} />)}
      </View>
    </View>
  );
}

export function PlusGlyph() {
  return <View style={styles.plus}><View style={styles.plusHorizontal} /><View style={styles.plusVertical} /></View>;
}

export function MicGlyph() {
  return (
    <View style={styles.micRoot}>
      <View style={styles.micCapsule} />
      <View style={styles.micArc} />
      <View style={styles.micStem} />
      <View style={styles.micBase} />
    </View>
  );
}

export function ImageGlyph() {
  return (
    <View style={styles.imageFrame}>
      <View style={styles.imageSun} />
      <View style={[styles.imageMountain, styles.imageMountainLeft]} />
      <View style={[styles.imageMountain, styles.imageMountainRight]} />
    </View>
  );
}

export function PenGlyph() {
  return (
    <View style={styles.penRoot}>
      <View style={styles.penBody} />
      <View style={styles.penTip} />
    </View>
  );
}

export function GlobeGlyph() {
  return (
    <View style={styles.globe}>
      <View style={styles.globeVertical} />
      <View style={styles.globeHorizontal} />
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { width: 27, gap: 7 },
  menuLine: { width: 27, height: 3.5, borderRadius: 99, backgroundColor: "#111214" },
  chevron: { width: 22, height: 14, position: "relative" },
  chevronLine: { position: "absolute", top: 5, width: 13, height: 3, borderRadius: 99, backgroundColor: "#8b8c90" },
  chevronLeft: { left: 1, transform: [{ rotate: "42deg" }] },
  chevronRight: { right: 1, transform: [{ rotate: "-42deg" }] },
  voiceRing: { width: 31, height: 31, alignItems: "center", justifyContent: "center", borderWidth: 2.2, borderRadius: 16 },
  waveRow: { height: 25, flexDirection: "row", alignItems: "center", gap: 2.5 },
  waveBar: { width: 2.6, borderRadius: 99 },
  plus: { width: 31, height: 31, position: "relative" },
  plusHorizontal: { position: "absolute", left: 2, right: 2, top: 14, height: 2.5, borderRadius: 99, backgroundColor: "#111214" },
  plusVertical: { position: "absolute", top: 2, bottom: 2, left: 14, width: 2.5, borderRadius: 99, backgroundColor: "#111214" },
  micRoot: { width: 29, height: 31, position: "relative", alignItems: "center" },
  micCapsule: { width: 11, height: 19, borderWidth: 2.2, borderColor: "#111214", borderRadius: 8 },
  micArc: { position: "absolute", top: 7, width: 21, height: 16, borderLeftWidth: 2.2, borderRightWidth: 2.2, borderBottomWidth: 2.2, borderColor: "#111214", borderBottomLeftRadius: 11, borderBottomRightRadius: 11 },
  micStem: { position: "absolute", top: 21, width: 2.2, height: 6, backgroundColor: "#111214" },
  micBase: { position: "absolute", top: 27, width: 12, height: 2.2, borderRadius: 99, backgroundColor: "#111214" },
  imageFrame: { width: 26, height: 22, position: "relative", overflow: "hidden", borderWidth: 2, borderColor: "#5f6063", borderRadius: 4 },
  imageSun: { position: "absolute", top: 3, left: 4, width: 5, height: 5, borderWidth: 1.5, borderColor: "#5f6063", borderRadius: 3 },
  imageMountain: { position: "absolute", bottom: 3, width: 17, height: 2, borderRadius: 99, backgroundColor: "#5f6063" },
  imageMountainLeft: { left: 0, transform: [{ rotate: "-41deg" }] },
  imageMountainRight: { right: -2, transform: [{ rotate: "41deg" }] },
  penRoot: { width: 26, height: 26, position: "relative", transform: [{ rotate: "-42deg" }] },
  penBody: { position: "absolute", left: 11, top: 1, width: 7, height: 21, borderWidth: 2, borderColor: "#5f6063", borderRadius: 3 },
  penTip: { position: "absolute", left: 12.5, top: 20, width: 4, height: 4, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: "#5f6063", transform: [{ rotate: "-45deg" }] },
  globe: { width: 26, height: 26, position: "relative", borderWidth: 2, borderColor: "#5f6063", borderRadius: 13 },
  globeVertical: { position: "absolute", top: -2, bottom: -2, left: 7, right: 7, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: "#5f6063", borderRadius: 13 },
  globeHorizontal: { position: "absolute", left: 1, right: 1, top: 10, height: 2, borderRadius: 99, backgroundColor: "#5f6063" }
});
