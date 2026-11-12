(function () {
const {
  boardZones, cloneBoard, canPlace, fillShape, findCompletedCells, clearCells,
  shapeById, rotateShape, scorePlacement,
} = window.GenericBlockGame;

// Hard keeps the original search. Medium considers fewer future moves.
const SEARCH_LIMITS = {
  medium: { depth: 2, width: 4 },
  hard: { depth: 3, width: 8 },
};

function positionValue(node, zones) {
  const empty = Object.values(node.board.cells).filter(value => value === 0).length;
  let nearClear = 0;
  for (const zone of zones) {
    const gaps = zone.filter(key => node.board.cells[key] === 0).length;
    if (gaps === 1) nearClear += 4;
    else if (gaps === 2) nearClear += 1;
  }
  // Favor near clears within our tray, then avoid giving them to the other player.
  return node.points * 20 + node.placed * 12 + empty * 0.5
    + (node.remaining.length ? nearClear : -nearClear)
    + (node.remaining.length === 0 ? 30 : 0);
}

// Use only the current board and tray. Never change the live game or turn pieces.
// A null move means pass, including a pass that secures an existing lead.
function chooseAiMove(state, difficulty = "hard") {
  if (state.board.type !== "hex" || !state.match || state.match.player !== 1 || state.gameOver) return null;
  if (difficulty !== "easy" && state.match.consecutivePasses === 1
    && state.match.scores[1] > state.match.scores[0]) return null;
  const remaining = state.tray.filter(item => !item.used).map(item => ({
    item, shape: rotateShape(shapeById(item.shapeId), item.rotation || 0),
  }));
  if (!remaining.length) return null;
  const origins = Object.keys(state.board.cells).map(key => key.split(",").map(Number));
  // Easy chooses a legal move without checking scores, clears, or future moves.
  if (difficulty === "easy") {
    const moves = [];
    for (const { item, shape } of remaining) {
      for (const [q, r] of origins) {
        if (canPlace(state.board, shape, q, r)) moves.push({ uid: item.uid, q, r });
      }
    }
    return moves[Math.floor(Math.random() * moves.length)] || null;
  }
  const limits = Object.hasOwn(SEARCH_LIMITS, difficulty) ? SEARCH_LIMITS[difficulty] : SEARCH_LIMITS.hard;
  const { depth: searchDepth, width: searchWidth } = limits;
  const zones = boardZones(state.board);
  let choices = [{ board: state.board, remaining, streak: state.match.streaks[1], points: 0, placed: 0, first: null }];
  let best = null;
  for (let depth = 0; depth < Math.min(searchDepth, remaining.length); depth += 1) {
    const next = [];
    for (const node of choices) {
      const seenPieces = new Set();
      for (const [index, { item, shape }] of node.remaining.entries()) {
        const pieceKey = `${item.shapeId}:${item.rotation || 0}`;
        if (seenPieces.has(pieceKey)) continue;
        seenPieces.add(pieceKey);
        for (const [q, r] of origins) {
          if (!canPlace(node.board, shape, q, r)) continue;
          const board = cloneBoard(node.board);
          fillShape(board, shape, q, r, 2);
          const completed = findCompletedCells(board, zones);
          clearCells(board, completed.cells);
          const scored = scorePlacement(node.streak, completed);
          const candidate = {
            board,
            remaining: node.remaining.filter((_, other) => other !== index),
            streak: scored.streak,
            points: node.points + scored.points,
            placed: node.placed + 1,
            first: node.first || { uid: item.uid, q, r },
          };
          candidate.value = positionValue(candidate, zones);
          next.push(candidate);
          if (!best || candidate.value > best.value) best = candidate;
        }
      }
    }
    next.sort((a, b) => b.value - a.value);
    choices = next.slice(0, searchWidth);
    if (!choices.length) break;
  }
  return best?.first || null;
}

window.GenericBlockGame.chooseAiMove = chooseAiMove;
}());
