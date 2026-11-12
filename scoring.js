(function () {
// A move without a clear resets the streak. Each cleared zone scores its cells.
function scorePlacement(previousStreak, completed) {
  const streak = completed.zoneCount ? previousStreak + 1 : 0;
  return { streak, points: completed.pointValue * completed.zoneCount * streak };
}

window.GenericBlockGame.scorePlacement = scorePlacement;
}());
