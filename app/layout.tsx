import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c1a2e",
};

export const metadata: Metadata = {
  title: "نظام رصين لادارة الامتحانات",
  description: "نظام رصين لادارة الامتحانات في جامعة البصرة",
  icons: {
    icon: "/rassiin.png",
    shortcut: "/rassiin.png",
    apple: "/rassiin.png",
  },
  appleWebApp: {
    capable: true,
    title: "نظام رصين",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
