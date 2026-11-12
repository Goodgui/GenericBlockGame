# GenericBlockGame

GenericBlockGame is my implementation of a generic block puzzle game that runs in the browser.

[Play now in browser](https://goodgui.github.io/GenericBlockGame/)

## How to Play

1. Drag a piece from the tray onto the board.
2. Pieces cannot overlap filled cells or extend beyond the board.
3. Fill a complete row, column, or outlined board section to clear it. In hex mode, lines run in three directions.
4. Use every piece to receive a new set.
5. The game ends when none of the remaining pieces can be placed.

Clears earn points for each cell in the completed line or section. Consecutive clears build a streak, and clearing multiple sections with one piece awards a larger multiplier.

Use **Undo** to reverse moves made during the current tray. Open **Settings** to switch between **Hex** and **Square**, adjust board and tray sizes, piece frequencies, custom pieces, drag offsets, or saved data.

Your current game, settings, and top score are saved in the browser memory. If you modify settings that change pieces or the board, your top score will show "modified"

Enable **Time Trial** in Settings to play against a configurable countdown. The timer starts when the first piece is placed.

## VS AI

Choose **VS AI** under **Hex** in Settings, then pick **Easy**, **Medium**, or **Hard**. You and the computer share a board and take turns using a full tray or passing; the higher score wins when both pass in a row.

## 2 Player

You and a friend take turns placing a set of pieces. When both players pass in a row the game ends.
