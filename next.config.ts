import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /** استيراد جداول Excel لسجل المشرفين والمراقبين */
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
