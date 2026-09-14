import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "凌田知识库 AI",
  description: "让团队资料变成可以直接对话的知识库。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
