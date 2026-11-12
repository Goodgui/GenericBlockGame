# App profile interface

`profile.js` gives app hosts a versioned interface without Google or Capacitor
code in the game. Existing browser storage keys stay the same.

## Profile methods

After game startup, use `window.GenericBlockGame.profile`:

```js
const profile = window.GenericBlockGame.profile;
const backup = profile.export();
profile.validate(backup);
profile.restore(backup);
const unsubscribe = profile.subscribe(event => {
  if (event.type === "profile-changed") { /* Offer to save a backup. */ }
  if (event.type === "run-finished") { /* Check event.run before sending. */ }
});
```

`version` is 1. Export and validation return new objects. Invalid data throws
before restore writes any values. Restore uses saved settings and the higher
personal best in each category. It rolls profile writes back if a write fails.
It preserves unfinished game saves and the local seen-changelog version. The
controller refreshes the live game and settings after restore.

The profile has only these fields:

- `version: 1`
- `settings.boardMode`: `hex` or `square`
- `settings.global`: slow mode, three drag offsets, and piece hue
- `settings.hex` and `settings.square`: the board's settings, built-in piece
  choices and weights, custom pieces, and settings format versions
- `bests.hex` and `bests.square`: `solo`, `modifiedSolo`, `timeTrial`, and
  `modifiedTimeTrial`, each a nonnegative whole number

Boards, trays, timers, Undo history, runs, accounts, and submission queues do not
belong to a profile. Custom piece cells are settings, so they do belong to it.
Validation rejects unsupported versions, missing or unknown fields, out-of-range
values, invalid game modes, and malformed pieces.

## Events and runs

The game emits `profile-changed` after settings or bests change. Restore emits
`profile-restored`, then `profile-changed`. The game controller handles its own
live refresh. Subscribe after startup and call `export()` for initial data.

Before game startup, a host can supply an opaque player context:

```js
window.GenericBlockGameHost = {
  fullscreen: "native",
  getScoreContext: () => currentPlayerContext,
  onEvent: event => pendingHostEvents.push(event),
};
```

The optional `onEvent` callback receives events during startup too. A resumed
Time Trial can end before a host subscribes. Queue such events in the host, then
remove the callback when switching to `profile.subscribe` to avoid handling each
event twice.

The game stores that context when it creates a run. It never replaces it when
the host changes players. A host must require a matching player before sending
a score and keep offline retries bound to that same player.

`run-finished` carries `event.run` with `version`, `id`, `board`, `mode`,
`rulesVersion`, `match`, `defaultRules`, `context`, `score`, and `finishedScore`.
Current values use version 1 and scoring rules version 2. Board is `hex` or
`square`; mode is `solo` or `time-trial`; match is `solo`, `ai`, or `two-player`.

Only solo matches with `defaultRules: true` qualify for public boards. The game
uses its own default preference checks, including the default Time Trial length.
Eligibility cannot return after a run uses modified rules. Accessibility controls
keep the game's existing score rules. Hosts must also check the event version,
rules version, player context, board, mode, and a positive safe whole score.

The game emits a score when play becomes blocked or Time Trial ends. It does not
emit a restored best as a completed score. Reopening an ended save does not replay
the event. Undo can resume a blocked run; a later higher finished score can emit
again under the same run ID. Hosts must make retries safe and keep higher scores.

Existing unfinished saves without a run record cannot submit scores. They still
play, save, and back up settings and bests. Starting a fresh game creates a new
run record. This record stays in the local game save and never enters a profile.
