export type InternationalContest = {
  year: 2024 | 2025;
  name: string;
  region: string;
  type: "世界总决赛" | "洲际决赛" | "亚洲区域赛";
  href: string;
};

export const internationalContests: InternationalContest[] = [
  { year: 2025, name: "第 49 届 ICPC 世界总决赛（巴库）", region: "全球 · 阿塞拜疆", type: "世界总决赛", href: "https://icpc.global/community/history" },
  { year: 2025, name: "ICPC 亚洲太平洋锦标赛", region: "亚太", type: "洲际决赛", href: "https://apac.icpc.global/" },
  { year: 2025, name: "ICPC 亚洲横滨区域赛", region: "日本", type: "亚洲区域赛", href: "https://icpc.jp/2025/" },
  { year: 2025, name: "ICPC 亚洲台中区域赛", region: "中国台湾", type: "亚洲区域赛", href: "https://www.icpc.tw/2025/" },
  { year: 2025, name: "ICPC 亚洲首尔区域赛", region: "韩国", type: "亚洲区域赛", href: "https://icpc.global/regionals/results/2025" },
  { year: 2025, name: "ICPC 亚洲雅加达区域赛", region: "印度尼西亚", type: "亚洲区域赛", href: "https://icpc.global/regionals/results/2025" },
  { year: 2025, name: "ICPC 亚洲达卡区域赛", region: "孟加拉国", type: "亚洲区域赛", href: "https://icpc.global/regionals/results/2025" },
  { year: 2025, name: "ICPC 亚洲德黑兰区域赛", region: "伊朗", type: "亚洲区域赛", href: "https://icpc.ir/" },
  { year: 2024, name: "第 48 届 ICPC 世界总决赛（阿斯塔纳）", region: "全球 · 哈萨克斯坦", type: "世界总决赛", href: "https://icpc.global/community/history" },
  { year: 2024, name: "ICPC 亚洲太平洋锦标赛", region: "亚太", type: "洲际决赛", href: "https://apac.icpc.global/" },
  { year: 2024, name: "ICPC 亚洲横滨区域赛", region: "日本", type: "亚洲区域赛", href: "https://icpc.jp/about/history/" },
  { year: 2024, name: "ICPC 亚洲台北区域赛", region: "中国台湾", type: "亚洲区域赛", href: "https://icpc.global/regionals/results/2024" },
  { year: 2024, name: "ICPC 亚洲首尔区域赛", region: "韩国", type: "亚洲区域赛", href: "https://icpc.global/regionals/results/2024" },
  { year: 2024, name: "ICPC 亚洲雅加达区域赛", region: "印度尼西亚", type: "亚洲区域赛", href: "https://icpc.global/regionals/results/2024" },
];
