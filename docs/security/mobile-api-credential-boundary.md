# Mobile API credential boundary

The mobile client separates three request scopes:

- `public`: chat, estimates, projects, documents, system status and other non-administrative product APIs;
- `user`: user-session endpoints under `/api/auth/**`, using the platform-supported session container;
- `admin`: explicit control-plane calls only, with the administrator token read from Expo SecureStore.

The administrator token is never attached by the default `mobileApiFetch` client. Admin calls use `mobileAdminApiFetch`, validate the HTTP method and route, and fail closed outside the allowlist. Production API URLs require HTTPS; loopback HTTP is limited to development builds.

Verification is covered by source contracts, TypeScript and Vitest route-policy tests. This is the first security slice of issue #71; registration/navigation/offline and device E2E remain separate implementation waves.
