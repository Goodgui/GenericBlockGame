(function () {
function createMatch() {
  return { player: 0, scores: [0, 0], streaks: [0, 0], placed: 0, consecutivePasses: 0 };
}

function cloneMatch(match) {
  return match ? { ...match, scores: [...match.scores], streaks: [...match.streaks] } : null;
}

function isValidMatch(match) {
  return match && [0, 1].includes(match.player)
    && [match.scores, match.streaks].every(values => Array.isArray(values)
      && values.length === 2 && values.every(value => Number.isSafeInteger(value) && value >= 0))
    && Number.isSafeInteger(match.placed) && match.placed >= 0
    && Number.isInteger(match.consecutivePasses) && match.consecutivePasses >= 0 && match.consecutivePasses <= 2;
}

// Only the player who completes a clear earns its points and streak.
function recordMatchPlacement(match, completed) {
  match.placed += 1;
  const player = match.player;
  match.streaks[player] = completed.zoneCount ? match.streaks[player] + 1 : 0;
  const gained = completed.pointValue * completed.zoneCount * match.streaks[player];
  match.scores[player] += gained;
  return gained;
}

// Only a completed tray breaks a run of passes.
function endMatchTurn(match, passed = false) {
  match.consecutivePasses = passed ? match.consecutivePasses + 1 : 0;
  if (match.consecutivePasses >= 2) return true;
  match.player = 1 - match.player;
  match.placed = 0;
  return false;
}

Object.assign(window.GenericBlockGame, {
  createMatch, cloneMatch, isValidMatch, recordMatchPlacement, endMatchTurn,
});
}());
