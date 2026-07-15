export type ArchiveContest = {
  id: string;
  year: 2024 | 2025 | 2026;
  name: string;
  city: string;
  type: "邀请赛" | "省赛" | "区域赛" | "东亚决赛";
  boardPath: string;
  problemCount: number;
  gymId?: number;
  qojContestId?: number;
  qojProblemIds?: number[];
  problemTitles?: string[];
  chineseStatementUrl?: string;
};

export const archiveContests: ArchiveContest[] = [
  {
    id: "2026-shenzhen-invitational", year: 2026, name: "ICPC 深圳全国邀请赛", city: "深圳", type: "邀请赛", boardPath: "icpc/51st/shenzhen-invitational", problemCount: 13,
    qojContestId: 3588,
    qojProblemIds: [17753, 17754, 17755, 17756, 17757, 17758, 17759, 17760, 17761, 17762, 17763, 17764, 17765],
    problemTitles: ["Greetings from Prof. Chen", "All-Star Showdown", "One Item Away", "City Management", "Card Checking", "Astra", "Snake", "Telepathy", "Calendar Cubes", "Crossroads", "Sum and Product", "Critical Strike", "Night at the Museum"],
    chineseStatementUrl: "https://sua.ac/wiki/2026-icpc-invitational-shenzhen/contest-zh.pdf",
  },
  { id: "2026-wuhan-invitational", year: 2026, name: "ICPC 武汉全国邀请赛暨湖北省赛", city: "武汉", type: "邀请赛", boardPath: "icpc/51st/wuhan-invitational", problemCount: 13, qojContestId: 3799, qojProblemIds: [18428, 18429, 18430, 18431, 18432, 18433, 18434, 18435, 18436, 18437, 18438, 18439, 18440] },
  { id: "2026-jiangxi-invitational", year: 2026, name: "ICPC 南昌全国邀请赛暨江西省赛", city: "南昌", type: "邀请赛", boardPath: "icpc/51st/jiangxi-invitational", problemCount: 13 },
  { id: "2026-shandong-provincial", year: 2026, name: "ICPC 山东省大学生程序设计竞赛", city: "山东", type: "省赛", boardPath: "provincial-contest/2026/shandong", problemCount: 13, qojContestId: 3767 },

  { id: "2025-wuhan-invitational", year: 2025, name: "ICPC 武汉全国邀请赛暨湖北省赛", city: "武汉", type: "邀请赛", boardPath: "icpc/50th/wuhan-invitational", problemCount: 13, qojContestId: 2025, qojProblemIds: [10736, 10737, 10738, 10739, 10740, 10741, 10742, 10743, 10744, 10745, 10746, 10747, 10748] },
  { id: "2025-nanchang-invitational", year: 2025, name: "ICPC 南昌全国邀请赛暨江西省赛", city: "南昌", type: "邀请赛", boardPath: "icpc/50th/nanchang-invitational", problemCount: 13, gymId: 105911 },
  { id: "2025-shandong-provincial", year: 2025, name: "ICPC 山东省大学生程序设计竞赛", city: "山东", type: "省赛", boardPath: "provincial-contest/2025/shandong", problemCount: 13, gymId: 105930, qojContestId: 2040 },
  { id: "2025-xian", year: 2025, name: "ICPC 区域赛西安站", city: "西安", type: "区域赛", boardPath: "icpc/50th/xian", problemCount: 13, qojContestId: 2562, qojProblemIds: [14681, 14682, 14683, 14684, 14685, 14686, 14687, 14688, 14689, 14690, 14691, 14692, 14693] },
  { id: "2025-chengdu", year: 2025, name: "ICPC 区域赛成都站", city: "成都", type: "区域赛", boardPath: "icpc/50th/chengdu", problemCount: 13, gymId: 106161, qojContestId: 2567, qojProblemIds: [14706, 14707, 14708, 14709, 14710, 14711, 14712, 14713, 14714, 14715, 14716, 14717, 14718] },
  { id: "2025-wuhan", year: 2025, name: "ICPC 区域赛武汉站", city: "武汉", type: "区域赛", boardPath: "icpc/50th/wuhan", problemCount: 13, qojContestId: 2609, qojProblemIds: [14719, 14720, 14721, 14722, 14723, 14724, 14725, 14726, 14727, 14728, 14729, 14730, 14731] },
  { id: "2025-nanjing", year: 2025, name: "ICPC 区域赛南京站", city: "南京", type: "区域赛", boardPath: "icpc/50th/nanjing", problemCount: 13, qojContestId: 2581, qojProblemIds: [14801, 14802, 14803, 14804, 14805, 14806, 14807, 14808, 14809, 14810, 14811, 14812, 14813] },
  { id: "2025-shenyang", year: 2025, name: "ICPC 区域赛沈阳站", city: "沈阳", type: "区域赛", boardPath: "icpc/50th/shenyang", problemCount: 13, gymId: 106252, qojContestId: 2641, qojProblemIds: [14940, 14941, 14942, 14943, 14944, 14945, 14946, 14947, 14948, 14949, 14950, 14951, 14952] },
  { id: "2025-shanghai", year: 2025, name: "ICPC 区域赛上海站", city: "上海", type: "区域赛", boardPath: "icpc/50th/shanghai", problemCount: 13, qojContestId: 2908, qojProblemIds: [15314, 15315, 15316, 15317, 15318, 15319, 15320, 15321, 15322, 15323, 15324, 15325, 15326] },
  { id: "2025-hongkong", year: 2025, name: "ICPC 区域赛香港站", city: "香港", type: "区域赛", boardPath: "icpc/50th/hongkong", problemCount: 12 },
  { id: "2025-ecfinal", year: 2025, name: "ICPC 东亚区决赛", city: "EC-Final", type: "东亚决赛", boardPath: "icpc/50th/ecfinal", problemCount: 12, qojContestId: 3295, qojProblemIds: [16328, 16329, 16330, 16331, 16332, 16333, 16334, 16335, 16336, 16337, 16338, 16339] },

  { id: "2024-xian-invitational", year: 2024, name: "ICPC 西安全国邀请赛", city: "西安", type: "邀请赛", boardPath: "icpc/49th/xian-invitational", problemCount: 13 },
  { id: "2024-kunming-invitational", year: 2024, name: "ICPC 昆明全国邀请赛", city: "昆明", type: "邀请赛", boardPath: "icpc/49th/kunming-invitational", problemCount: 13, qojContestId: 1802 },
  { id: "2024-wuhan-invitational", year: 2024, name: "ICPC 武汉全国邀请赛暨湖北省赛", city: "武汉", type: "邀请赛", boardPath: "icpc/49th/wuhan-invitational", problemCount: 13 },
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
  const problemId = contest.qojProblemIds?.[slot.charCodeAt(0) - 65];
  if (contest.qojContestId && problemId) return `https://contest.ucup.ac/contest/${contest.qojContestId}/problem/${problemId}?v=1`;
  if (contest.qojContestId) return `https://qoj.ac/contest/${contest.qojContestId}`;
  return `https://board.xcpcio.com/${contest.boardPath}`;
}

export function archiveProblemHref(contest: ArchiveContest, slot: string) {
  const problemId = contest.qojProblemIds?.[slot.charCodeAt(0) - 65];
  if (contest.qojContestId && problemId) return `/vp/archive/problem?contest=${encodeURIComponent(contest.id)}&slot=${encodeURIComponent(slot)}`;
  if (contest.gymId) return `/problem/${contest.gymId}${slot}?archive=${encodeURIComponent(contest.id)}&slot=${encodeURIComponent(slot)}`;
  return archiveProblemUrl(contest, slot);
}

export function archivePracticeProblem(contest: ArchiveContest, slot: string) {
  const index = slot.charCodeAt(0) - 65;
  const problemId = contest.qojProblemIds?.[index];
  if (!contest.qojContestId || !problemId) return null;
  const officialUrl = `https://contest.ucup.ac/contest/${contest.qojContestId}/problem/${problemId}?v=1`;
  return {
    id: problemId,
    slot,
    title: contest.problemTitles?.[index] || `Problem ${slot}`,
    officialUrl,
    statementUrl: `https://contest.ucup.ac/download.php?type=statement&id=${problemId}&contest_id=${contest.qojContestId}`,
    submitUrl: `${officialUrl}#tab-submit-answer`,
    chineseStatementUrl: contest.chineseStatementUrl,
  };
}
