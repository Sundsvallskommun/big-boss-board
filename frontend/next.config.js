/** @type {import('next').NextConfig} */
const path = require("path");
const backend = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

const nextConfig = {
  // Liten Docker-image: serverar via en fristående Node-server.
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [{ source: "/(.*)", headers: [
      // Ingen form-action-begränsning: SAML-login skickar formuläret vidare till
      // en IdP vars adress väljs vid containerstart, efter att imagen byggts.
      { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
    ] }];
  },
  // En domän: proxar /api/* till backend (inga CORS-bekymmer).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
