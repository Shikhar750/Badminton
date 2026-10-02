var PARTIALS = {
  header: "../shell/header.html",
  nav: "../shell/nav.html",
  identity: "../features/identity/identity.html",
  leaderboard: "../features/leaderboard/leaderboard.html",
  history: "../features/history/history.html",
  add: "../features/add/add.html",
  lineup: "../features/lineup/lineup.html",
  player: "../features/player/player.html",
  h2h: "../features/h2h/h2h.html",
  pair: "../features/pair/pair.html",
  rules: "../features/rules/rules.html",
  winners: "../features/winners/winners.html"
};

async function fetchPartial(name) {
  var rel = PARTIALS[name];
  if (!rel) throw new Error("Unknown partial: " + name);
  var url = new URL(rel, import.meta.url);
  var res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load partial " + name + " (" + res.status + ")");
  return await res.text();
}

function replaceSlot(slot, html) {
  var tmp = document.createElement("div");
  tmp.innerHTML = html.trim();
  var parent = slot.parentNode;
  while (tmp.firstChild) {
    parent.insertBefore(tmp.firstChild, slot);
  }
  parent.removeChild(slot);
}

export async function loadPartials(root) {
  root = root || document;
  var slots = Array.from(root.querySelectorAll("[data-partial]"));
  if (!slots.length) return;

  await Promise.all(slots.map(async function(slot) {
    var name = slot.getAttribute("data-partial");
    var html = await fetchPartial(name);
    replaceSlot(slot, html);
  }));

  // Nested partials (e.g. identity inside header, lineup inside add)
  await loadPartials(root);
}
