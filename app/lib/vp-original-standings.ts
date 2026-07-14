import type { CodeforcesContestStandings, CodeforcesParty } from "./codeforces";

export type VpStandingProblem = { contestId: number; index: string; slot: string };
export type VpStandingState = { solved: boolean; wrongAttempts: number; pendingAttempts: number; solvedMinutes: number | null; penalty: number };
export type VpStandingRow = { id: string; handle: string; solved: number; penalty: number; problems: Record<string, VpStandingState>; sourceCount: number; sourceContests: number[]; origin: "original" | "mine"; mine: boolean; rank?: number };

export function vpProblemKey(problem: Pick<VpStandingProblem, "contestId" | "index">) {
  return `${problem.contestId}${problem.index}`;
}

export function emptyVpStates(problems: VpStandingProblem[]) {
  return Object.fromEntries(problems.map((problem) => [vpProblemKey(problem), { solved: false, wrongAttempts: 0, pendingAttempts: 0, solvedMinutes: null, penalty: 0 }])) as Record<string, VpStandingState>;
}

function originalPartyIdentity(party: CodeforcesParty) {
  if (party.participantType && party.participantType !== "CONTESTANT") return null;
  const handles = (party.members ?? []).map((member) => member.handle?.trim()).filter((handle): handle is string => Boolean(handle));
  if (!handles.length) return null;
  const identity = handles.map((handle) => handle.toLowerCase()).sort().join("+");
  return { id: `original:${identity}`, handle: party.teamName || handles.join(" + ") };
}

export function buildOriginalVpRows(problems: VpStandingProblem[], sourceBoards: CodeforcesContestStandings[], elapsedSeconds: number) {
  const combined = new Map<string, VpStandingRow & { sourceSet: Set<number> }>();
  for (const source of sourceBoards) {
    const selected = problems.filter((problem) => problem.contestId === source.contest.id);
    if (!selected.length) continue;
    const positions = new Map(source.problems.map((problem, index) => [problem.index, index]));
    for (const sourceRow of source.rows) {
      const identity = originalPartyIdentity(sourceRow.party);
      if (!identity) continue;
      let row = combined.get(identity.id);
      if (!row) {
        row = { ...identity, solved: 0, penalty: 0, problems: emptyVpStates(problems), sourceCount: 0, sourceContests: [], sourceSet: new Set(), origin: "original", mine: false };
        combined.set(identity.id, row);
      }
      row.sourceSet.add(source.contest.id);
      for (const problem of selected) {
        const position = positions.get(problem.index);
        const result = position === undefined ? undefined : sourceRow.problemResults[position];
        if (!result) continue;
        const solvedAt = Number(result.bestSubmissionTimeSeconds);
        const rejected = Math.max(0, Number(result.rejectedAttemptCount) || 0);
        const state = row.problems[vpProblemKey(problem)];
        if (Number(result.points) > 0 && Number.isFinite(solvedAt) && solvedAt >= 0 && solvedAt <= elapsedSeconds) {
          state.solved = true;
          state.wrongAttempts = rejected;
          state.solvedMinutes = Math.floor(solvedAt / 60);
          state.penalty = state.solvedMinutes + rejected * 20;
        } else if (elapsedSeconds >= Number(source.contest.durationSeconds || 0)) state.wrongAttempts = rejected;
      }
    }
  }
  return [...combined.values()].map(({ sourceSet, ...row }) => {
    const states = Object.values(row.problems);
    return { ...row, sourceCount: sourceSet.size, sourceContests: [...sourceSet], solved: states.filter((state) => state.solved).length, penalty: states.reduce((sum, state) => sum + state.penalty, 0) };
  });
}
