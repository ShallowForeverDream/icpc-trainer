export function medalCutoffs(officialTeams) {
  const teams = Math.max(0, Math.floor(Number(officialTeams) || 0));
  if (!teams) return { gold: 0, silver: 0, bronze: 0 };
  const gold = Math.max(1, Math.ceil(teams * 0.1));
  const silver = gold + Math.ceil(teams * 0.2);
  const bronze = silver + Math.ceil(teams * 0.3);
  return { gold, silver, bronze };
}

export function medalForRank(rank, cutoffs) {
  if (!Number.isInteger(rank) || rank <= 0) return null;
  if (rank <= cutoffs.gold) return "gold";
  if (rank <= cutoffs.silver) return "silver";
  if (rank <= cutoffs.bronze) return "bronze";
  return null;
}

export function summarizeVpStates(states) {
  const values = Object.values(states);
  const solved = values.filter((state) => state.solved);
  return {
    solved: solved.length,
    penalty: solved.reduce((sum, state) => sum + state.penalty, 0),
    lastSolvedMinutes: solved.length ? Math.max(...solved.map((state) => state.solvedMinutes || 0)) : null,
  };
}

function vpProblemKey(problem) {
  return `${problem.contestId}${problem.index}`;
}

function emptyVpStates(problems) {
  return Object.fromEntries(problems.map((problem) => [vpProblemKey(problem), {
    solved: false,
    wrongAttempts: 0,
    pendingAttempts: 0,
    solvedMinutes: null,
    penalty: 0,
  }]));
}

function originalPartyIdentity(party) {
  if (party?.participantType && party.participantType !== "CONTESTANT") return null;
  const handles = (party?.members || []).map((member) => String(member?.handle || "").trim()).filter(Boolean);
  if (!handles.length) return null;
  const identity = [...handles].map((handle) => handle.toLowerCase()).sort().join("+");
  return { id: `original:${identity}`, handle: String(party.teamName || handles.join(" + ")) };
}

function replaySourceBoard(problems, source, elapsedSeconds) {
  const selected = problems.filter((problem) => problem.contestId === source.contest.id);
  if (!selected.length) return null;
  const positions = new Map(source.problems.map((problem, index) => [problem.index, index]));
  const rows = [];
  for (const sourceRow of source.rows) {
    const identity = originalPartyIdentity(sourceRow.party);
    if (!identity) continue;
    const states = emptyVpStates(problems);
    for (const problem of selected) {
      const position = positions.get(problem.index);
      const result = position === undefined ? null : sourceRow.problemResults?.[position];
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
    rows.push({
      ...identity,
      ...summarizeVpStates(states),
      problems: states,
      sourceCount: 1,
      sourceContests: [source.contest.id],
      origin: "original",
      mine: false,
    });
  }
  rows.sort((left, right) => right.solved - left.solved
    || left.penalty - right.penalty
    || (left.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) - (right.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER)
    || left.handle.localeCompare(right.handle));
  return { contestId: source.contest.id, selected, rows };
}

/**
 * Replays each source board using only the selected problems. A multi-contest
 * VP has no real team that entered every source contest, so teams at the same
 * percentile are paired into full-width composite reference rows.
 */
export function buildOriginalVpRows(problems, sourceBoards, elapsedSeconds) {
  const replays = sourceBoards.map((source) => replaySourceBoard(problems, source, elapsedSeconds)).filter((source) => source?.rows.length);
  if (!replays.length) return [];
  if (replays.length === 1) return replays[0].rows;

  const referenceCount = Math.min(2_000, ...replays.map((source) => source.rows.length));
  return Array.from({ length: referenceCount }, (_, index) => {
    const states = emptyVpStates(problems);
    const sourceTeams = [];
    for (const replay of replays) {
      const percentileIndex = Math.min(replay.rows.length - 1, Math.floor((index + 0.5) * replay.rows.length / referenceCount));
      const sourceRow = replay.rows[percentileIndex];
      sourceTeams.push({ contestId: replay.contestId, handle: sourceRow.handle });
      for (const problem of replay.selected) states[vpProblemKey(problem)] = { ...sourceRow.problems[vpProblemKey(problem)] };
    }
    return {
      id: `combined:${index + 1}`,
      handle: `组合参考 #${String(index + 1).padStart(3, "0")}`,
      ...summarizeVpStates(states),
      problems: states,
      sourceCount: replays.length,
      sourceContests: replays.map((source) => source.contestId),
      sourceTeams,
      origin: "original",
      mine: false,
    };
  });
}

function buildParticipantStates(problems, startedAt, submissionSets, cutoffSeconds) {
  const startSeconds = Math.floor(startedAt / 1000);
  const cutoff = startSeconds + Math.max(0, Math.floor(cutoffSeconds));
  const problemKeys = new Set(problems.map((problem) => `${problem.contestId}${problem.index}`));
  const states = emptyVpStates(problems);
  const ordered = submissionSets.flatMap((items) => Array.isArray(items) ? items : [])
    .filter((item) => item.creationTimeSeconds >= startSeconds && item.creationTimeSeconds <= cutoff && problemKeys.has(`${item.problem?.contestId}${item.problem?.index}`))
    .sort((left, right) => left.creationTimeSeconds - right.creationTimeSeconds);
  for (const submission of ordered) {
    const state = states[`${submission.problem.contestId}${submission.problem.index}`];
    if (!state || state.solved) continue;
    if (submission.verdict === "OK") {
      state.solved = true;
      state.pendingAttempts = 0;
      state.solvedMinutes = Math.max(0, Math.floor((submission.creationTimeSeconds - startSeconds) / 60));
      state.penalty = state.solvedMinutes + state.wrongAttempts * 20;
    } else if (submission.verdict === "TESTING") state.pendingAttempts += 1;
    else if (!["COMPILATION_ERROR", "SKIPPED"].includes(submission.verdict || "")) state.wrongAttempts += 1;
  }
  return states;
}

export function buildParticipantVpRows(participants, problems, startedAt, submissionSets, cutoffSeconds) {
  return participants.map((handle, participantIndex) => {
    const states = buildParticipantStates(problems, startedAt, [submissionSets[participantIndex] || []], cutoffSeconds);
    return {
      id: `mine:${handle.toLowerCase()}`,
      handle,
      ...summarizeVpStates(states),
      problems: states,
      sourceCount: 0,
      sourceContests: [],
      origin: "mine",
      mine: true,
    };
  });
}

export function buildTeamVpRow(members, problems, startedAt, submissionSets, cutoffSeconds) {
  const normalized = members.map((handle) => String(handle).trim()).filter(Boolean);
  const states = buildParticipantStates(problems, startedAt, submissionSets, cutoffSeconds);
  return {
    id: `mine:${normalized.map((handle) => handle.toLowerCase()).sort().join("+")}`,
    handle: normalized.join(" + "),
    members: normalized,
    ...summarizeVpStates(states),
    problems: states,
    sourceCount: 0,
    sourceContests: [],
    origin: "mine",
    mine: true,
  };
}

export function rankVpRows(originalRows, participantRows, officialTeams = originalRows.length) {
  const cutoffs = medalCutoffs(officialTeams);
  const rows = [...originalRows, ...participantRows].sort((left, right) => right.solved - left.solved
    || left.penalty - right.penalty
    || (left.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) - (right.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER)
    || Number(left.mine) - Number(right.mine)
    || left.handle.localeCompare(right.handle));
  let previous = null;
  rows.forEach((row, index) => {
    row.rank = previous && previous.solved === row.solved && previous.penalty === row.penalty ? previous.rank : index + 1;
    row.medal = medalForRank(row.rank, cutoffs);
    previous = row;
  });
  return { rows, cutoffs };
}
