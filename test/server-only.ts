// Vitest executes pure server domain modules outside the Next.js bundler.
// This empty module replaces the Next.js `server-only` sentinel in tests only;
// production imports keep the real server boundary semantics.
export {};
