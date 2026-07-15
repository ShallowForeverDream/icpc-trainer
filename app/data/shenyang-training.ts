export type ShenyangProblemBand = "warmup" | "core" | "challenge" | "extreme";

export type ShenyangProblemProfile = {
  slot: string;
  acceptedTeams: number;
  teamCount: number;
  solveRate: number;
  band: ShenyangProblemBand;
};

type RawContestProfile = {
  teamCount: number;
  accepted: number[];
};

// Unique accepted teams reconstructed from each XCPCIO Shenyang scoreboard.
// Keeping the counts in source makes the daily plan reproducible even when the
// upstream board is temporarily unavailable.
const rawProfiles: Record<string, RawContestProfile> = {
  "2025-shenyang": {
    teamCount: 411,
    accepted: [36, 371, 6, 10, 2, 52, 34, 2, 410, 3, 140, 0, 383],
  },
  "2024-shenyang": {
    teamCount: 320,
    accepted: [2, 165, 1, 180, 188, 2, 47, 16, 19, 320, 0, 1, 94],
  },
  "2023-shenyang": {
    teamCount: 300,
    accepted: [0, 30, 297, 22, 213, 0, 0, 12, 24, 288, 168, 0, 59],
  },
  "2022-shenyang": {
    teamCount: 738,
    accepted: [135, 160, 729, 733, 32, 371, 23, 22, 38, 12, 15, 496, 13],
  },
};

function bandForRate(rate: number): ShenyangProblemBand {
  if (rate >= 50) return "warmup";
  if (rate >= 10) return "core";
  if (rate >= 1) return "challenge";
  return "extreme";
}

export const shenyangProblemProfiles = Object.fromEntries(Object.entries(rawProfiles).map(([contestId, raw]) => [
  contestId,
  raw.accepted.map((acceptedTeams, index) => {
    const solveRate = acceptedTeams / raw.teamCount * 100;
    return {
      slot: String.fromCharCode(65 + index),
      acceptedTeams,
      teamCount: raw.teamCount,
      solveRate,
      band: bandForRate(solveRate),
    } satisfies ShenyangProblemProfile;
  }),
])) as Record<string, ShenyangProblemProfile[]>;

export const shenyangBandLabels: Record<ShenyangProblemBand, string> = {
  warmup: "热身",
  core: "重点",
  challenge: "挑战",
  extreme: "极难",
};

function rotate<T>(items: T[], offset: number) {
  if (!items.length) return items;
  const start = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

/** Build a six-problem drill with two warmups, two medal-level core problems,
 * and two challenge problems. Zero-solve problems stay available in full VP,
 * but do not crowd out useful daily practice. */
export function balancedShenyangSlots(contestId: string, rotation = 0, size = 6) {
  const profiles = shenyangProblemProfiles[contestId];
  if (!profiles?.length) return [];

  const selected: ShenyangProblemProfile[] = [];
  const take = (band: ShenyangProblemBand, count: number) => {
    for (const item of rotate(profiles.filter((profile) => profile.band === band), rotation)) {
      if (selected.length >= size || selected.some((profile) => profile.slot === item.slot)) continue;
      selected.push(item);
      if (selected.filter((profile) => profile.band === band).length >= count) break;
    }
  };

  take("warmup", 2);
  take("core", 2);
  take("challenge", 2);
  for (const item of rotate(profiles.filter((profile) => profile.band !== "extreme"), rotation)) {
    if (selected.length >= size) break;
    if (!selected.some((profile) => profile.slot === item.slot)) selected.push(item);
  }
  for (const item of rotate(profiles, rotation)) {
    if (selected.length >= size) break;
    if (!selected.some((profile) => profile.slot === item.slot)) selected.push(item);
  }
  return selected.map((profile) => profile.slot);
}

export function shenyangProblemProfile(contestId: string, slot: string) {
  return shenyangProblemProfiles[contestId]?.find((profile) => profile.slot === slot);
}
