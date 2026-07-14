export type ArchiveContest = {
  id: string;
  year: 2024 | 2025 | 2026;
  name: string;
  city: string;
  type: "邀请赛" | "区域赛" | "东亚决赛";
  boardPath: string;
  problemCount: number;
  gymId?: number;
  qojContestId?: number;
};

export const archiveContests: ArchiveContest[] = [
  { id: "2026-shenzhen-invitational", year: 2026, name: "ICPC 深圳邀请赛", city: "深圳", type: "邀请赛", boardPath: "icpc/51st/shenzhen-invitational", problemCount: 13 },
  { id: "2026-wuhan-invitational", year: 2026, name: "ICPC 武汉邀请赛暨湖北省赛", city: "武汉", type: "邀请赛", boardPath: "icpc/51st/wuhan-invitational", problemCount: 13, qojContestId: 3799 },
  { id: "2026-jiangxi-invitational", year: 2026, name: "ICPC 江西邀请赛", city: "南昌", type: "邀请赛", boardPath: "icpc/51st/jiangxi-invitational", problemCount: 13 },

  { id: "2025-wuhan-invitational", year: 2025, name: "ICPC 武汉邀请赛暨湖北省赛", city: "武汉", type: "邀请赛", boardPath: "icpc/50th/wuhan-invitational", problemCount: 13, qojContestId: 2025 },
  { id: "2025-nanchang-invitational", year: 2025, name: "ICPC 南昌邀请赛暨江西省赛", city: "南昌", type: "邀请赛", boardPath: "icpc/50th/nanchang-invitational", problemCount: 13, gymId: 105911 },
  { id: "2025-xian", year: 2025, name: "ICPC 区域赛西安站", city: "西安", type: "区域赛", boardPath: "icpc/50th/xian", problemCount: 13, qojContestId: 2562 },
  { id: "2025-chengdu", year: 2025, name: "ICPC 区域赛成都站", city: "成都", type: "区域赛", boardPath: "icpc/50th/chengdu", problemCount: 13, gymId: 106161, qojContestId: 2567 },
  { id: "2025-wuhan", year: 2025, name: "ICPC 区域赛武汉站", city: "武汉", type: "区域赛", boardPath: "icpc/50th/wuhan", problemCount: 13, qojContestId: 2609 },
  { id: "2025-nanjing", year: 2025, name: "ICPC 区域赛南京站", city: "南京", type: "区域赛", boardPath: "icpc/50th/nanjing", problemCount: 13, qojContestId: 2581 },
  { id: "2025-shenyang", year: 2025, name: "ICPC 区域赛沈阳站", city: "沈阳", type: "区域赛", boardPath: "icpc/50th/shenyang", problemCount: 13, gymId: 106252, qojContestId: 2641 },
  { id: "2025-shanghai", year: 2025, name: "ICPC 区域赛上海站", city: "上海", type: "区域赛", boardPath: "icpc/50th/shanghai", problemCount: 13, qojContestId: 2908 },
  { id: "2025-hongkong", year: 2025, name: "ICPC 区域赛香港站", city: "香港", type: "区域赛", boardPath: "icpc/50th/hongkong", problemCount: 12 },
  { id: "2025-ecfinal", year: 2025, name: "ICPC 东亚区决赛", city: "EC-Final", type: "东亚决赛", boardPath: "icpc/50th/ecfinal", problemCount: 12, qojContestId: 3295 },

  { id: "2024-xian-invitational", year: 2024, name: "ICPC 西安邀请赛", city: "西安", type: "邀请赛", boardPath: "icpc/49th/xian-invitational", problemCount: 13 },
  { id: "2024-kunming-invitational", year: 2024, name: "ICPC 昆明邀请赛", city: "昆明", type: "邀请赛", boardPath: "icpc/49th/kunming-invitational", problemCount: 13, qojContestId: 1802 },
  { id: "2024-wuhan-invitational", year: 2024, name: "ICPC 武汉邀请赛暨湖北省赛", city: "武汉", type: "邀请赛", boardPath: "icpc/49th/wuhan-invitational", problemCount: 13 },
  { id: "2024-nanjing", year: 2024, name: "ICPC 区域赛南京站", city: "南京", type: "区域赛", boardPath: "icpc/49th/nanjing", problemCount: 13, gymId: 105484 },
  { id: "2024-hangzhou", year: 2024, name: "ICPC 区域赛杭州站", city: "杭州", type: "区域赛", boardPath: "icpc/49th/hangzhou", problemCount: 13, gymId: 105657 },
  { id: "2024-chengdu", year: 2024, name: "ICPC 区域赛成都站", city: "成都", type: "区域赛", boardPath: "icpc/49th/chengdu", problemCount: 13, gymId: 105486 },
  { id: "2024-shenyang", year: 2024, name: "ICPC 区域赛沈阳站", city: "沈阳", type: "区域赛", boardPath: "icpc/49th/shenyang", problemCount: 13, gymId: 105578 },
  { id: "2024-kunming", year: 2024, name: "ICPC 区域赛昆明站", city: "昆明", type: "区域赛", boardPath: "icpc/49th/kunming", problemCount: 13, gymId: 105588 },
  { id: "2024-shanghai", year: 2024, name: "ICPC 区域赛上海站", city: "上海", type: "区域赛", boardPath: "icpc/49th/shanghai", problemCount: 13 },
  { id: "2024-hongkong", year: 2024, name: "ICPC 区域赛香港站", city: "香港", type: "区域赛", boardPath: "icpc/49th/hongkong", problemCount: 13 },
  { id: "2024-ecfinal", year: 2024, name: "ICPC 东亚区决赛", city: "EC-Final", type: "东亚决赛", boardPath: "icpc/49th/ecfinal", problemCount: 12 },
];

export function findArchiveContest(id: string) {
  return archiveContests.find((contest) => contest.id === id);
}

export function archiveProblemUrl(contest: ArchiveContest, slot: string) {
  if (contest.gymId) return `https://codeforces.com/gym/${contest.gymId}/problem/${slot}`;
  if (contest.qojContestId) return `https://qoj.ac/contest/${contest.qojContestId}`;
  return `https://board.xcpcio.com/${contest.boardPath}`;
}
