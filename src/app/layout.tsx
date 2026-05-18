import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MapNews 地图新闻",
  description: "基于 GDELT 的全球新闻事件地图",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
