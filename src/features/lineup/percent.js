import { inMatch, getResult } from "../../utils/match.js";
import { escAttr } from "../../utils/dom.js";

export function getLineupDisplayWinRate(name, sessions) {
  var m = sessions.filter(function(s) { return inMatch(s, name); });
  var won = 0, lost = 0;
  m.forEach(function(s) {
    var result = getResult(s, name);
    if (result === "W") won++;
    else if (result === "L") lost++;
  });
  return won + lost ? (won / (won + lost)) * 100 : 50;
}

export function getLineupTeamStrength(team, sessions) {
  if (!team || !team.length) return 50;
  var sum = 0;
  team.forEach(function(p) { sum += getLineupDisplayWinRate(p, sessions); });
  return sum / team.length;
}

export function getLineupMatchupPercents(team1, team2, sessions) {
  var s1 = getLineupTeamStrength(team1, sessions);
  var s2 = getLineupTeamStrength(team2, sessions);
  var total = s1 + s2;
  if (!total) return [50, 50];
  var p1 = Math.round((s1 / total) * 100);
  return [p1, 100 - p1];
}

export function buildLineupMatchupCardHTML(team1, team2, sessions) {
  var pcts = getLineupMatchupPercents(team1, team2, sessions);
  var label1 = team1.join(" & ");
  var label2 = team2.join(" & ");
  return '<div class="lineup-matchup-card">' +
    '<div class="lineup-matchup-row">' +
      '<span class="lineup-matchup-team">' + escAttr(label1) + '</span>' +
      '<span class="lineup-matchup-pct">' + pcts[0] + '%</span>' +
      '<span class="lineup-matchup-vs">vs</span>' +
      '<span class="lineup-matchup-pct">' + pcts[1] + '%</span>' +
      '<span class="lineup-matchup-team right">' + escAttr(label2) + '</span>' +
    '</div>' +
    '<div class="lineup-matchup-bar"><div class="lineup-matchup-bar-fill" style="width:' + pcts[0] + '%"></div></div>' +
  '</div>';
}
