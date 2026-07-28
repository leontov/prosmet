import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";

// The current SQL.js browser glue performs dynamic code evaluation while
// preparing its WebAssembly module. Keep the permission explicit and covered
// by browser tests; all scripts still have to originate from this application.
const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  "'unsafe-eval'",
  "'wasm-unsafe-eval'"
].join(" ");

const connectSources = [
  "'self'",
  ...(isDevelopment ? ["ws:", "wss:"] : [])
].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSources}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  `connect-src ${connectSources}`,
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb"
    }
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=()" },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy
          }
        ]
      }
    ];
  }
};

export default nextConfig;
