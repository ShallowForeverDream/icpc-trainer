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

export function buildParticipantVpRows(participants, problems, startedAt, submissionSets, cutoffSeconds) {
  const startSeconds = Math.floor(startedAt / 1000);
  const cutoff = startSeconds + Math.max(0, Math.floor(cutoffSeconds));
  const problemKeys = new Set(problems.map((problem) => `${problem.contestId}${problem.index}`));
  return participants.map((handle, participantIndex) => {
    const states = Object.fromEntries(problems.map((problem) => [`${problem.contestId}${problem.index}`, { solved: false, wrongAttempts: 0, pendingAttempts: 0, solvedMinutes: null, penalty: 0 }]));
    const ordered = (submissionSets[participantIndex] || [])
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
