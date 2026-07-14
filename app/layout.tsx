import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

const canonicalOrigin = "https://icpc-trainer-shallowdream.safe-chime-4451.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(canonicalOrigin),
  title: "icpc-trainer — 中文竞赛训练工作台",
  description: "聚合 Codeforces 公开题库、中文题面、提交同步、浏览器提交桥接与 VP 的 ICPC 训练平台。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  alternates: { canonical: "/" },
  openGraph: { title: "icpc-trainer — 中文竞赛训练工作台", description: "题库 · 中文题面 · 提交同步 · VP", images: [{ url: "/og.png", width: 1736, height: 907 }] },
  twitter: { card: "summary_large_image", title: "icpc-trainer", description: "中文竞赛训练工作台", images: ["/og.png"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
