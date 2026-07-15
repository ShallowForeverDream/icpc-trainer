import type { CodeforcesContestStandings, CodeforcesParty, CodeforcesSubmission } from "./codeforces";

export type VpStandingProblem = { contestId: number; index: string; slot: string };
export type VpStandingState = { solved: boolean; wrongAttempts: number; pendingAttempts: number; solvedMinutes: number | null; penalty: number };
export type VpMedal = "gold" | "silver" | "bronze" | null;
export type VpStandingRow = { id: string; handle: string; solved: number; penalty: number; lastSolvedMinutes: number | null; problems: Record<string, VpStandingState>; sourceCount: number; sourceContests: number[]; sourceTeams?: Array<{ contestId: number; handle: string }>; origin: "original" | "mine"; mine: boolean; rank?: number; medal?: VpMedal };

export function vpProblemKey(problem: Pick<VpStandingProblem, "contestId" | "index">) {
  return `${problem.contestId}${problem.index}`;
}

export function emptyVpStates(problems: VpStandingProblem[]) {
  return Object.fromEntries(problems.map((problem) => [vpProblemKey(problem), { solved: false, wrongAttempts: 0, pendingAttempts: 0, solvedMinutes: null, penalty: 0 }])) as Record<string, VpStandingState>;
}

export function vpMedalCutoffs(officialTeams: number) {
  const teams = Math.max(0, Math.floor(officialTeams || 0));
  if (!teams) return { gold: 0, silver: 0, bronze: 0 };
  const gold = Math.max(1, Math.ceil(teams * .1));
  const silver = gold + Math.ceil(teams * .2);
  const bronze = silver + Math.ceil(teams * .3);
  return { gold, silver, bronze };
}

function medalForRank(rank: number, cutoffs: ReturnType<typeof vpMedalCutoffs>): VpMedal {
  if (rank <= cutoffs.gold) return "gold";
  if (rank <= cutoffs.silver) return "silver";
  if (rank <= cutoffs.bronze) return "bronze";
  return null;
}

function summarize(states: Record<string, VpStandingState>) {
  const solvedStates = Object.values(states).filter((state) => state.solved);
  return {
    solved: solvedStates.length,
    penalty: solvedStates.reduce((sum, state) => sum + state.penalty, 0),
    lastSolvedMinutes: solvedStates.length ? Math.max(...solvedStates.map((state) => state.solvedMinutes || 0)) : null,
  };
}

function originalPartyIdentity(party: CodeforcesParty) {
  if (party.participantType && party.participantType !== "CONTESTANT") return null;
  const handles = (party.members ?? []).map((member) => member.handle?.trim()).filter((handle): handle is string => Boolean(handle));
  if (!handles.length) return null;
  const identity = handles.map((handle) => handle.toLowerCase()).sort().join("+");
  return { id: `original:${identity}`, handle: party.teamName || handles.join(" + ") };
}

function replaySourceBoard(problems: VpStandingProblem[], source: CodeforcesContestStandings, elapsedSeconds: number) {
  const selected = problems.filter((problem) => problem.contestId === source.contest.id);
  if (!selected.length) return null;
  const positions = new Map(source.problems.map((problem, index) => [problem.index, index]));
  const rows: VpStandingRow[] = [];
  for (const sourceRow of source.rows) {
    const identity = originalPartyIdentity(sourceRow.party);
    if (!identity) continue;
    const states = emptyVpStates(problems);
    for (const problem of selected) {
      const position = positions.get(problem.index);
      const result = position === undefined ? undefined : sourceRow.problemResults[position];
      if (!result) continue;
      const solvedAt = Number(result.bestSubmissionTimeSeconds);
      const rejected = Math.max(0, Number(result.rejectedAttemptCount) || 0);
      const state = states[vpProblemKey(problem)];
      if (Number(result.points) > 0 && Number.isFinite(solvedAt) && solvedAt >= 0 && solvedAt <= elapsedSeconds) {
        state.solved = true;
        state.wrongAttempts = rejected;
        state.solvedMinutes = Math.floor(solvedAt / 60);
        state.penalty = state.solvedMinutes + rejected * 20;
      } else if (elapsedSeconds >= Number(source.contest.durationSeconds || 0)) state.wrongAttempts = rejected;
    }
    rows.push({ ...identity, ...summarize(states), problems: states, sourceCount: 1, sourceContests: [source.contest.id], origin: "original", mine: false });
  }
  rows.sort((left, right) => right.solved - left.solved || left.penalty - right.penalty || (left.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) - (right.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) || left.handle.localeCompare(right.handle));
  return { contestId: source.contest.id, selected, rows };
}

export function buildOriginalVpRows(problems: VpStandingProblem[], sourceBoards: CodeforcesContestStandings[], elapsedSeconds: number) {
  const replays = sourceBoards.map((source) => replaySourceBoard(problems, source, elapsedSeconds)).filter((source): source is NonNullable<typeof source> => Boolean(source?.rows.length));
  if (!replays.length) return [];
  if (replays.length === 1) return replays[0].rows;

  const referenceCount = Math.min(500, ...replays.map((source) => source.rows.length));
  return Array.from({ length: referenceCount }, (_, index): VpStandingRow => {
    const states = emptyVpStates(problems);
    const sourceTeams: Array<{ contestId: number; handle: string }> = [];
    for (const replay of replays) {
      const percentileIndex = Math.min(replay.rows.length - 1, Math.floor((index + 0.5) * replay.rows.length / referenceCount));
      const sourceRow = replay.rows[percentileIndex];
      sourceTeams.push({ contestId: replay.contestId, handle: sourceRow.handle });
      for (const problem of replay.selected) states[vpProblemKey(problem)] = { ...sourceRow.problems[vpProblemKey(problem)] };
    }
    return {
      id: `combined:${index + 1}`,
      handle: `组合参考 #${String(index + 1).padStart(3, "0")}`,
      ...summarize(states),
      problems: states,
      sourceCount: replays.length,
      sourceContests: replays.map((source) => source.contestId),
      sourceTeams,
      origin: "original",
      mine: false,
    };
  });
}

export function buildParticipantVpRows(participants: string[], problems: VpStandingProblem[], startedAt: number, submissionSets: CodeforcesSubmission[][], cutoffSeconds: number) {
  const startSeconds = Math.floor(startedAt / 1000);
  const cutoff = startSeconds + Math.max(0, Math.floor(cutoffSeconds));
  const problemKeys = new Set(problems.map(vpProblemKey));
  return participants.map((handle, participantIndex): VpStandingRow => {
    const states = emptyVpStates(problems);
    const submissions = (submissionSets[participantIndex] ?? []).filter((item) => item.creationTimeSeconds >= startSeconds && item.creationTimeSeconds <= cutoff && problemKeys.has(`${item.problem.contestId}${item.problem.index}`)).sort((left, right) => left.creationTimeSeconds - right.creationTimeSeconds);
    for (const submission of submissions) {
      const state = states[`${submission.problem.contestId}${submission.problem.index}`];
      if (!state || state.solved) continue;
      if (submission.verdict === "OK") {
        state.solved = true;
        state.pendingAttempts = 0;
        state.solvedMinutes = Math.max(0, Math.floor((submission.creationTimeSeconds - startSeconds) / 60));
        state.penalty = state.solvedMinutes + state.wrongAttempts * 20;
      } else if (submission.verdict === "TESTING") state.pendingAttempts += 1;
      else if (!["COMPILATION_ERROR", "SKIPPED"].includes(submission.verdict ?? "")) state.wrongAttempts += 1;
    }
    return { id: `mine:${handle.toLowerCase()}`, handle, ...summarize(states), problems: states, sourceCount: 0, sourceContests: [], origin: "mine", mine: true };
  });
}

export function rankVpRows(originalRows: VpStandingRow[], participantRows: VpStandingRow[]) {
  const cutoffs = vpMedalCutoffs(originalRows.length);
  const rows = [...originalRows, ...participantRows].sort((left, right) => right.solved - left.solved || left.penalty - right.penalty || (left.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) - (right.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) || Number(left.mine) - Number(right.mine) || left.handle.localeCompare(right.handle));
  let previous: VpStandingRow | undefined;
  rows.forEach((row, index) => {
    row.rank = previous && previous.solved === row.solved && previous.penalty === row.penalty ? previous.rank : index + 1;
    row.medal = medalForRank(row.rank ?? index + 1, cutoffs);
    previous = row;
  });
  return { rows, cutoffs };
}
