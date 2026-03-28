import type { MetadataRoute } from "next";

/** عند تثبيت التطبيق / الإضافة للشاشة الرئيسية يُفتح بدون شريط عنوان المتصفح */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "نظام رصين لإدارة الامتحانات",
    short_name: "رصين",
    description: "نظام رصين لإدارة الامتحانات في جامعة البصرة",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone", "minimal-ui"],
    background_color: "#0c1a2e",
    theme_color: "#0c1a2e",
    orientation: "any",
    icons: [
      {
        src: "/rassiin.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/rassiin.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
