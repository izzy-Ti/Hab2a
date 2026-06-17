import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    allowedDevOrigins: ["192.168.8.164", "localhost"],
  },
};

export default nextConfig;
