import { MONTHS } from "../constants.js";

export function H(id, html) {
  document.getElementById(id).innerHTML = html;
}

export function emptyHTML(msg) {
  return '<div class="empty"><div class="empty-icon">🏸</div><p>' + (msg || "No matches yet!") + "</p></div>";
}

export function escAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function fmtDate(d) {
  if (!d) return "Unknown";
  var p = d.split("-");
  if (p.length === 3) return p[2] + " " + MONTHS[parseInt(p[1], 10) - 1] + " " + p[0];
  return d;
}

export function scrollPageToTop() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
