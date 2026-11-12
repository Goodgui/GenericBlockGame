(function () {
const HEX_HEIGHT = 2 / Math.sqrt(3);
const HEX_ROW_STEP = Math.sqrt(3) / 2;

function hexKey(q, r) {
  return `${q},${r}`;
}

// q and r follow two of the grid's three axes. The third is -q-r.
function hexToPixel(q, r, cellSize = 1) {
  return { x: (q + r / 2) * cellSize, y: r * HEX_ROW_STEP * cellSize };
}

function roundHex(q, r) {
  const s = -q - r;
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
  const roundedS = Math.round(s);
  const qError = Math.abs(roundedQ - q);
  const rError = Math.abs(roundedR - r);
  const sError = Math.abs(roundedS - s);
  if (qError > rError && qError > sError) roundedQ = -roundedR - roundedS;
  else if (rError > sError) roundedR = -roundedQ - roundedS;
  return { q: roundedQ, r: roundedR };
}

function pixelToHex(x, y, cellSize = 1) {
  const r = y / (HEX_ROW_STEP * cellSize);
  const q = x / cellSize - r / 2;
  return { ...roundHex(q, r), rawQ: q, rawR: r };
}

function hexDistance(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

function boardDimensions(side) {
  return { width: side * 2 - 1, height: (side - 1) * 2 * HEX_ROW_STEP + HEX_HEIGHT };
}

Object.assign(window.GenericBlockGame, {
  HEX_HEIGHT, HEX_ROW_STEP, hexKey, hexToPixel, pixelToHex, hexDistance, boardDimensions,
});
}());
