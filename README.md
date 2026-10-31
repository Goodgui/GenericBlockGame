# GenericBlockGame: Hex prototype

This test version uses a hexagon shaped board and a true hex grid. The square version is disabled in this checkout.

Open `index.html` in a browser, or run `python -m http.server 8765` and visit `http://localhost:8765`.

## How to Play

1. Drag a piece from the tray onto the board.
2. Pieces cannot overlap filled hexes or extend beyond the board.
3. Fill a straight line in any of the three grid directions, or a fixed outlined group of seven hexes, to clear it.
4. Use every tray piece to receive a new tray.
5. The game ends when none of the remaining tray pieces can be placed.

The default board has five cells per edge, 61 cells total, and seven separate outlined groups. Each group has one center hex and its six neighbors. The twelve edge cells outside these groups clear through lines. Other filled seven-hex shapes do not count as groups.

Each clear earns one point per cell in its line or group. The game multiplies this sum by the number of lines and groups cleared and the current streak. Shared cells count toward each completed line or group, then disappear once. For example, one seven-cell group earns 7 points at a streak of one.

Pieces arrive in one of six turns, spaced 60 degrees apart. You cannot turn them after they reach the tray.

Use **Undo** to reverse moves made during the current tray. Open **Settings** to choose four, five, or six cells per edge (37, 61, or 91 cells), adjust the tray, piece weights, drag offsets, or make a piece with the hex editor. Only full seven-cell groups get an outline; other edge cells clear through lines.

The browser saves your hex game, settings, and top scores under separate keys. This prototype does not load or overwrite square game saves.

Enable **Time Trial** in Settings to play against a countdown. The timer starts when you place the first piece.

## Single HTML export

Run `python export-html.py` to make `exports/hex-prototype.html`. This file includes all game styles and scripts. Copy it to your phone and open it in a browser.

## Checks

Run `node --test tests/hex.test.cjs` to check grid bounds, turns, placement, line clears, fixed groups, shared clears, and saves. Open `tests/browser.html` to load known boards for manual checks. The fixture buttons replace only this prototype's hex game and settings on the current browser origin.

Open `tests/mobile.html` to check the source game or single HTML export at portrait and landscape phone sizes.
