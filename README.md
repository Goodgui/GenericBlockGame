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

Turn on **Slow mode** under **Accessibility** to wait for **Continue** after the last piece. You can still undo that move before the next tray or turn starts. Slow mode starts off and works in all game modes. In VS AI, the computer ends its turn on its own.

The tray shows up to three pieces at once, in a row or in a column on landscape phones. Use the arrows to shift the tray one piece at a time. Pieces slide together until three remain, then keep their positions for the rest of the tray. Arrows only show when you can move that way.

On landscape phones, **Pickup offset** and **Vertical drag offset** move pieces left toward the board. **Horizontal drag offset** moves them up or down.

Your current game, settings, and top score are saved in the browser memory. If you modify settings that change pieces or the board, your top score will show "modified"

Enable **Time Trial** in Settings to play against a configurable countdown. The timer starts when the first piece is placed.

## App hosts

An app that handles fullscreen can set this before the game's first head script runs:

```js
window.GenericBlockGameHost = {
  fullscreen: "native",
};
```

Native mode hides the web fullscreen button before it can paint and uses the fullscreen layout from startup. The host controls fullscreen and system bars; the game makes no browser fullscreen request in this mode. No Capacitor code is needed in the game. If the config is absent or uses `fullscreen: "browser"`, the web button keeps its current action.

For app backup and score events, see [the app profile interface](docs/app-profile.md).

## VS AI

Choose **VS AI** under **Hex** in Settings, then pick **Easy**, **Medium**, or **Hard**. Easy is the default. You and the computer share a board and take turns using a full tray or passing; the higher score wins when both pass in a row.

## 2 Player

You and a friend take turns placing a set of pieces. When both players pass in a row the game ends.
