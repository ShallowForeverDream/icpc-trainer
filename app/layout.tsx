import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "katex/dist/katex.min.css";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: "icpc-trainer — 中文竞赛训练工作台",
    description: "聚合 Codeforces 公开题库、中文题面、提交同步、浏览器提交桥接与 VP 的 ICPC 训练平台。",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "icpc-trainer — 中文竞赛训练工作台", description: "题库 · 中文题面 · 提交同步 · VP", images: [{ url: `${origin}/og.png`, width: 1736, height: 907 }] },
    twitter: { card: "summary_large_image", title: "icpc-trainer", description: "中文竞赛训练工作台", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
