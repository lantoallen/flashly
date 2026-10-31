import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The browser only talks to this site and, when accounts are on, Supabase
// (HTTPS for data, WebSocket for realtime chat). AI providers are called from
// the server, so they don't need to be listed here.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
const connectSrc = ["'self'"];
if (supabase) {
  connectSrc.push(supabase, supabase.replace(/^http/, "ws"));
}

// Without nonces, so pages can stay statically rendered (see the Next.js CSP
// guide). 'unsafe-inline' is needed for the theme script and Next's inline
// bootstrapping; the other directives still block framing, plugins, base-tag
// hijacking and form posts to other sites.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  `connect-src ${connectSrc.join(" ")}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Only on Vercel: locally, `next start` is served over plain http.
  ...(process.env.VERCEL ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
