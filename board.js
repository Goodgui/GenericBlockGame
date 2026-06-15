(function () {
// Creates an empty two-dimensional board array.
function createEmptyBoard(size = 9) {
  return Array.from(
    { length: size },
    () => Array(size).fill(0),
  );
}

// Returns true when every cell in a shape fits inside an empty board cell.
function canPlace(board, shape, originCol, originRow) {
  const height = board.length;
  const width = board[0]?.length || 0;
  return shape.cells.every(([x, y]) => {
    const col = originCol + x;
    const row = originRow + y;
    return row >= 0
      && row < height
      && col >= 0
      && col < width
      && !board[row][col];
  });
}

// Scans every possible origin to determine whether a tray piece is usable.
function canPlaceAnywhere(board, shape, dimensions) {
  const { width, height } = dimensions;
  const boardHeight = board.length;
  const boardWidth = board[0]?.length || 0;
  for (let row = 0; row <= boardHeight - height; row += 1) {
    for (let col = 0; col <= boardWidth - width; col += 1) {
      if (canPlace(board, shape, col, row)) return true;
    }
  }
  return false;
}

// Fills the board cells occupied by a successfully dropped piece.
function fillShape(board, shape, originCol, originRow) {
  for (const [x, y] of shape.cells) {
    board[originRow + y][originCol + x] = 1;
  }
}

// Collects completed rows, columns, and 3x3 boxes.
// zoneCount is separate because intersecting zones can share board cells.
function findCompletedCells(board) {
  const completed = new Set();
  let zoneCount = 0;
  let pointValue = 0;
  const height = board.length;
  const width = board[0]?.length || 0;

  for (let row = 0; row < height; row += 1) {
    if (board[row].every(Boolean)) {
      zoneCount += 1;
      pointValue += width;
      for (let col = 0; col < width; col += 1) completed.add(`${row},${col}`);
    }
  }

  for (let col = 0; col < width; col += 1) {
    if (board.every(row => row[col])) {
      zoneCount += 1;
      pointValue += height;
      for (let row = 0; row < height; row += 1) completed.add(`${row},${col}`);
    }
  }

  for (let boxRow = 0; boxRow < height; boxRow += 3) {
    for (let boxCol = 0; boxCol < width; boxCol += 3) {
      let boxIsComplete = true;

      for (let row = boxRow; row < boxRow + 3; row += 1) {
        for (let col = boxCol; col < boxCol + 3; col += 1) {
          boxIsComplete &&= Boolean(board[row][col]);
        }
      }

      if (boxIsComplete) {
        zoneCount += 1;
        pointValue += 9;
        for (let row = boxRow; row < boxRow + 3; row += 1) {
          for (let col = boxCol; col < boxCol + 3; col += 1) {
            completed.add(`${row},${col}`);
          }
        }
      }
    }
  }

  return { cells: completed, zoneCount, pointValue };
}

// Removes a set of completed cells from the board.
function clearCells(board, completed) {
  for (const key of completed) {
    const [row, col] = key.split(",").map(Number);
    board[row][col] = 0;
  }
}

Object.assign(window.GenericBlockGame, {
  createEmptyBoard,
  canPlace,
  canPlaceAnywhere,
  fillShape,
  findCompletedCells,
  clearCells,
});
}());
