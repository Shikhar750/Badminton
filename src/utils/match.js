export function wt(s) {
  return s.gameType === "11" ? 0.5 : 1;
}

export function gtBadge(s) {
  return '<span class="gt-badge">' + (s.gameType === "11" ? "11pt" : "21pt") + "</span>";
}

export function inT1(s, n) {
  return [s.t1p1, s.t1p2].indexOf(n) > -1;
}

export function inMatch(s, n) {
  return [s.t1p1, s.t1p2, s.t2p1, s.t2p2].indexOf(n) > -1;
}

export function getResult(s, n) {
  var a = inT1(s, n);
  var t1 = Number(s.t1wins);
  var t2 = Number(s.t2wins);
  if (a) return t1 > t2 ? "W" : t1 < t2 ? "L" : "D";
  return t2 > t1 ? "W" : t2 < t1 ? "L" : "D";
}

export function getPairResult(s, pairName) {
  var t1 = [s.t1p1, s.t1p2].filter(function(n) { return n && n !== "undefined" && n !== ""; }).sort().join(" & ");
  var isT1 = t1 === pairName;
  var t1w = Number(s.t1wins), t2w = Number(s.t2wins);
  if (isT1) return t1w > t2w ? "W" : t1w < t2w ? "L" : "D";
  return t2w > t1w ? "W" : t2w < t1w ? "L" : "D";
}
