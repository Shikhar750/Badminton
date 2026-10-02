import { WILSON_Z } from "../constants.js";

export function calculateWilsonScoreLowerBound(wins, losses, z) {
  z = z == null ? WILSON_Z : z;
  var n = wins + losses;
  if (n <= 0) return 0;
  var p = wins / n;
  var z2 = z * z;
  var denominator = 1 + z2 / n;
  var center = p + z2 / (2 * n);
  var margin = z * Math.sqrt((p * (1 - p) / n) + (z2 / (4 * n * n)));
  var lower = (center - margin) / denominator;
  if (lower < 0) lower = 0;
  if (lower > 1) lower = 1;
  return lower * 100;
}

export function calculateAttendanceAdjustedWilsonScore(wins, losses, daysPlayed, totalMatchDays) {
  var wilsonPerformance = calculateWilsonScoreLowerBound(wins, losses, WILSON_Z);
  var attendanceRatio = 1;
  if (totalMatchDays > 0) {
    attendanceRatio = daysPlayed / totalMatchDays;
    if (attendanceRatio < 0) attendanceRatio = 0;
    if (attendanceRatio > 1) attendanceRatio = 1;
  }
  var attendancePenalty = (1 - attendanceRatio) * 10;
  return wilsonPerformance - attendancePenalty;
}

export function formatAttendanceAdjustedWilsonDisplay(score) {
  if (typeof score !== "number" || isNaN(score)) return "0.0";
  return (Math.round(score * 10) / 10).toFixed(1);
}

export function formatMeritCalcValue(n, decimals) {
  if (typeof n !== "number" || isNaN(n)) n = 0;
  return (Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals)).toFixed(decimals);
}
