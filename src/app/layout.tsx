import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MapNews 全球态势地图",
  description: "基于 GDELT 事件信号的全球态势热点地图",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
