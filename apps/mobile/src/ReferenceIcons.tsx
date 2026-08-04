import { StyleSheet, Text, View } from "react-native";

type ColorProps = { color?: string };

export function MenuGlyph({ color = "#111214" }: ColorProps) {
  return <View style={styles.menu}><View style={[styles.menuLine, { backgroundColor: color }]} /><View style={[styles.menuLine, { backgroundColor: color }]} /></View>;
}

export function ChevronGlyph({ color = "#8b8c90" }: ColorProps) {
  return <View style={styles.chevron}><View style={[styles.chevronLine, styles.chevronLeft, { backgroundColor: color }]} /><View style={[styles.chevronLine, styles.chevronRight, { backgroundColor: color }]} /></View>;
}

export function BackGlyph({ color = "#111214" }: ColorProps) {
  return <View style={styles.back}><View style={[styles.backLine, styles.backTop, { backgroundColor: color }]} /><View style={[styles.backLine, styles.backBottom, { backgroundColor: color }]} /></View>;
}

export function VoiceGlyph({ color = "#111214" }: ColorProps) {
  return (
    <View style={[styles.voiceRing, { borderColor: color }]}>
      <View style={styles.waveRow}>
        {[12, 22, 16, 25, 11].map((height, index) => <View key={index} style={[styles.waveBar, { height, backgroundColor: color }]} />)}
      </View>
    </View>
  );
}

export function PlusGlyph({ color = "#111214" }: ColorProps) {
  return <View style={styles.plus}><View style={[styles.plusHorizontal, { backgroundColor: color }]} /><View style={[styles.plusVertical, { backgroundColor: color }]} /></View>;
}

export function MicGlyph({ color = "#111214" }: ColorProps) {
  return (
    <View style={styles.micRoot}>
      <View style={[styles.micCapsule, { borderColor: color }]} />
      <View style={[styles.micArc, { borderColor: color }]} />
      <View style={[styles.micStem, { backgroundColor: color }]} />
      <View style={[styles.micBase, { backgroundColor: color }]} />
    </View>
  );
}

export function ImageGlyph({ color = "#5f6063" }: ColorProps) {
  return (
    <View style={[styles.imageFrame, { borderColor: color }]}>
      <View style={[styles.imageSun, { borderColor: color }]} />
      <View style={[styles.imageMountain, styles.imageMountainLeft, { backgroundColor: color }]} />
      <View style={[styles.imageMountain, styles.imageMountainRight, { backgroundColor: color }]} />
    </View>
  );
}

export function PenGlyph({ color = "#5f6063" }: ColorProps) {
  return (
    <View style={styles.penRoot}>
      <View style={[styles.penBody, { borderColor: color }]} />
      <View style={[styles.penTip, { borderColor: color }]} />
    </View>
  );
}

export function ComposeGlyph({ color = "#111214" }: ColorProps) {
  return (
    <View style={styles.composeRoot}>
      <View style={[styles.composeFrame, { borderColor: color }]} />
      <View style={[styles.composePen, { backgroundColor: color }]} />
      <View style={[styles.composePenTip, { borderColor: color }]} />
    </View>
  );
}

export function GlobeGlyph({ color = "#5f6063" }: ColorProps) {
  return (
    <View style={[styles.globe, { borderColor: color }]}>
      <View style={[styles.globeVertical, { borderColor: color }]} />
      <View style={[styles.globeHorizontal, { backgroundColor: color }]} />
    </View>
  );
}

export function SearchGlyph({ color = "#111214" }: ColorProps) {
  return <View style={styles.searchRoot}><View style={[styles.searchCircle, { borderColor: color }]} /><View style={[styles.searchHandle, { backgroundColor: color }]} /></View>;
}

export function MoreGlyph({ color = "#111214" }: ColorProps) {
  return <View style={styles.more}>{[0, 1, 2].map((item) => <View key={item} style={[styles.moreDot, { backgroundColor: color }]} />)}</View>;
}

export function FolderGlyph({ color = "#111214" }: ColorProps) {
  return (
    <View style={styles.folderRoot}>
      <View style={[styles.folderTab, { borderColor: color }]} />
      <View style={[styles.folderBody, { borderColor: color }]} />
    </View>
  );
}

export function LibraryGlyph({ color = "#111214" }: ColorProps) {
  return <View style={styles.library}>{[0, 1, 2].map((item) => <View key={item} style={[styles.libraryBook, item === 2 && styles.libraryBookTilt, { borderColor: color }]} />)}</View>;
}

export function ClockGlyph({ color = "#111214" }: ColorProps) {
  return <View style={[styles.clock, { borderColor: color }]}><View style={[styles.clockHour, { backgroundColor: color }]} /><View style={[styles.clockMinute, { backgroundColor: color }]} /></View>;
}

export function RemoteGlyph({ color = "#111214", online = true }: ColorProps & { online?: boolean }) {
  return (
    <View style={styles.remoteRoot}>
      <View style={[styles.remoteScreen, { borderColor: color }]}>{online ? <View style={styles.remoteOnline} /> : null}</View>
      <View style={[styles.remoteBase, { borderColor: color }]} />
      <View style={styles.remoteKeys}>{[0, 1, 2, 3, 4].map((item) => <View key={item} style={[styles.remoteKey, { backgroundColor: color }]} />)}</View>
    </View>
  );
}

export function ChatGlyph({ color = "#111214" }: ColorProps) {
  return <View style={styles.chatRoot}><View style={[styles.chatBubble, { borderColor: color }]} /><View style={[styles.chatTail, { borderColor: color }]} /></View>;
}

export function DocumentGlyph({ color = "#0a84ff" }: ColorProps) {
  return <View style={[styles.document, { borderColor: color }]}><View style={[styles.documentLine, { backgroundColor: color }]} /><View style={[styles.documentLine, styles.documentLineShort, { backgroundColor: color }]} /></View>;
}

export function CopyGlyph({ color = "#66676a" }: ColorProps) {
  return <View style={styles.copyRoot}><View style={[styles.copyBack, { borderColor: color }]} /><View style={[styles.copyFront, { borderColor: color }]} /></View>;
}

export function SpeakerGlyph({ color = "#66676a" }: ColorProps) {
  return (
    <View style={styles.speakerRoot}>
      <View style={[styles.speakerBody, { backgroundColor: color }]} />
      <View style={[styles.speakerCone, { borderRightColor: color }]} />
      <View style={[styles.speakerWave, styles.speakerWaveSmall, { borderColor: color }]} />
      <View style={[styles.speakerWave, styles.speakerWaveLarge, { borderColor: color }]} />
    </View>
  );
}

export function ThumbGlyph({ color = "#66676a", down = false }: ColorProps & { down?: boolean }) {
  return (
    <View style={[styles.thumbRoot, down && styles.thumbDown]}>
      <View style={[styles.thumbPalm, { borderColor: color }]} />
      <View style={[styles.thumbFinger, { borderColor: color }]} />
    </View>
  );
}

export function ShareGlyph({ color = "#66676a" }: ColorProps) {
  return (
    <View style={styles.shareRoot}>
      <View style={[styles.shareTray, { borderColor: color }]} />
      <View style={[styles.shareStem, { backgroundColor: color }]} />
      <View style={[styles.shareArrowLeft, { backgroundColor: color }]} />
      <View style={[styles.shareArrowRight, { backgroundColor: color }]} />
    </View>
  );
}

export function PinGlyph({ color = "#999a9d" }: ColorProps) {
  return <View style={styles.pinRoot}><View style={[styles.pinHead, { backgroundColor: color }]} /><View style={[styles.pinStem, { backgroundColor: color }]} /></View>;
}

export function CheckGlyph({ color = "#111214" }: ColorProps) {
  return <View style={styles.checkRoot}><View style={[styles.checkShort, { backgroundColor: color }]} /><View style={[styles.checkLong, { backgroundColor: color }]} /></View>;
}

export function SettingsGlyph({ color = "#111214" }: ColorProps) {
  return <Text style={[styles.settingsText, { color }]}>⚙︎</Text>;
}

const styles = StyleSheet.create({
  menu: { width: 27, gap: 7 },
  menuLine: { width: 27, height: 3.5, borderRadius: 99 },
  chevron: { width: 22, height: 14, position: "relative" },
  chevronLine: { position: "absolute", top: 5, width: 13, height: 3, borderRadius: 99 },
  chevronLeft: { left: 1, transform: [{ rotate: "42deg" }] },
  chevronRight: { right: 1, transform: [{ rotate: "-42deg" }] },
  back: { width: 28, height: 30, position: "relative" },
  backLine: { position: "absolute", left: 5, width: 22, height: 5, borderRadius: 99 },
  backTop: { top: 7, transform: [{ rotate: "-45deg" }] },
  backBottom: { bottom: 7, transform: [{ rotate: "45deg" }] },
  voiceRing: { width: 31, height: 31, alignItems: "center", justifyContent: "center", borderWidth: 2.2, borderRadius: 16 },
  waveRow: { height: 25, flexDirection: "row", alignItems: "center", gap: 2.5 },
  waveBar: { width: 2.6, borderRadius: 99 },
  plus: { width: 31, height: 31, position: "relative" },
  plusHorizontal: { position: "absolute", left: 2, right: 2, top: 14, height: 2.5, borderRadius: 99 },
  plusVertical: { position: "absolute", top: 2, bottom: 2, left: 14, width: 2.5, borderRadius: 99 },
  micRoot: { width: 29, height: 31, position: "relative", alignItems: "center" },
  micCapsule: { width: 11, height: 19, borderWidth: 2.2, borderRadius: 8 },
  micArc: { position: "absolute", top: 7, width: 21, height: 16, borderLeftWidth: 2.2, borderRightWidth: 2.2, borderBottomWidth: 2.2, borderBottomLeftRadius: 11, borderBottomRightRadius: 11 },
  micStem: { position: "absolute", top: 21, width: 2.2, height: 6 },
  micBase: { position: "absolute", top: 27, width: 12, height: 2.2, borderRadius: 99 },
  imageFrame: { width: 26, height: 22, position: "relative", overflow: "hidden", borderWidth: 2, borderRadius: 4 },
  imageSun: { position: "absolute", top: 3, left: 4, width: 5, height: 5, borderWidth: 1.5, borderRadius: 3 },
  imageMountain: { position: "absolute", bottom: 3, width: 17, height: 2, borderRadius: 99 },
  imageMountainLeft: { left: 0, transform: [{ rotate: "-41deg" }] },
  imageMountainRight: { right: -2, transform: [{ rotate: "41deg" }] },
  penRoot: { width: 26, height: 26, position: "relative", transform: [{ rotate: "-42deg" }] },
  penBody: { position: "absolute", left: 11, top: 1, width: 7, height: 21, borderWidth: 2, borderRadius: 3 },
  penTip: { position: "absolute", left: 12.5, top: 20, width: 4, height: 4, borderLeftWidth: 2, borderBottomWidth: 2, transform: [{ rotate: "-45deg" }] },
  composeRoot: { width: 31, height: 31, position: "relative" },
  composeFrame: { position: "absolute", left: 2, bottom: 2, width: 24, height: 24, borderWidth: 3, borderRadius: 5 },
  composePen: { position: "absolute", top: 3, right: 0, width: 20, height: 4, borderRadius: 3, transform: [{ rotate: "-45deg" }] },
  composePenTip: { position: "absolute", top: 18, left: 4, width: 7, height: 7, borderLeftWidth: 3, borderBottomWidth: 3, transform: [{ rotate: "-45deg" }] },
  globe: { width: 26, height: 26, position: "relative", borderWidth: 2, borderRadius: 13 },
  globeVertical: { position: "absolute", top: -2, bottom: -2, left: 7, right: 7, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderRadius: 13 },
  globeHorizontal: { position: "absolute", left: 1, right: 1, top: 10, height: 2, borderRadius: 99 },
  searchRoot: { width: 30, height: 30, position: "relative" },
  searchCircle: { position: "absolute", top: 1, left: 1, width: 22, height: 22, borderWidth: 3, borderRadius: 11 },
  searchHandle: { position: "absolute", width: 12, height: 3, right: 0, bottom: 4, borderRadius: 99, transform: [{ rotate: "45deg" }] },
  more: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  moreDot: { width: 7, height: 7, borderRadius: 4 },
  folderRoot: { width: 30, height: 26, position: "relative" },
  folderTab: { position: "absolute", top: 1, left: 1, width: 15, height: 9, borderWidth: 2.4, borderBottomWidth: 0, borderTopLeftRadius: 4, borderTopRightRadius: 5 },
  folderBody: { position: "absolute", left: 0, right: 0, bottom: 0, height: 21, borderWidth: 2.4, borderRadius: 5 },
  library: { width: 30, height: 27, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  libraryBook: { width: 8, height: 25, borderWidth: 2.4, borderRadius: 3 },
  libraryBookTilt: { transform: [{ rotate: "-8deg" }] },
  clock: { width: 28, height: 28, position: "relative", borderWidth: 2.5, borderRadius: 14 },
  clockHour: { position: "absolute", left: 12, top: 5, width: 2.5, height: 9, borderRadius: 99 },
  clockMinute: { position: "absolute", left: 12, top: 12, width: 8, height: 2.5, borderRadius: 99, transform: [{ rotate: "-42deg" }] },
  remoteRoot: { width: 31, height: 31, position: "relative", alignItems: "center" },
  remoteScreen: { width: 24, height: 17, borderWidth: 2.2, borderRadius: 3 },
  remoteOnline: { position: "absolute", top: -5, right: -5, width: 9, height: 9, borderRadius: 5, backgroundColor: "#20c77a" },
  remoteBase: { width: 30, height: 6, borderTopWidth: 2.2, borderBottomWidth: 2.2, borderRadius: 3 },
  remoteKeys: { marginTop: 2, flexDirection: "row", gap: 2 },
  remoteKey: { width: 3, height: 3, borderRadius: 2 },
  chatRoot: { width: 29, height: 28, position: "relative" },
  chatBubble: { position: "absolute", top: 1, left: 1, width: 25, height: 21, borderWidth: 2.4, borderRadius: 11 },
  chatTail: { position: "absolute", left: 5, bottom: 1, width: 9, height: 9, borderLeftWidth: 2.4, borderBottomWidth: 2.4, transform: [{ rotate: "-20deg" }] },
  document: { width: 24, height: 29, borderWidth: 2.4, borderRadius: 5, justifyContent: "center", gap: 5, paddingHorizontal: 5 },
  documentLine: { height: 2.5, borderRadius: 99 },
  documentLineShort: { width: "66%" },
  copyRoot: { width: 27, height: 27, position: "relative" },
  copyBack: { position: "absolute", top: 2, left: 2, width: 18, height: 19, borderWidth: 2, borderRadius: 5 },
  copyFront: { position: "absolute", right: 2, bottom: 2, width: 18, height: 19, borderWidth: 2, borderRadius: 5, backgroundColor: "#fff" },
  speakerRoot: { width: 29, height: 27, position: "relative" },
  speakerBody: { position: "absolute", top: 9, left: 1, width: 7, height: 10, borderRadius: 2 },
  speakerCone: { position: "absolute", top: 4, left: 6, width: 0, height: 0, borderTopWidth: 9, borderBottomWidth: 9, borderRightWidth: 12, borderTopColor: "transparent", borderBottomColor: "transparent" },
  speakerWave: { position: "absolute", borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: "transparent", borderRightWidth: 2, borderRadius: 99 },
  speakerWaveSmall: { top: 7, right: 5, width: 8, height: 13 },
  speakerWaveLarge: { top: 3, right: 0, width: 13, height: 21 },
  thumbRoot: { width: 27, height: 27, position: "relative" },
  thumbDown: { transform: [{ rotate: "180deg" }] },
  thumbPalm: { position: "absolute", left: 8, top: 10, width: 17, height: 13, borderWidth: 2, borderRadius: 4 },
  thumbFinger: { position: "absolute", left: 3, top: 2, width: 9, height: 17, borderWidth: 2, borderRadius: 5, transform: [{ rotate: "28deg" }] },
  shareRoot: { width: 28, height: 29, position: "relative" },
  shareTray: { position: "absolute", left: 3, right: 3, bottom: 2, height: 14, borderLeftWidth: 2.2, borderRightWidth: 2.2, borderBottomWidth: 2.2, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  shareStem: { position: "absolute", top: 3, left: 13, width: 2.4, height: 16, borderRadius: 99 },
  shareArrowLeft: { position: "absolute", top: 4, left: 8, width: 8, height: 2.4, borderRadius: 99, transform: [{ rotate: "-45deg" }] },
  shareArrowRight: { position: "absolute", top: 4, right: 7, width: 8, height: 2.4, borderRadius: 99, transform: [{ rotate: "45deg" }] },
  pinRoot: { width: 26, height: 28, position: "relative", transform: [{ rotate: "42deg" }] },
  pinHead: { position: "absolute", top: 2, left: 6, width: 15, height: 13, borderRadius: 5 },
  pinStem: { position: "absolute", top: 13, left: 12, width: 3, height: 13, borderRadius: 99 },
  checkRoot: { width: 26, height: 24, position: "relative" },
  checkShort: { position: "absolute", left: 2, top: 12, width: 10, height: 4, borderRadius: 99, transform: [{ rotate: "45deg" }] },
  checkLong: { position: "absolute", left: 8, top: 9, width: 18, height: 4, borderRadius: 99, transform: [{ rotate: "-48deg" }] },
  settingsText: { fontSize: 35, lineHeight: 38, fontWeight: "500" }
});
