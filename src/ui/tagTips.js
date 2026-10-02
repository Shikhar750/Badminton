var tagTipBound = false;

function resetTagPopPosition(chip) {
  var pop = chip && chip.querySelector(".tag-pop");
  if (!pop) return;
  pop.style.position = "";
  pop.style.left = "";
  pop.style.top = "";
  pop.style.right = "";
  pop.style.bottom = "";
  pop.style.transform = "";
  pop.style.maxWidth = "";
  pop.style.display = "";
  pop.style.visibility = "";
}

function positionTagPop(chip) {
  var pop = chip.querySelector(".tag-pop");
  if (!pop) return;
  var margin = 8;
  var gap = 6;
  pop.style.display = "block";
  pop.style.visibility = "hidden";
  var chipRect = chip.getBoundingClientRect();
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  pop.style.maxWidth = Math.min(240, vw - margin * 2) + "px";
  var popRect = pop.getBoundingClientRect();
  pop.style.display = "";
  pop.style.visibility = "";

  var left = chipRect.left + chipRect.width / 2 - popRect.width / 2;
  left = Math.max(margin, Math.min(left, vw - margin - popRect.width));

  var top = chipRect.bottom + gap;
  if (top + popRect.height > vh - margin) {
    top = chipRect.top - gap - popRect.height;
  }
  top = Math.max(margin, Math.min(top, vh - margin - popRect.height));

  pop.style.position = "fixed";
  pop.style.left = left + "px";
  pop.style.top = top + "px";
  pop.style.transform = "none";
}

export function closeAllTagTips() {
  var root = document.getElementById("tab-player");
  if (!root) return;
  root.querySelectorAll(".tag-tip").forEach(function(el) {
    el.classList.remove("open");
    el.setAttribute("aria-expanded", "false");
    resetTagPopPosition(el);
  });
}

function openTagTip(chip) {
  closeAllTagTips();
  chip.classList.add("open");
  chip.setAttribute("aria-expanded", "true");
  positionTagPop(chip);
}

function toggleTagTip(chip) {
  var wasOpen = chip.classList.contains("open");
  closeAllTagTips();
  if (!wasOpen) openTagTip(chip);
}

export function bindTagTips() {
  if (tagTipBound) return;
  tagTipBound = true;
  var root = document.getElementById("tab-player");
  if (!root) return;

  root.addEventListener("click", function(e) {
    var chip = e.target.closest(".tag-tip");
    if (!chip || !root.contains(chip)) return;
    e.stopPropagation();
    toggleTagTip(chip);
  });

  document.addEventListener("click", function(e) {
    if (e.target.closest("#tab-player .tag-tip")) return;
    closeAllTagTips();
  });

  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") closeAllTagTips();
  });

  window.addEventListener("resize", function() {
    root.querySelectorAll(".tag-tip.open, .tag-tip:hover").forEach(function(chip) { positionTagPop(chip); });
  });

  root.addEventListener("mouseover", function(e) {
    if (!window.matchMedia("(hover: hover)").matches) return;
    var chip = e.target.closest(".tag-tip");
    if (!chip || !root.contains(chip)) return;
    positionTagPop(chip);
  });

  root.addEventListener("mouseout", function(e) {
    if (!window.matchMedia("(hover: hover)").matches) return;
    var chip = e.target.closest(".tag-tip");
    if (!chip || !root.contains(chip) || chip.classList.contains("open")) return;
    var next = e.relatedTarget;
    if (next && chip.contains(next)) return;
    resetTagPopPosition(chip);
  });
}
