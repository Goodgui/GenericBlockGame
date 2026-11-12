(function () {
const { scorePlacement } = window.GenericBlockGame;

function createMatch() {
  return { player: 0, scores: [0, 0], streaks: [0, 0], placed: 0, consecutivePasses: 0 };
}

function cloneMatch(match) {
  return match ? { ...match, scores: [...match.scores], streaks: [...match.streaks] } : null;
}

// Board values track each player's pieces, while VS AI swaps their colors.
function matchPlayerColor(state, player) {
  const redPlayer = state.aiOpponent ? 1 : 0;
  return player === redPlayer ? "red" : "blue";
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
  const scored = scorePlacement(match.streaks[player], completed);
  match.streaks[player] = scored.streak;
  match.scores[player] += scored.points;
  return scored.points;
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
  createMatch, cloneMatch, matchPlayerColor, isValidMatch, recordMatchPlacement, endMatchTurn,
});
}());
