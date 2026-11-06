# GenericBlockGame

Play on a hexagon board with a true hex grid, or on the square board. Use the Hex and Square tabs at the top of Settings to switch boards.

Open `index.html` in a browser, or run `python -m http.server 8765` and visit `http://localhost:8765`.

## How to Play

1. Drag a piece from the tray onto the board.
2. Pieces cannot overlap filled cells or extend beyond the board.
3. On Hex, fill a straight line in any of three directions or a fixed outlined group of seven hexes. On Square, fill a row, column, or outlined 3 by 3 group.
4. Use every tray piece to receive a new tray.
5. The game ends when none of the remaining tray pieces can be placed.

The default board has five cells per edge, 61 cells total, and seven separate outlined groups. Each group has one center hex and its six neighbors. The twelve edge cells outside these groups clear through lines. Other filled seven-hex shapes do not count as groups.

Each clear earns one point per cell in its line or group. The game multiplies this sum by the number of lines and groups cleared and the current streak. Shared cells count toward each completed line or group, then disappear once. For example, one seven-cell group earns 7 points at a streak of one.

Hex pieces arrive in one of six turns, spaced 60 degrees apart. Square pieces use four turns, spaced 90 degrees apart. You cannot turn pieces after they reach the tray.

Use **Undo** to reverse moves made during the current tray. Hex supports four, five, or six cells per edge (37, 61, or 91 cells). Square supports 6 by 6, 9 by 9, or 12 by 12 boards. Each board has its own pieces and piece editor. Only full seven-cell Hex groups get an outline; other edge cells clear through lines.

Each board keeps its own General settings, piece weights, custom pieces, game, and top scores. Switching boards restores that board's game. Existing square games and settings still load.

Accessibility settings apply to both boards. The default pickup offset is 100, vertical drag offset is 180, and horizontal drag offset is 170. Piece hue is also shared. Snap safety margin belongs to General: Hex defaults to 1.5 and Square to 2.0.

Accessibility sits below the board's settings. Reset sits last and applies to both boards. Reset top score clears all Hex and Square top scores. Reset all settings restores both boards and shared accessibility settings, removes custom pieces, and starts fresh games.

Enable **Time Trial** in Settings to play against a countdown. The timer starts when you place the first piece.

## 2 Player

Choose **Hex**, then **2 Player** under General. Square supports single player only. Two players share the Hex board. Red starts, then Blue takes the next tray. Each player keeps a score and clear streak. A clear earns points for the player who completes it, no matter who placed the cells.

Use the whole tray to end your turn, or choose **Pass**, to the right of Undo, to discard unused pieces and give the other player a fresh tray. Pass asks for confirmation if any piece still fits. Undo restores moves in the current tray, including scores and the pass count. It cannot go back to a past turn.

The game ends after both players pass in a row, even if they placed pieces before passing. Completing a whole tray resets the pass count. The higher score wins; equal scores draw. The browser saves the match apart from single player games and top scores.

## Single HTML export

Run `python export-html.py` to make `exports/generic-block-game.html`. This file includes both boards and all game styles and scripts. Copy it to your phone and open it in a browser.

## Checks

Run `node --test tests/*.test.cjs` to check both grids, placement, clears, shared and separate settings, two player turns, scores, passes, and saves. Open `tests/browser.html` to load known Hex boards for manual checks. The fixture buttons replace the Hex game and shared accessibility settings on the current browser origin.

Open `tests/two-player.html` and choose **Run checks** to check the two player controls, scoring, turn changes, pass confirmation, Undo, reload, and phone width in a browser. The checks restore the prior saves and settings when they finish. Use a separate local port for these checks.

Open `tests/mobile.html` to check the source game or single HTML export at portrait and landscape phone sizes.

Open `tests/settings.html` to check board tabs, separate settings and games, shared accessibility, global resets, square play, and the single HTML export. These checks restore the prior saves and settings when they finish.
