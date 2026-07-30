# Store and desktop release

## iOS and Android

The native app is in `apps/mobile` and targets Expo SDK 57 / React Native 0.86.

```bash
cd apps/mobile
npm install
npx eas-cli login
npx eas-cli build --profile production --platform ios
npx eas-cli build --profile production --platform android
npx eas-cli submit --profile production --platform ios
npx eas-cli submit --profile production --platform android
```

Required owner-controlled credentials:

- Expo/EAS account and project registration;
- Apple Developer membership, App Store Connect app record, signing certificate/profile or managed credentials;
- Google Play Console app record and service-account JSON with release permission;
- final privacy-policy/support URLs and store metadata.

CI accepts these only as encrypted repository/environment secrets. They are never committed.

## Desktop

```bash
cd apps/desktop
npm install
npm run build
```

Unsigned development bundles can be built automatically. Public macOS distribution requires Apple signing/notarization credentials; Windows public distribution requires a code-signing certificate; Linux packages can be generated without a commercial signing identity.

## Release gate

A store release is accepted only when the web quality suite, Rust parity tests, native typecheck/Expo Doctor, Tauri compile, tenant isolation, privacy metadata, store screenshots and signed upload all pass against one version tag.
