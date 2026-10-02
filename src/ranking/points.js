import { inMatch, inT1, getResult } from "../utils/match.js";
import { calculateWilsonScoreLowerBound } from "./wilson.js";
import { WILSON_Z } from "../constants.js";

export function countLeaderboardPointWinsFromSrc(src, name) {
  var wins21 = 0, wins11 = 0;
  src.forEach(function(s) {
    if (!inMatch(s, name)) return;
    if (getResult(s, name) !== "W") return;
    var gamesWon = inT1(s, name) ? Number(s.t1wins) : Number(s.t2wins);
    if ((s.gameType || "21") === "11") wins11 += gamesWon;
    else wins21 += gamesWon;
  });
  return { wins21: wins21, wins11: wins11 };
}

export function calculateLeaderboardPoints(wins21, wins11) {
  return (wins21 * 2) + (wins11 * 1);
}

export function calculateLeaderboardPointsForPlayer(src, name) {
  var counts = countLeaderboardPointWinsFromSrc(src, name);
  return calculateLeaderboardPoints(counts.wins21, counts.wins11);
}

export function applyPlayerLeaderboardPoints(pl, src) {
  var counts = countLeaderboardPointWinsFromSrc(src, pl.name);
  pl.pointsWins21 = counts.wins21;
  pl.pointsWins11 = counts.wins11;
  pl.leaderboardPoints = calculateLeaderboardPoints(counts.wins21, counts.wins11);
}

export function getPointsBasedRankingScore(pl) {
  return typeof pl.leaderboardPoints === "number" ? pl.leaderboardPoints : 0;
}

export function getLeaderboardSortMetricsFromStats(won, lost, points) {
  return {
    points: typeof points === "number" ? points : 0,
    winRate: (won + lost) ? won / (won + lost) : 0,
    zFactor: calculateWilsonScoreLowerBound(won, lost, WILSON_Z)
  };
}

export function getLeaderboardSortMetrics(pl) {
  return getLeaderboardSortMetricsFromStats(pl.won, pl.lost, getPointsBasedRankingScore(pl));
}

export function compareLeaderboardSortMetrics(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.winRate !== a.winRate) return b.winRate - a.winRate;
  if (b.zFactor !== a.zFactor) return b.zFactor - a.zFactor;
  return 0;
}
