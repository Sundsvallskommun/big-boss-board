/** @type {import('next').NextConfig} */
const path = require("path");
const backend = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

const nextConfig = {
  // Liten Docker-image: serverar via en fristående Node-server.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
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
