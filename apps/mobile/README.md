# Prosmet Native

Expo SDK 57 / React Native 0.86 application for iOS, Android and native web. It uses `@assistant-ui/react-native`, the same AG-UI backend as the web app, native SQLite for offline drafts/outbox, SecureStore for server configuration, native PDF generation/sharing, and the server Rust approval gate.

```bash
npm install
npm run typecheck
npm run ios
npm run android
```

Production builds are created with EAS profiles from `eas.json`. Store submission requires the owner's Expo, Apple Developer and Google Play credentials.
