import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // السماح بالوصول إلى خادم التطوير من أجهزة أخرى على نفس الشبكة المحلية (هاتف، تابلت…)
  allowedDevOrigins: [
    "192.168.0.96",
    "192.168.0.*",
    "192.168.1.*",
    "10.0.0.*",
  ],
  experimental: {
    serverActions: {
      /** استيراد جداول Excel لسجل المشرفين والمراقبين */
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
