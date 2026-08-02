import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, remove, update, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

var app = initializeApp({ databaseURL: "https://badminton-7ef03-default-rtdb.asia-southeast1.firebasedatabase.app" });
var db = getDatabase(app);
var matchesRef = ref(db, "matches");
var squadRef = ref(db, "squad");
var adjustmentsRef = ref(db, "monthlyAdjustments");
var monthOverridesRef = ref(db, "settings/monthOverrides");
var weeklyPatternRef = ref(db, "settings/weeklyMatchDays");
var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

var ADMIN_PIN = "7789";
var sessions = [];
var squadPlayers = [];
var dateFilter = "all";
var resultFilter = "all";
var editingKey = null;
var t1Selected = [];
var t2Selected = [];
var gameType = "21";
var currentPlayer = null;
var historyPage = 0;
var PAGE_SIZE = 10;
var allHistoryLoaded = false;
var adminUnlocked = false;
var sessionsLoaded = false;
var adjustmentsLoaded = false;
var leaderboardPeriod = "month";
var leaderboardFilterLabel = "This Month";
var customMonthValue = "";
var customDateValue = "";
var monthlyAdjustments = {};
var monthOverrides = {};
var weeklyPattern = [];

function isLocked(s) {
  if (!s.date) return false;
  var matchDate = new Date(s.date);
  var lockTime = new Date(matchDate);
  lockTime.setDate(lockTime.getDate() + 1);
  lockTime.setHours(1, 0, 0, 0);
  return new Date() > lockTime;
}

function checkAdmin() {
  if (adminUnlocked) return true;
  var pin = prompt("Enter admin PIN:");
  if (pin === ADMIN_PIN) { adminUnlocked = true; return true; }
  alert("Wrong PIN!");
  return false;
}

document.getElementById("inp-date").value = getTodayString();

function showTab(name) {
  ["leaderboard","history","add","player","h2h","rules","winners","pair"].forEach(function(t) {
    document.getElementById("tab-"+t).classList.remove("active");
    var n = document.getElementById("nav-"+t);
    if (n) n.classList.remove("active");
  });
  document.getElementById("tab-"+name).classList.add("active");
  var n = document.getElementById("nav-"+name);
  if (n) n.classList.add("active");
}

document.getElementById("nav-leaderboard").addEventListener("click", function(){ showTab("leaderboard"); });
document.getElementById("nav-history").addEventListener("click", function(){ showTab("history"); });
document.getElementById("nav-add").addEventListener("click", function(){ resetForm(); showTab("add"); renderLineupChips(); });
document.getElementById("nav-rules").addEventListener("click", function(){ showTab("rules"); });
document.getElementById("refresh-btn").addEventListener("click", renderAll);
function formatFilterLabel(label) {
  if (!label) return "Filter";
  if (label.indexOf("Custom Date • ") === 0) {
    var dateValue = label.replace("Custom Date • ", "");
    var d = new Date(dateValue);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }
  }
  if (label.indexOf("Custom Month • ") === 0) {
    var monthValue = label.replace("Custom Month • ", "");
    var monthParts = monthValue.split("-");
    if (monthParts.length === 2) {
      var monthDate = new Date(parseInt(monthParts[0], 10), parseInt(monthParts[1], 10) - 1, 1);
      return monthDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    }
  }
  return label;
}
function setLeaderboardPeriod(period, label) {
  leaderboardPeriod = period;
  leaderboardFilterLabel = label || (period === "month" ? "This Month" : period === "alltime" ? "All Time" : period === "4player" ? "4-Player" : period === "customMonth" ? "Custom Month" : "Custom Date");
  var trigger = document.getElementById("filter-trigger");
  trigger.innerHTML = '<span class="filter-prefix">Filter •</span> <span class="filter-value">' + formatFilterLabel(leaderboardFilterLabel) + '</span>';
  document.querySelectorAll(".filter-option").forEach(function(btn){ btn.classList.toggle("active", btn.getAttribute("data-filter") === period); });
  renderLeaderboard();
}
function toggleFilterDropdown() {
  var dropdown = document.getElementById("filter-dropdown");
  dropdown.classList.toggle("open");
}
function populateFilterPickers() {
  var monthYear = document.getElementById("custom-month-year");
  var monthMonth = document.getElementById("custom-month-month");
  var dateDay = document.getElementById("custom-date-day");
  var dateMonth = document.getElementById("custom-date-month");
  var dateYear = document.getElementById("custom-date-year");
  var now = new Date();
  var currentYear = now.getFullYear();
  var currentMonth = now.getMonth() + 1;
  var currentDay = now.getDate();

  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var yearStart = currentYear - 3;
  var yearEnd = currentYear + 3;

  function fillSelect(el, values, selectedValue) {
    el.innerHTML = values.map(function(v){ var label = v.label || v; var value = v.value || v; return '<option value="'+value+'">'+label+'</option>'; }).join("");
    if (selectedValue) el.value = selectedValue;
  }

  var monthYears = [];
  for (var y = yearStart; y <= yearEnd; y++) monthYears.push({ label: y, value: String(y) });
  fillSelect(monthYear, monthYears, customMonthValue ? customMonthValue.split("-")[0] : String(currentYear));

  var monthValues = months.map(function(m, idx){ return { label: m, value: String(idx + 1).padStart(2, "0") }; });
  fillSelect(monthMonth, monthValues, customMonthValue ? customMonthValue.split("-")[1] : String(currentMonth).padStart(2, "0"));

  var days = [];
  for (var d = 1; d <= 31; d++) days.push({ label: d, value: String(d).padStart(2, "0") });
  fillSelect(dateDay, days, customDateValue ? customDateValue.split("-")[2] : String(currentDay).padStart(2, "0"));
  fillSelect(dateMonth, monthValues, customDateValue ? customDateValue.split("-")[1] : String(currentMonth).padStart(2, "0"));
  fillSelect(dateYear, monthYears, customDateValue ? customDateValue.split("-")[0] : String(currentYear));
}
function updateFilterPickerVisibility() {
  var activeMode = document.querySelector(".filter-option.active");
  var mode = activeMode ? activeMode.getAttribute("data-filter") : "month";
  var dropdown = document.getElementById("filter-dropdown");
  var inputs = dropdown.querySelector(".filter-inputs");
  dropdown.classList.toggle("has-custom", mode === "customMonth" || mode === "customDate");
  document.getElementById("filter-picker-month").classList.toggle("active", mode === "customMonth");
  document.getElementById("filter-picker-date").classList.toggle("active", mode === "customDate");
  inputs.classList.toggle("open", mode === "customMonth" || mode === "customDate");
}
function resetFilterUI() {
  var dropdown = document.getElementById("filter-dropdown");
  var inputs = dropdown.querySelector(".filter-inputs");
  dropdown.classList.remove("open");
  dropdown.classList.remove("has-custom");
  inputs.classList.remove("open");
  document.getElementById("filter-picker-month").classList.remove("active");
  document.getElementById("filter-picker-date").classList.remove("active");
}
function getSelectedCustomMonthValue() {
  var year = document.getElementById("custom-month-year").value;
  var month = document.getElementById("custom-month-month").value;
  return year + "-" + month;
}
function getSelectedCustomDateValue() {
  var year = document.getElementById("custom-date-year").value;
  var month = document.getElementById("custom-date-month").value;
  var day = document.getElementById("custom-date-day").value;
  return year + "-" + month + "-" + day;
}
function applyLeaderboardFilter() {
  var selected = document.querySelector(".filter-option.active");
  if (!selected) return;
  var mode = selected.getAttribute("data-filter");
  if (mode === "customMonth") {
    customMonthValue = getSelectedCustomMonthValue();
    if (!customMonthValue) {
      alert("Please choose a month first.");
      return;
    }
    setLeaderboardPeriod("customMonth", "Custom Month • " + customMonthValue);
  } else if (mode === "customDate") {
    customDateValue = getSelectedCustomDateValue();
    if (!customDateValue) {
      alert("Please choose a date first.");
      return;
    }
    setLeaderboardPeriod("customDate", "Custom Date • " + customDateValue);
  } else {
    setLeaderboardPeriod(mode, selected.textContent.trim());
  }
  document.getElementById("filter-dropdown").classList.remove("open");
}
populateFilterPickers();
updateFilterPickerVisibility();
document.getElementById("filter-trigger").addEventListener("click", function(e){
  e.stopPropagation();
  var dropdown = document.getElementById("filter-dropdown");
  var isOpen = dropdown.classList.contains("open");
  if (isOpen) {
    dropdown.classList.remove("open");
  } else {
    populateFilterPickers();
    dropdown.classList.add("open");
    updateFilterPickerVisibility();
  }
});
document.querySelectorAll(".filter-option").forEach(function(btn){
  btn.addEventListener("click", function(e){
    e.stopPropagation();
    document.querySelectorAll(".filter-option").forEach(function(opt){ opt.classList.remove("active"); });
    this.classList.add("active");
    updateFilterPickerVisibility();
    if (this.getAttribute("data-filter") !== "customMonth" && this.getAttribute("data-filter") !== "customDate") {
      applyLeaderboardFilter();
    }
  });
});
document.getElementById("filter-apply").addEventListener("click", function(e){ e.stopPropagation(); applyLeaderboardFilter(); });
document.addEventListener("click", function(e){ if (!e.target.closest(".leaderboard-filter-wrap")) resetFilterUI(); });
document.getElementById("sub-individual").addEventListener("click", function(){ this.classList.add("active"); document.getElementById("sub-pairs").classList.remove("active"); document.getElementById("lb-individual").style.display="block"; document.getElementById("lb-pairs").style.display="none"; });
document.getElementById("sub-pairs").addEventListener("click", function(){ this.classList.add("active"); document.getElementById("sub-individual").classList.remove("active"); document.getElementById("lb-pairs").style.display="block"; document.getElementById("lb-individual").style.display="none"; });
document.getElementById("save-btn").addEventListener("click", handleSave);
document.getElementById("cancel-btn").addEventListener("click", function(){ resetForm(); showTab("history"); });
document.getElementById("add-player-btn").addEventListener("click", addNewPlayer);
document.getElementById("new-player-input").addEventListener("keydown", function(e){ if(e.key==="Enter") addNewPlayer(); });
document.getElementById("btn-21").addEventListener("click", function(){ gameType="21"; this.classList.add("active"); document.getElementById("btn-11").classList.remove("active"); });
document.getElementById("btn-11").addEventListener("click", function(){ gameType="11"; this.classList.add("active"); document.getElementById("btn-21").classList.remove("active"); });
document.getElementById("back-from-player").addEventListener("click", function(){ showTab("leaderboard"); });
document.getElementById("back-from-h2h").addEventListener("click", function(){ showPlayerStats(currentPlayer); });
document.getElementById("back-from-pair").addEventListener("click", function(){ showTab("leaderboard"); });
document.getElementById("champion-banner").addEventListener("click", function(){ renderMonthlyWinners(); showTab("winners"); });
document.getElementById("back-from-winners").addEventListener("click", function(){ showTab("leaderboard"); });

document.getElementById("lineup-toggle").addEventListener("click", function(){
  document.getElementById("lineup-collapse-body").classList.toggle("open");
  document.getElementById("lineup-chevron").classList.toggle("open");
});
document.getElementById("squad-toggle").addEventListener("click", function(){
  document.getElementById("squad-collapse-body").classList.toggle("open");
  document.getElementById("squad-chevron").classList.toggle("open");
});
document.getElementById("admin-toggle").addEventListener("click", function(){
  document.getElementById("admin-collapse-body").classList.toggle("open");
  document.getElementById("admin-chevron").classList.toggle("open");
  populateAdjPlayerDropdown();
  populateOverridePanel();
  populateWeeklyPatternPanel();
});

document.querySelectorAll("[data-date]").forEach(function(el) {
  el.addEventListener("click", function() {
    dateFilter = this.getAttribute("data-date");
    document.querySelectorAll("[data-date]").forEach(function(e){ e.classList.remove("active"); });
    this.classList.add("active");
    historyPage = 0; renderHistory();
  });
});

document.querySelectorAll("[data-result]").forEach(function(el) {
  el.addEventListener("click", function() {
    resultFilter = this.getAttribute("data-result");
    document.querySelectorAll("[data-result]").forEach(function(e){ e.classList.remove("active"); });
    this.classList.add("active");
    historyPage = 0; renderHistory();
  });
});

var sentinel = document.getElementById("history-sentinel");
var observer = new IntersectionObserver(function(entries) {
  if (entries[0].isIntersecting && !allHistoryLoaded) {
    historyPage++;
    appendHistory();
  }
}, { threshold: 0.1 });
observer.observe(sentinel);

onValue(squadRef, function(snap) {
  var d = snap.val();
  squadPlayers = d ? (Array.isArray(d) ? d : Object.values(d)) : [];
  renderChips(); renderSquadTags();
});
onValue(matchesRef, function(snap) {
  var d = snap.val();
  sessions = [];
  if (d) { Object.keys(d).forEach(function(k){ var s=d[k]; s.firebaseKey=k; sessions.push(s); }); }
  sessions.sort(function(a,b){ return b.id-a.id; });
  historyPage = 0;
  sessionsLoaded = true;
  renderAll();
  populateMatchDayBanner();
  runAutoBrownieAssignment();
});
onValue(adjustmentsRef, function(snap) {
  monthlyAdjustments = snap.val() || {};
  adjustmentsLoaded = true;
  renderLeaderboard();
  populateChampionBanner();
  runAutoBrownieAssignment();
});
onValue(monthOverridesRef, function(snap) {
  monthOverrides = snap.val() || {};
  renderLeaderboard();
});
onValue(weeklyPatternRef, function(snap) {
  weeklyPattern = snap.val() || [];
  populateMatchDayBanner();
});

function fmtDate(d) { if(!d) return "Unknown"; var p=d.split("-"); if(p.length===3) return p[2]+" "+MONTHS[parseInt(p[1])-1]+" "+p[0]; return d; }
function H(id,html) { document.getElementById(id).innerHTML=html; }
function emptyHTML(msg) { return '<div class="empty"><div class="empty-icon">🏸</div><p>'+(msg||"No matches yet!")+'</p></div>'; }
function renderAll() { renderLeaderboard(); historyPage=0; renderHistory(); }
function wt(s) { return s.gameType==="11"?0.5:1; }
function gtBadge(s) { return '<span class="gt-badge">'+(s.gameType==="11"?"11pt":"21pt")+'</span>'; }
function inT1(s,n) { return [s.t1p1,s.t1p2].indexOf(n)>-1; }
function inMatch(s,n) { return [s.t1p1,s.t1p2,s.t2p1,s.t2p2].indexOf(n)>-1; }
function getResult(s,n) { var a=inT1(s,n),t1=Number(s.t1wins),t2=Number(s.t2wins); if(a) return t1>t2?"W":t1<t2?"L":"D"; return t2>t1?"W":t2<t1?"L":"D"; }
function playerMatches(n) { return getSessionsForPeriod().filter(function(s){ return inMatch(s,n); }).sort(function(a,b){ return a.id-b.id; }); }

function getDateNDaysAgoString(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,"0");
  var day = String(d.getDate()).padStart(2,"0");
  return y + "-" + m + "-" + day;
}
function isInDateRange(s) {
  if (dateFilter==="all") return true;
  if (!s.date) return false;
  if (dateFilter==="week") {
    var weekAgoStr = getDateNDaysAgoString(7);
    return s.date >= weekAgoStr;
  }
  if (dateFilter==="month") {
    var now = new Date();
    var nowMonthStr = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
    var matchMonthStr = s.date.substring(0,7);
    return matchMonthStr === nowMonthStr;
  }
  return true;
}
function isResultMatch(s) {
  if (resultFilter==="all") return true;
  if (resultFilter==="win") return Number(s.t1wins)>Number(s.t2wins);
  if (resultFilter==="loss") return Number(s.t1wins)<Number(s.t2wins);
  return true;
}
function getFiltered() {
  return sessions.filter(function(s){ return isInDateRange(s)&&isResultMatch(s); });
}

function renderSquadTags() {
  var el=document.getElementById("squad-tags");
  if(!squadPlayers.length){el.innerHTML='<div style="color:var(--text-dim);font-size:12px;margin-bottom:8px">No players yet</div>';return;}
  el.innerHTML=squadPlayers.map(function(p){return '<span class="squad-tag">'+p+'<button class="squad-del" data-name="'+p+'">✕</button></span>';}).join("");
  el.querySelectorAll(".squad-del").forEach(function(btn){btn.addEventListener("click",function(){var n=this.getAttribute("data-name"),ns=squadPlayers.filter(function(p){return p!==n;});set(squadRef,ns.length?ns:null);});});
}
async function addNewPlayer() {
  var inp=document.getElementById("new-player-input"),n=inp.value.trim();
  if(!n||squadPlayers.indexOf(n)>-1){inp.value="";return;}
  await set(squadRef,squadPlayers.concat([n]));inp.value="";
}

function populateAdjPlayerDropdown() {
  var sel = document.getElementById("adj-player");
  var monthKey = getCurrentMonthKey();
  document.getElementById("adj-month-label").textContent = monthKey;
  sel.innerHTML = squadPlayers.map(function(p){ return '<option value="'+p+'">'+p+'</option>'; }).join("");
}

function populateOverridePanel() {
  var monthKey = getCurrentMonthKey();
  document.getElementById("override-month-label").value = monthKey;
  var existing = monthOverrides[monthKey];
  var statusEl = document.getElementById("override-current-status");
  if (existing) {
    statusEl.textContent = "Currently overridden: only counting matches from " + existing + " onward for This Month";
    document.getElementById("override-date-input").value = existing;
  } else {
    statusEl.textContent = "No override currently set for this month";
    document.getElementById("override-date-input").value = "";
  }
}

document.getElementById("override-set-btn").addEventListener("click", async function() {
  var errEl = document.getElementById("override-err");
  var sucEl = document.getElementById("override-suc");
  errEl.style.display="none"; sucEl.style.display="none";

  var dateVal = document.getElementById("override-date-input").value;
  if (!dateVal) { errEl.textContent="Please pick a start date!"; errEl.style.display="block"; return; }

  if (!checkAdmin()) return;

  var monthKey = getCurrentMonthKey();
  try {
    await update(monthOverridesRef, { [monthKey]: dateVal });
    sucEl.textContent = "✓ " + monthKey + " will now only count matches from " + dateVal + " onward";
    sucEl.style.display = "block";
    populateOverridePanel();
  } catch(e) {
    errEl.textContent = "Failed: " + e.message;
    errEl.style.display = "block";
  }
});

document.getElementById("override-clear-btn").addEventListener("click", async function() {
  var errEl = document.getElementById("override-err");
  var sucEl = document.getElementById("override-suc");
  errEl.style.display="none"; sucEl.style.display="none";

  if (!checkAdmin()) return;

  var monthKey = getCurrentMonthKey();
  try {
    await remove(ref(db, "settings/monthOverrides/" + monthKey));
    sucEl.textContent = "✓ Override cleared for " + monthKey + " — full calendar month now counts again";
    sucEl.style.display = "block";
    populateOverridePanel();
  } catch(e) {
    errEl.textContent = "Failed: " + e.message;
    errEl.style.display = "block";
  }
});

var weeklyPatternSelected = [];
var ALL_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
function renderWeeklyPatternChips() {
  var el = document.getElementById("weekly-pattern-chips");
  el.innerHTML = ALL_DAYS.map(function(d) {
    var sel = weeklyPatternSelected.indexOf(d) > -1;
    return '<button class="chip'+(sel?" sel-t1":"")+'" data-day="'+d+'">'+d.substring(0,3)+'</button>';
  }).join("");
  el.querySelectorAll(".chip").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var day = this.getAttribute("data-day");
      var idx = weeklyPatternSelected.indexOf(day);
      if (idx > -1) weeklyPatternSelected.splice(idx, 1);
      else weeklyPatternSelected.push(day);
      renderWeeklyPatternChips();
    });
  });
}
function populateWeeklyPatternPanel() {
  weeklyPatternSelected = weeklyPattern.slice();
  renderWeeklyPatternChips();
}
document.getElementById("weekly-save-btn").addEventListener("click", async function() {
  var errEl = document.getElementById("weekly-err");
  var sucEl = document.getElementById("weekly-suc");
  errEl.style.display="none"; sucEl.style.display="none";
  if (!checkAdmin()) return;
  try {
    await set(weeklyPatternRef, weeklyPatternSelected);
    sucEl.textContent = "✓ Weekly pattern saved: " + (weeklyPatternSelected.length ? weeklyPatternSelected.join(", ") : "no days selected");
    sucEl.style.display = "block";
    populateMatchDayBanner();
  } catch(e) {
    errEl.textContent = "Failed: " + e.message;
    errEl.style.display = "block";
  }
});

document.getElementById("adj-save-btn").addEventListener("click", async function() {
  var errEl = document.getElementById("adj-err");
  var sucEl = document.getElementById("adj-suc");
  errEl.style.display="none"; sucEl.style.display="none";

  var player = document.getElementById("adj-player").value;
  var brownieVal = document.getElementById("adj-brownie").value;
  var negativeVal = document.getElementById("adj-negative").value;
  var reason = document.getElementById("adj-reason").value.trim();
  var hideFromWinners = document.getElementById("adj-hide-winners").checked;

  if (!player) { errEl.textContent="Please select a player!"; errEl.style.display="block"; return; }
  if (brownieVal==="" && negativeVal==="") { errEl.textContent="Enter a brownie or negative value!"; errEl.style.display="block"; return; }
  if (negativeVal && parseFloat(negativeVal) < 0 && !reason) { errEl.textContent="Reason required for negative points!"; errEl.style.display="block"; return; }

  if (!checkAdmin()) return;

  var monthKey = getCurrentMonthKey();
  var path = "monthlyAdjustments/" + monthKey + "/" + player;
  var existing = (monthlyAdjustments[monthKey] && monthlyAdjustments[monthKey][player]) || {};
  var existingBrownie = Number(existing.brownie) || 0;
  var existingNegative = Number(existing.negative) || 0;
  var existingReasons = existing.negativeReasons || (existing.negativeReason ? [existing.negativeReason] : []);

  var addedBrownie = brownieVal ? parseFloat(brownieVal) : 0;
  var addedNegative = negativeVal ? parseFloat(negativeVal) : 0;

  var newReasons = existingReasons.slice();
  if (addedNegative < 0 && reason) newReasons.push(reason);

  var data = {
    brownie: existingBrownie + addedBrownie,
    negative: existingNegative + addedNegative,
    negativeReasons: newReasons,
    negativeReason: newReasons.join("; "),
    hiddenFromWinnersBoard: hideFromWinners
  };

  try {
    await update(ref(db, path), data);
    sucEl.textContent = "✓ Applied to " + player + " for " + monthKey + " (running total: brownie " + data.brownie.toFixed(2) + "%, negative " + data.negative.toFixed(2) + "%)";
    sucEl.style.display = "block";
    document.getElementById("adj-brownie").value = "";
    document.getElementById("adj-negative").value = "";
    document.getElementById("adj-reason").value = "";
    document.getElementById("adj-hide-winners").checked = false;
  } catch(e) {
    errEl.textContent = "Failed: " + e.message;
    errEl.style.display = "block";
  }
});

document.getElementById("adj-clear-btn").addEventListener("click", async function() {
  var errEl = document.getElementById("adj-err");
  var sucEl = document.getElementById("adj-suc");
  errEl.style.display="none"; sucEl.style.display="none";

  var player = document.getElementById("adj-player").value;
  if (!player) { errEl.textContent="Please select a player!"; errEl.style.display="block"; return; }

  if (!checkAdmin()) return;

  var monthKey = getCurrentMonthKey();
  var path = "monthlyAdjustments/" + monthKey + "/" + player;

  try {
    await remove(ref(db, path));
    sucEl.textContent = "✓ Cleared adjustment for " + player + " (" + monthKey + ")";
    sucEl.style.display = "block";
    document.getElementById("adj-brownie").value = "";
    document.getElementById("adj-negative").value = "";
    document.getElementById("adj-reason").value = "";
  } catch(e) {
    errEl.textContent = "Failed: " + e.message;
    errEl.style.display = "block";
  }
});

function renderChips() {
  if(!squadPlayers.length){var m='<div style="color:var(--text-dim);font-size:12px">Add players in Manage Squad below</div>';H("t1-chips",m);H("t2-chips",m);return;}
  function make(cid,team){
    var el=document.getElementById(cid);
    el.innerHTML=squadPlayers.map(function(p){var i1=t1Selected.indexOf(p)>-1,i2=t2Selected.indexOf(p)>-1;var cls="chip";if(team==="t1"&&i1)cls+=" sel-t1";else if(team==="t2"&&i2)cls+=" sel-t2";else if((team==="t1"&&i2)||(team==="t2"&&i1))cls+=" dis";return '<button class="'+cls+'" data-p="'+p+'" data-team="'+team+'">'+p+'</button>';}).join("");
    el.querySelectorAll(".chip:not(.dis)").forEach(function(btn){btn.addEventListener("click",function(){var p=this.getAttribute("data-p"),t=this.getAttribute("data-team"),arr=t==="t1"?t1Selected:t2Selected,idx=arr.indexOf(p);if(idx>-1)arr.splice(idx,1);else if(arr.length<2)arr.push(p);renderChips();});});
  }
  make("t1-chips","t1");make("t2-chips","t2");
  document.getElementById("t1-hint").textContent=t1Selected.length+" of 2 selected"+(t1Selected.length?": "+t1Selected.join(" & "):"");
  document.getElementById("t2-hint").textContent=t2Selected.length+" of 2 selected"+(t2Selected.length?": "+t2Selected.join(" & "):"");
}

function resetForm() {
  editingKey=null;t1Selected=[];t2Selected=[];gameType="21";
  document.getElementById("inp-date").value=getTodayString();
  document.getElementById("t1wins").value="";document.getElementById("t2wins").value="";
  document.getElementById("form-err").style.display="none";document.getElementById("form-suc").style.display="none";
  document.getElementById("save-btn").textContent="Save Match";document.getElementById("cancel-btn").style.display="none";
  document.getElementById("form-title").textContent="Add Doubles Match";
  document.getElementById("btn-21").classList.add("active");document.getElementById("btn-11").classList.remove("active");
  renderChips();
}
function startEdit(s) {
  editingKey=s.firebaseKey;gameType=s.gameType||"21";
  t1Selected=[s.t1p1,s.t1p2].filter(function(n){return n&&n!=="undefined";});
  t2Selected=[s.t2p1,s.t2p2].filter(function(n){return n&&n!=="undefined";});
  document.getElementById("inp-date").value=s.date;
  document.getElementById("t1wins").value=s.t1wins;document.getElementById("t2wins").value=s.t2wins;
  document.getElementById("save-btn").textContent="Update Match";document.getElementById("cancel-btn").style.display="block";
  document.getElementById("form-title").textContent="Edit Match";
  document.getElementById("btn-21").classList.toggle("active",gameType==="21");
  document.getElementById("btn-11").classList.toggle("active",gameType==="11");
  renderChips();showTab("add");
}
async function handleSave() {
  var date=document.getElementById("inp-date").value,t1w=document.getElementById("t1wins").value,t2w=document.getElementById("t2wins").value;
  var errEl=document.getElementById("form-err"),sucEl=document.getElementById("form-suc"),btn=document.getElementById("save-btn");
  errEl.style.display="none";sucEl.style.display="none";
  if(!date||t1w===""||t2w===""){errEl.textContent="Please fill in all fields!";errEl.style.display="block";return;}
  if(t1Selected.length!==2||t2Selected.length!==2){errEl.textContent="Please select 2 players for each team!";errEl.style.display="block";return;}
  if (!editingKey) {
    var chosenDate = new Date(date);
    var lockTime = new Date(chosenDate);
    lockTime.setDate(lockTime.getDate() + 1);
    lockTime.setHours(1, 0, 0, 0);
    if (new Date() > lockTime && !checkAdmin()) {
      errEl.textContent = "This date is locked (past 1am next day). Admin PIN required.";
      errEl.style.display = "block"; return;
    }
  }
  btn.disabled=true;btn.textContent=editingKey?"Updating...":"Saving...";
  var eid=editingKey?sessions.find(function(s){return s.firebaseKey===editingKey;}).id:Date.now();
  var data={id:eid,date:date,gameType:gameType,t1p1:t1Selected[0],t1p2:t1Selected[1],t2p1:t2Selected[0],t2p2:t2Selected[1],t1wins:parseInt(t1w),t2wins:parseInt(t2w)};
  try {
    if(editingKey){await update(ref(db,"matches/"+editingKey),data);sucEl.textContent="✓ Updated!";}
    else{await push(matchesRef,data);sucEl.textContent="✓ Saved!";}
    sucEl.style.display="block";resetForm();
    setTimeout(function(){sucEl.style.display="none";showTab("history");},1500);
  } catch(e){errEl.textContent="Failed: "+e.message;errEl.style.display="block";}
  btn.disabled=false;btn.textContent=editingKey?"Update Match":"Save Match";
}

setupDelegation();

function computeStreaks(n) {
  var m=playerMatches(n);if(!m.length)return null;
  var r=m.map(function(s){return getResult(s,n);}),last=r[r.length-1],streak=1;
  for(var i=r.length-2;i>=0;i--){if(r[i]===last)streak++;else break;}
  return {type:last,count:streak};
}
function computeBestStreak(n) {
  var m=playerMatches(n);if(!m.length)return 0;
  var r=m.map(function(s){return getResult(s,n);}),best=0,cur=0;
  r.forEach(function(x){if(x==="W"){cur++;best=Math.max(best,cur);}else{cur=0;}});return best;
}
function computeBestPartner(n) {
  var p={};
  getSessionsForPeriod().forEach(function(s){var a=inT1(s,n),b=[s.t2p1,s.t2p2].indexOf(n)>-1;if(!a&&!b)return;var t=a?[s.t1p1,s.t1p2]:[s.t2p1,s.t2p2],won=a?Number(s.t1wins)>Number(s.t2wins):Number(s.t2wins)>Number(s.t1wins);t.forEach(function(x){if(!x||x===n||x==="undefined")return;if(!p[x])p[x]={won:0,tot:0};p[x].tot++;if(won)p[x].won++;});});
  var best=null,br=-1;Object.keys(p).forEach(function(x){var r=p[x].tot?p[x].won/p[x].tot:0;if(r>br){br=r;best=x;}});return best;
}
function computeToughest(n) {
  var o={};
  getSessionsForPeriod().forEach(function(s){var a=inT1(s,n),b=[s.t2p1,s.t2p2].indexOf(n)>-1;if(!a&&!b)return;var t=a?[s.t2p1,s.t2p2]:[s.t1p1,s.t1p2],lost=a?Number(s.t1wins)<Number(s.t2wins):Number(s.t2wins)<Number(s.t1wins);t.forEach(function(x){if(!x||x==="undefined")return;if(!o[x])o[x]=0;if(lost)o[x]++;});});
  var best=null,m=-1;Object.keys(o).forEach(function(x){if(o[x]>m){m=o[x];best=x;}});return best;
}
function computeH2H(p1,p2) {
  var m=getSessionsForPeriod().filter(function(s){var t1=[s.t1p1,s.t1p2],t2=[s.t2p1,s.t2p2];return(t1.indexOf(p1)>-1&&t2.indexOf(p2)>-1)||(t1.indexOf(p2)>-1&&t2.indexOf(p1)>-1);}).sort(function(a,b){return a.id-b.id;});
  var p1w=0,p2w=0;m.forEach(function(s){if(inT1(s,p1)){p1w+=Number(s.t1wins);p2w+=Number(s.t2wins);}else{p1w+=Number(s.t2wins);p2w+=Number(s.t1wins);}});
  return{p1wins:p1w,p2wins:p2w,matches:m};
}

function getSessionsThisMonthAlways() {
  var now = new Date();
  var overrideDate = monthOverrides[getCurrentMonthKey()];
  return sessions.filter(function(s) {
    if (!s.date) return false;
    var d = new Date(s.date);
    var inCurrentMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (!inCurrentMonth) return false;
    if (overrideDate && s.date < overrideDate) return false;
    return true;
  });
}
function getPartnerFor(s, n) {
  if (inT1(s,n)) { var mate = s.t1p1===n ? s.t1p2 : s.t1p1; return mate && mate!=="undefined" ? mate : null; }
  if ([s.t2p1,s.t2p2].indexOf(n)>-1) { var mate2 = s.t2p1===n ? s.t2p2 : s.t2p1; return mate2 && mate2!=="undefined" ? mate2 : null; }
  return null;
}
function getOpponentsFor(s, n) {
  if (inT1(s,n)) return [s.t2p1,s.t2p2].filter(function(x){return x&&x!=="undefined";});
  if ([s.t2p1,s.t2p2].indexOf(n)>-1) return [s.t1p1,s.t1p2].filter(function(x){return x&&x!=="undefined";});
  return [];
}
function computePartnerStreakInsight(n) {
  var monthMatches = getSessionsThisMonthAlways().filter(function(s){ return inMatch(s,n); }).sort(function(a,b){ return a.id-b.id; });
  var withPartner = monthMatches.filter(function(s){ return getPartnerFor(s,n); });
  if (!withPartner.length) return null;
  var lastPartner = getPartnerFor(withPartner[withPartner.length-1], n);
  var streak = 0, lastResult = null;
  for (var i = monthMatches.length-1; i >= 0; i--) {
    var s = monthMatches[i];
    var partner = getPartnerFor(s, n);
    if (partner !== lastPartner) break;
    var result = getResult(s, n);
    if (result === "D") break;
    if (lastResult === null) { lastResult = result; streak = 1; }
    else if (result === lastResult) { streak++; }
    else break;
  }
  if (streak >= 3) return { partner: lastPartner, type: lastResult, count: streak };
  return null;
}
function computeOpponentStreakInsight(n) {
  var monthMatches = getSessionsThisMonthAlways().filter(function(s){ return inMatch(s,n); }).sort(function(a,b){ return a.id-b.id; });
  var best = null;
  var opponentsSeen = {};
  monthMatches.forEach(function(s){ getOpponentsFor(s,n).forEach(function(o){ opponentsSeen[o]=true; }); });
  Object.keys(opponentsSeen).forEach(function(opp) {
    var matchesVsOpp = monthMatches.filter(function(s){ return getOpponentsFor(s,n).indexOf(opp) > -1; });
    if (matchesVsOpp.length < 3) return;
    var streak = 0, lastResult = null;
    for (var i = matchesVsOpp.length-1; i >= 0; i--) {
      var result = getResult(matchesVsOpp[i], n);
      if (result === "D") break;
      if (lastResult === null) { lastResult = result; streak = 1; }
      else if (result === lastResult) { streak++; }
      else break;
    }
    if (streak >= 3 && (!best || streak > best.count)) best = { opponent: opp, type: lastResult, count: streak };
  });
  return best;
}
function computePartnerWinRateInsight(n) {
  var monthMatches = getSessionsThisMonthAlways().filter(function(s){ return inMatch(s,n); });
  if (!monthMatches.length) return null;
  var overallWon=0, overallLost=0;
  var byPartner = {};
  monthMatches.forEach(function(s) {
    var result = getResult(s,n);
    if (result === "D") return;
    if (result === "W") overallWon++; else overallLost++;
    var partner = getPartnerFor(s,n);
    if (!partner) return;
    if (!byPartner[partner]) byPartner[partner] = {won:0,lost:0};
    if (result === "W") byPartner[partner].won++; else byPartner[partner].lost++;
  });
  var overallTotal = overallWon+overallLost;
  if (overallTotal === 0) return null;
  var overallRate = (overallWon/overallTotal)*100;

  var biggest = null;
  Object.keys(byPartner).forEach(function(partner) {
    var pd = byPartner[partner];
    var tot = pd.won+pd.lost;
    if (tot < 3) return;
    var rate = (pd.won/tot)*100;
    var diff = rate - overallRate;
    if (Math.abs(diff) < 10) return;
    if (!biggest || Math.abs(diff) > Math.abs(biggest.diff)) {
      biggest = { partner: partner, partnerRate: rate, overallRate: overallRate, diff: diff, matches: tot };
    }
  });
  return biggest;
}
function computeGameTypeInsight(n) {
  var monthMatches = getSessionsThisMonthAlways().filter(function(s){ return inMatch(s,n); });
  var w21=0,l21=0,w11=0,l11=0;
  monthMatches.forEach(function(s) {
    var result = getResult(s,n);
    if (result === "D") return;
    if ((s.gameType||"21")==="11") { if(result==="W") w11++; else l11++; }
    else { if(result==="W") w21++; else l21++; }
  });
  var tot21 = w21+l21, tot11 = w11+l11;
  if (tot21 < 3 || tot11 < 3) return null;
  var r21 = (w21/tot21)*100, r11 = (w11/tot11)*100;
  if (Math.abs(r21-r11) < 10) return null;
  return { better: r21>r11 ? "21pt" : "11pt", worse: r21>r11 ? "11pt" : "21pt", betterRate: Math.max(r21,r11), worseRate: Math.min(r21,r11) };
}
function getSessionsForMonth(monthKey) {
  var parts = monthKey.split("-");
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) - 1;
  var overrideDate = monthOverrides[monthKey];
  return sessions.filter(function(s) {
    if (!s.date) return false;
    var d = new Date(s.date);
    var inMonth = d.getFullYear() === year && d.getMonth() === month;
    if (!inMonth) return false;
    if (overrideDate && s.date < overrideDate) return false;
    return true;
  });
}
function getSessionsForPeriod() {
  if (leaderboardPeriod === "alltime") return sessions;
  if (leaderboardPeriod === "4player") return get4PlayerDaySessions();
  if (leaderboardPeriod === "customMonth") return getSessionsForMonth(customMonthValue || getCurrentMonthKey());
  if (leaderboardPeriod === "customDate") return sessions.filter(function(s){ return s.date === customDateValue; });
  return getSessionsForMonth(getCurrentMonthKey());
}
function get4PlayerDaySessions() {
  var dateUniquePlayers = {};
  sessions.forEach(function(s) {
    if (!s.date) return;
    if (!dateUniquePlayers[s.date]) dateUniquePlayers[s.date] = {};
    [s.t1p1,s.t1p2,s.t2p1,s.t2p2].forEach(function(n){ if(n && n!=="undefined" && n!=="") dateUniquePlayers[s.date][n]=true; });
  });
  var validDates = {};
  Object.keys(dateUniquePlayers).forEach(function(d){
    if (Object.keys(dateUniquePlayers[d]).length === 4) validDates[d] = true;
  });
  return sessions.filter(function(s){ return s.date && validDates[s.date]; });
}
function getTotalMatchDaysThisMonth() {
  var src = getSessionsForPeriod();
  var days = {};
  src.forEach(function(s){ if (s.date) days[s.date] = true; });
  return Object.keys(days).length;
}
function getPlayerMatchDaysThisMonth(name) {
  var src = getSessionsForPeriod();
  var days = {};
  src.forEach(function(s) {
    if (!s.date) return;
    if ([s.t1p1,s.t1p2,s.t2p1,s.t2p2].indexOf(name) > -1) days[s.date] = true;
  });
  return Object.keys(days).length;
}
function getPlayerFirstMatchDate(name) {
  var earliest = null;
  sessions.forEach(function(s) {
    if (!s.date) return;
    if ([s.t1p1,s.t1p2,s.t2p1,s.t2p2].indexOf(name) === -1) return;
    if (earliest === null || s.date < earliest) earliest = s.date;
  });
  return earliest;
}
function getAllTimeAttendanceForPlayer(name) {
  var firstDate = getPlayerFirstMatchDate(name);
  if (!firstDate) return { attended: 0, total: 0 };
  var allDaysSinceJoined = {};
  var attendedDays = {};
  sessions.forEach(function(s) {
    if (!s.date || s.date < firstDate) return;
    allDaysSinceJoined[s.date] = true;
    if ([s.t1p1,s.t1p2,s.t2p1,s.t2p2].indexOf(name) > -1) attendedDays[s.date] = true;
  });
  return { attended: Object.keys(attendedDays).length, total: Object.keys(allDaysSinceJoined).length };
}
function isQualifiedThisMonth(name) {
  var total = getTotalMatchDaysThisMonth();
  if (total === 0) return true;
  var played = getPlayerMatchDaysThisMonth(name);
  return played >= total * 0.5;
}
function getCurrentMonthKey() {
  var now = new Date();
  var m = now.getMonth()+1;
  return now.getFullYear() + "-" + (m<10?"0"+m:m);
}
function getPreviousMonthKey() {
  var now = new Date();
  var prevMonth = new Date(now.getFullYear(), now.getMonth()-1, 1);
  var m = prevMonth.getMonth()+1;
  return prevMonth.getFullYear() + "-" + (m<10?"0"+m:m);
}
function getEarnedMonthLabel(appliedMonthKey) {
  var parts = appliedMonthKey.split("-");
  var year = parseInt(parts[0]), month = parseInt(parts[1]) - 1;
  var earnedDate = new Date(year, month - 1, 1);
  return MONTHS[earnedDate.getMonth()] + " " + earnedDate.getFullYear();
}
function computeMonthlyWinnersList() {
  var results = [];
  Object.keys(monthlyAdjustments).forEach(function(monthKey) {
    var monthData = monthlyAdjustments[monthKey];
    if (!monthData || typeof monthData !== "object") return;
    var maxBrownie = 0;
    var winners = [];
    Object.keys(monthData).forEach(function(name) {
      if (name === "_autoBrownieAppliedFor") return;
      var entry = monthData[name];
      if (entry && entry.hiddenFromWinnersBoard) return;
      var b = Number(entry && entry.brownie) || 0;
      if (b <= 0) return;
      if (b > maxBrownie) { maxBrownie = b; winners = [name]; }
      else if (b === maxBrownie) { winners.push(name); }
    });
    if (winners.length > 0) {
      results.push({ appliedMonth: monthKey, earnedLabel: getEarnedMonthLabel(monthKey), winners: winners, brownieValue: maxBrownie });
    }
  });
  results.sort(function(a,b){ return b.appliedMonth.localeCompare(a.appliedMonth); });
  return results;
}
function renderMonthlyWinners() {
  var results = computeMonthlyWinnersList();
  var el = document.getElementById("winners-list");
  if (!results.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🏅</div><p>No monthly winners recorded yet</p></div>';
    return;
  }
  el.innerHTML = results.map(function(r, i) {
    var medal = i === 0 ? "🥇" : (i === 1 ? "🥈" : "🏅");
    return '<div class="winner-row'+(i===0?" champ":"")+'">' +
      '<div class="winner-medal">'+medal+'</div>' +
      '<div class="winner-month">'+r.earnedLabel+'</div>' +
      '<div class="winner-name">'+r.winners.join(" & ")+'</div>' +
      '</div>';
  }).join("");
}
function populateChampionBanner() {
  var results = computeMonthlyWinnersList();
  var banner = document.getElementById("champion-banner");
  banner.style.display = "flex";
  if (!results.length) {
    document.getElementById("champion-label").textContent = "Monthly Champion";
    document.getElementById("champion-name").textContent = "No champion recorded yet";
    document.getElementById("champion-link").textContent = "";
    return;
  }
  var mostRecent = results[0];
  document.getElementById("champion-label").textContent = mostRecent.earnedLabel + "'s Champion";
  document.getElementById("champion-name").textContent = mostRecent.winners.join(" & ");
  document.getElementById("champion-link").textContent = "See all →";
}
function getTodayString() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,"0");
  var day = String(d.getDate()).padStart(2,"0");
  return y + "-" + m + "-" + day;
}
function isTodayMatchDay() {
  var dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var todayName = dayNames[new Date().getDay()];
  return weeklyPattern.indexOf(todayName) > -1;
}
function populateMatchDayBanner() {
  var banner = document.getElementById("matchday-banner");
  var todayStr = getTodayString();
  if (!isTodayMatchDay()) {
    banner.style.display = "none";
    return;
  }
  var todaysMatchCount = 0;
  sessions.forEach(function(s){
    if (s.date === todayStr) todaysMatchCount += ((Number(s.t1wins)||0) + (Number(s.t2wins)||0)) * wt(s);
  });
  var textEl = document.getElementById("matchday-text");
  if (todaysMatchCount > 0) {
    textEl.textContent = Math.round(todaysMatchCount) + " match" + (todaysMatchCount!==1?"es":"") + " smashed today already";
  } else {
    textEl.textContent = "Match day, today!";
  }
  banner.style.display = "flex";
}
function computeQualifiedStandingsForMonth(monthKey) {
  var parts = monthKey.split("-");
  var year = parseInt(parts[0]), month = parseInt(parts[1]) - 1;
  var monthSessions = sessions.filter(function(s) {
    if (!s.date) return false;
    var d = new Date(s.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  if (!monthSessions.length) return [];

  var totalDays = {};
  monthSessions.forEach(function(s){ if (s.date) totalDays[s.date] = true; });
  var totalMatchDays = Object.keys(totalDays).length;

  var p = {};
  monthSessions.forEach(function(s) {
    var w = wt(s);
    [s.t1p1,s.t1p2].forEach(function(n){ if(!n||n==="undefined"||n==="") return; if(!p[n]) p[n]={name:n,won:0,lost:0,days:{}}; p[n].won+=Number(s.t1wins)*w; p[n].lost+=Number(s.t2wins)*w; if(s.date) p[n].days[s.date]=true; });
    [s.t2p1,s.t2p2].forEach(function(n){ if(!n||n==="undefined"||n==="") return; if(!p[n]) p[n]={name:n,won:0,lost:0,days:{}}; p[n].won+=Number(s.t2wins)*w; p[n].lost+=Number(s.t1wins)*w; if(s.date) p[n].days[s.date]=true; });
  });

  var arr = Object.values(p);
  arr.forEach(function(pl) {
    var daysPlayed = Object.keys(pl.days).length;
    pl.qualified = totalMatchDays === 0 ? true : daysPlayed >= totalMatchDays * 0.5;
    pl.rawRate = pl.won+pl.lost ? (pl.won/(pl.won+pl.lost))*100 : 0;
  });

  return arr.filter(function(pl){ return pl.qualified; })
             .sort(function(a,b){ return b.rawRate-a.rawRate || b.won-a.won; });
}
var autoBrownieCheckDone = false;
async function runAutoBrownieAssignment() {
  if (autoBrownieCheckDone) return;
  if (!sessionsLoaded || !adjustmentsLoaded) return;
  if (!sessions.length) return;
  autoBrownieCheckDone = true;

  var prevKey = getPreviousMonthKey();
  var currentKey = getCurrentMonthKey();

  if (monthlyAdjustments[currentKey] && monthlyAdjustments[currentKey]._autoBrownieAppliedFor === prevKey) {
    return;
  }

  var standings = computeQualifiedStandingsForMonth(prevKey);
  if (standings.length === 0) return;

  var groups = [];
  var i = 0;
  while (i < standings.length) {
    var current = standings[i];
    var tiedGroup = [current];
    var j = i + 1;
    while (j < standings.length && standings[j].rawRate === current.rawRate) {
      tiedGroup.push(standings[j]);
      j++;
    }
    groups.push(tiedGroup);
    i = j;
  }

  var updates = {};
  if (groups[0]) {
    var winnerShare = 1.5 / groups[0].length;
    groups[0].forEach(function(p) { updates[currentKey + "/" + p.name + "/brownie"] = winnerShare; });
  }
  if (groups[1]) {
    var runnerUpShare = 0.5 / groups[1].length;
    groups[1].forEach(function(p) { updates[currentKey + "/" + p.name + "/brownie"] = runnerUpShare; });
  }
  updates[currentKey + "/_autoBrownieAppliedFor"] = prevKey;

  try {
    await update(adjustmentsRef, updates);
    console.log("Auto brownie assigned for", currentKey, "based on", prevKey,
      "winners:", groups[0] ? groups[0].map(function(p){return p.name;}).join(", ") : "none",
      "runners-up:", groups[1] ? groups[1].map(function(p){return p.name;}).join(", ") : "none");
  } catch(e) {
    console.log("Auto brownie assignment failed:", e.message);
    autoBrownieCheckDone = false;
  }
}
function getAdjustmentFor(name) {
  var key = getCurrentMonthKey();
  if (monthlyAdjustments[key] && monthlyAdjustments[key][name]) {
    var a = monthlyAdjustments[key][name];
    return { brownie: Number(a.brownie)||0, negative: Number(a.negative)||0, negativeReason: a.negativeReason||"" };
  }
  return { brownie: 0, negative: 0, negativeReason: "" };
}
function getHistoricallyActivePlayers() {
  var names = {};
  sessions.forEach(function(s) {
    [s.t1p1,s.t1p2,s.t2p1,s.t2p2].forEach(function(n){ if(n && n!=="undefined" && n!=="") names[n]=true; });
  });
  return Object.keys(names);
}

function getPairKey(a, b) { return [a,b].sort().join("|"); }
function computePairingCountsThisMonth() {
  var counts = {};
  var src = getSessionsForPeriod();
  src.forEach(function(s) {
    var t1 = [s.t1p1, s.t1p2].filter(function(n){ return n && n!=="undefined" && n!==""; });
    var t2 = [s.t2p1, s.t2p2].filter(function(n){ return n && n!=="undefined" && n!==""; });
    if (t1.length === 2) { var k = getPairKey(t1[0], t1[1]); counts[k] = (counts[k]||0) + 1; }
    if (t2.length === 2) { var k2 = getPairKey(t2[0], t2[1]); counts[k2] = (counts[k2]||0) + 1; }
  });
  return counts;
}
function getPairCount(counts, a, b) { return counts[getPairKey(a,b)] || 0; }

function allTeamSplitsOf4(four) {
  return [
    [[four[0],four[1]],[four[2],four[3]]],
    [[four[0],four[2]],[four[1],four[3]]],
    [[four[0],four[3]],[four[1],four[2]]],
  ];
}
function bestSplitFor4(four, counts) {
  var best = null, bestScore = Infinity;
  allTeamSplitsOf4(four).forEach(function(c) {
    var score = getPairCount(counts, c[0][0], c[0][1]) + getPairCount(counts, c[1][0], c[1][1]);
    if (score < bestScore) { bestScore = score; best = c; }
  });
  return { teams: best, score: bestScore };
}
function combinationsOf(arr, k) {
  var results = [];
  function helper(start, combo) {
    if (combo.length === k) { results.push(combo.slice()); return; }
    for (var i = start; i < arr.length; i++) { combo.push(arr[i]); helper(i+1, combo); combo.pop(); }
  }
  helper(0, []);
  return results;
}

function suggestLineup(players) {
  var playerCount = players.length;
  var counts = computePairingCountsThisMonth();

  if (playerCount === 4) {
    var r4 = bestSplitFor4(players, counts);
    return { teams: r4.teams, waiting: null, sitOut: null, score: r4.score };
  }
  if (playerCount === 5) {
    var best=null, bestScore=Infinity, bestSitOut=null;
    players.forEach(function(sitOut) {
      var remaining = players.filter(function(p){ return p!==sitOut; });
      var r = bestSplitFor4(remaining, counts);
      if (r.score < bestScore) { bestScore=r.score; best=r.teams; bestSitOut=sitOut; }
    });
    return { teams: best, waiting: null, sitOut: bestSitOut, score: bestScore };
  }
  if (playerCount === 6) {
    function allThreeWaySplits(ps) {
      var results = [];
      function helper(remaining, current) {
        if (remaining.length === 0) { results.push(current.slice()); return; }
        var first = remaining[0];
        for (var i = 1; i < remaining.length; i++) {
          var partner = remaining[i];
          var rest = remaining.filter(function(p){ return p!==first && p!==partner; });
          current.push([first, partner]);
          helper(rest, current);
          current.pop();
        }
      }
      helper(ps, []);
      return results;
    }
    function getThisMonthRawRate(name) {
      var m = getSessionsThisMonthAlways().filter(function(s){ return inMatch(s,name); });
      var won=0, lost=0;
      m.forEach(function(s){
        var result = getResult(s,name);
        if (result==="W") won++; else if (result==="L") lost++;
      });
      return won+lost ? (won/(won+lost))*100 : 50;
    }
    var skillRates = {};
    players.forEach(function(p){ skillRates[p] = getThisMonthRawRate(p); });

    function scoreSplit(split, c) {
      return split.reduce(function(sum, pair) { return sum + getPairCount(c, pair[0], pair[1]); }, 0);
    }
    function skillImbalancePenalty(split) {
      return split.reduce(function(sum, pair) {
        var gap = Math.abs(skillRates[pair[0]] - skillRates[pair[1]]);
        return sum + (100 - gap);
      }, 0);
    }
    var PAIRING_WEIGHT = 1000;
    function combinedScore(split, c) {
      return scoreSplit(split, c) * PAIRING_WEIGHT + skillImbalancePenalty(split);
    }

    var allSplits = allThreeWaySplits(players);
    var firstHalf = allSplits.reduce(function(best, split) {
      var score = combinedScore(split, counts);
      return (!best || score < best.score) ? { split: split, score: score } : best;
    }, null);

    var firstHalfKeys = firstHalf.split.map(function(p){ return getPairKey(p[0],p[1]); });
    var nonOverlapping = allSplits.filter(function(split) {
      return split.every(function(p){ return firstHalfKeys.indexOf(getPairKey(p[0],p[1])) === -1; });
    });
    var secondHalf = null;
    if (nonOverlapping.length > 0) {
      secondHalf = nonOverlapping.reduce(function(best, split) {
        var score = combinedScore(split, counts);
        return (!best || score < best.score) ? { split: split, score: score } : best;
      }, null);
    }

    return { sixPlayerPlan: { firstHalf: firstHalf.split, secondHalf: secondHalf ? secondHalf.split : null } };
  }
}

var lineupSelected = [];

function renderLineupChips() {
  var pool = squadPlayers;
  var el = document.getElementById("lineup-chips");
  if (!pool.length) {
    el.innerHTML = '<div style="color:var(--text-dim);font-size:12px">Add players in Manage Squad below first</div>';
    return;
  }
  el.innerHTML = pool.map(function(p) {
    var sel = lineupSelected.indexOf(p) > -1;
    return '<button class="chip'+(sel?" sel-t1":"")+'" data-lp="'+p+'">'+p+'</button>';
  }).join("");
  el.querySelectorAll(".chip").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var p = this.getAttribute("data-lp");
      var idx = lineupSelected.indexOf(p);
      if (idx > -1) lineupSelected.splice(idx, 1);
      else if (lineupSelected.length < 6) lineupSelected.push(p);
      renderLineupChips();
    });
  });
  document.getElementById("lineup-sel-hint").textContent = lineupSelected.length + " selected" + (lineupSelected.length ? ": " + lineupSelected.join(", ") : "");
}

document.getElementById("lineup-suggest-btn").addEventListener("click", function() {
  var errEl = document.getElementById("lineup-err");
  var resultEl = document.getElementById("lineup-result");
  errEl.style.display = "none";
  resultEl.innerHTML = "";
  var n = lineupSelected.length;
  if (n !== 4 && n !== 5 && n !== 6) {
    errEl.textContent = "Please select exactly 4, 5, or 6 players (currently " + n + " selected)";
    errEl.style.display = "block";
    return;
  }
  renderLineupSuggestion(lineupSelected.slice());
});

function renderLineupSuggestion(players) {
  var result = suggestLineup(players);
  var el = document.getElementById("lineup-result");

  if (result.sixPlayerPlan) {
    var fh = result.sixPlayerPlan.firstHalf;
    var sh = result.sixPlayerPlan.secondHalf;
    var html = '<div style="margin-top:12px">';
    html += '<div style="font-size:10.5px;color:var(--accent);text-transform:uppercase;letter-spacing:0.8px;font-weight:700;margin-bottom:8px">First ~30 min</div>';
    html += '<div style="font-size:14px;line-height:2;color:var(--text)">';
    html += 'Team 1: ' + fh[0].join(" & ") + '<br>';
    html += 'Team 2: ' + fh[1].join(" & ") + '<br>';
    html += 'Team 3: ' + fh[2].join(" & ");
    html += '</div>';
    html += '<div style="font-size:10px;color:var(--text-dim);margin-top:4px">Each plays the other two once, then sits</div>';

    if (sh) {
      html += '<div style="font-size:10.5px;color:var(--accent);text-transform:uppercase;letter-spacing:0.8px;font-weight:700;margin:16px 0 8px">Second ~30 min</div>';
      html += '<div style="font-size:14px;line-height:2;color:var(--text)">';
      html += 'Team 1: ' + sh[0].join(" & ") + '<br>';
      html += 'Team 2: ' + sh[1].join(" & ") + '<br>';
      html += 'Team 3: ' + sh[2].join(" & ");
      html += '</div>';
      html += '<div style="font-size:10px;color:var(--text-dim);margin-top:4px">✨ No repeats from the first half</div>';
    }
    html += '</div>';
    el.innerHTML = html;
    return;
  }

  var noDataNote = result.score === 0 ? '<div style="font-size:11px;color:var(--text-dim);margin-top:6px">✨ Fresh pairing — haven\'t played together this month yet</div>' : '<div style="font-size:11px;color:var(--text-dim);margin-top:6px">Best available combo (some overlap unavoidable this month)</div>';
  var html = '<div style="margin-top:12px" class="teams-flat">' +
    '<div class="team-side"><div class="team-side-name">🟢 Your Team</div><div style="font-size:14px;font-weight:600">'+result.teams[0].join(" & ")+'</div></div>' +
    '<div class="vs-divider">vs</div>' +
    '<div class="team-side"><div class="team-side-name">🔴 Opponent</div><div style="font-size:14px;font-weight:600">'+result.teams[1].join(" & ")+'</div></div>' +
  '</div>';
  if (result.sitOut) {
    html += '<div style="text-align:center;font-size:12px;color:var(--text-dim);margin-top:10px">⏳ Sitting out: '+result.sitOut+'</div>';
  }
  if (result.waiting) {
    html += '<div style="text-align:center;font-size:12px;color:var(--text-dim);margin-top:10px">⏳ Waiting pair: '+result.waiting.join(" & ")+'</div>';
  }
  html += noDataNote;
  el.innerHTML = html;
}

function computeIndividual() {
  var p={};
  if (leaderboardPeriod === "month") {
    getHistoricallyActivePlayers().forEach(function(n){ p[n]={name:n,won:0,lost:0}; });
  }
  var src = getSessionsForPeriod();
  src.forEach(function(s){var w=wt(s);[s.t1p1,s.t1p2].forEach(function(n){if(!n||n==="undefined"||n==="")return;if(!p[n])p[n]={name:n,won:0,lost:0};p[n].won+=Number(s.t1wins)*w;p[n].lost+=Number(s.t2wins)*w;});[s.t2p1,s.t2p2].forEach(function(n){if(!n||n==="undefined"||n==="")return;if(!p[n])p[n]={name:n,won:0,lost:0};p[n].won+=Number(s.t2wins)*w;p[n].lost+=Number(s.t1wins)*w;});});
  var arr = Object.values(p);
  if (leaderboardPeriod === "month") {
    var totalMatchDays = getTotalMatchDaysThisMonth();
    arr.forEach(function(pl) {
      pl.qualified = isQualifiedThisMonth(pl.name);
      pl.matchDaysPlayed = getPlayerMatchDaysThisMonth(pl.name);
      pl.matchDaysNeeded = Math.ceil(totalMatchDays * 0.5);
      var adj = getAdjustmentFor(pl.name);
      pl.brownie = adj.brownie;
      pl.negative = adj.negative;
      pl.negativeReason = adj.negativeReason;
      var rawRate = pl.won+pl.lost ? (pl.won/(pl.won+pl.lost))*100 : 0;
      pl.rawRate = rawRate;
      var attendanceRatio = totalMatchDays > 0 ? (pl.matchDaysPlayed / totalMatchDays) : 1;
      pl.attendanceRatio = attendanceRatio;
      pl.rankedScore = (rawRate * attendanceRatio) + adj.negative;
      pl.effectiveScore = rawRate + adj.negative;
    });
  } else if (leaderboardPeriod === "alltime") {
    var ALLTIME_MIN_MATCH_DAYS = 5;
    arr.forEach(function(pl) {
      var rawRate = pl.won+pl.lost ? (pl.won/(pl.won+pl.lost))*100 : 0;
      pl.rawRate = rawRate;
      var att = getAllTimeAttendanceForPlayer(pl.name);
      pl.matchDaysPlayed = att.attended;
      pl.matchDaysTotal = att.total;
      pl.firstMatchDate = getPlayerFirstMatchDate(pl.name);
      pl.matchDaysNeeded = ALLTIME_MIN_MATCH_DAYS;
      pl.qualified = att.attended >= ALLTIME_MIN_MATCH_DAYS;
      pl.brownie = 0; pl.negative = 0; pl.negativeReason = "";
      var attendanceRatio2 = att.total > 0 ? (att.attended / att.total) : 1;
      pl.attendanceRatio = attendanceRatio2;
      pl.rankedScore = rawRate * attendanceRatio2;
      pl.effectiveScore = pl.rankedScore;
    });
  } else {
    arr.forEach(function(pl) {
      pl.qualified = true;
      pl.brownie = 0; pl.negative = 0; pl.negativeReason = "";
      pl.rawRate = pl.won+pl.lost ? (pl.won/(pl.won+pl.lost))*100 : 0;
      pl.rankedScore = pl.rawRate;
      pl.effectiveScore = pl.rawRate;
    });
  }
  return arr.sort(function(a,b){
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    return b.effectiveScore-a.effectiveScore||b.won-a.won;
  });
}
function computePairs() {
  var p={};
  var src = getSessionsForPeriod();
  src.forEach(function(s){var w=wt(s);var p1=[s.t1p1,s.t1p2].filter(function(n){return n&&n!=="undefined"&&n!=="";}).sort().join(" & ");var p2=[s.t2p1,s.t2p2].filter(function(n){return n&&n!=="undefined"&&n!=="";}).sort().join(" & ");if(p1){if(!p[p1])p[p1]={name:p1,won:0,lost:0};p[p1].won+=Number(s.t1wins)*w;p[p1].lost+=Number(s.t2wins)*w;}if(p2){if(!p[p2])p[p2]={name:p2,won:0,lost:0};p[p2].won+=Number(s.t2wins)*w;p[p2].lost+=Number(s.t1wins)*w;}});
  return Object.values(p).sort(function(a,b){var ra=a.won+a.lost?a.won/(a.won+a.lost):0,rb=b.won+b.lost?b.won/(b.won+b.lost):0;return rb-ra||b.won-a.won;});
}

function renderLeaderboard() {
  var periodSessions = getSessionsForPeriod();
  var periodTotalGames = 0;
  periodSessions.forEach(function(s){ periodTotalGames += ((Number(s.t1wins)||0) + (Number(s.t2wins)||0)) * wt(s); });
  function rows(data,clickable,kind){
    kind = kind || "player";
    var attrName = kind === "pair" ? "data-pair" : "data-player";
    if(!data.length)return emptyHTML();
    var qualifiedRank = 0;
    return(clickable?'<div class="tap-hint">Tap '+(kind==="pair"?"a pair":"a player")+' to see stats</div>':"")+
      data.map(function(p){
        var tot=p.won+p.lost,rate=tot?Math.round(p.won/tot*100):0,low=rate<50;
        var sHTML="";
        if(clickable&&kind==="player"){var st=computeStreaks(p.name);if(st&&st.count>=2){if(st.type==="W")sHTML='<span class="tag hot">🔥 won last '+st.count+'</span>';else if(st.type==="L")sHTML='<span class="tag cold">❄️ lost last '+st.count+'</span>';}}

        if (p.qualified === false) {
          return '<div class="lb-row" '+attrName+'="'+p.name+'" style="opacity:0.65">'+
            '<div class="rank-badge">—</div>'+
            '<div class="lb-main"><div class="lb-name">'+p.name+'</div>'+
              '<div class="lb-secondary">'+sHTML+'<span>Played '+p.matchDaysPlayed+' of '+p.matchDaysNeeded+' required days</span></div></div>'+
            '<div class="lb-stats"><div class="lb-rate'+(low?" low":"")+'" style="font-size:15px">'+rate+'%</div><div class="lb-detail">'+p.won.toFixed(1)+'W — '+p.lost.toFixed(1)+'L</div><div style="font-size:10px;color:var(--text-dim);font-weight:700;margin-top:2px">Building Data</div></div></div>';
        }

        var rankIdx = qualifiedRank;
        qualifiedRank++;
        var badgeClass = rankIdx===0?"gold":rankIdx===1?"silver":rankIdx===2?"bronze":"";
        var adjHTML = "";
        if (p.brownie > 0) adjHTML += '<span class="tag brownie">🍪 +'+p.brownie+'%</span>';
        if (p.negative < 0) adjHTML += '<span class="tag penalty" title="'+(p.negativeReason||"")+'">⚠️ '+p.negative+'%</span>';

        var hasRankedScore = kind==="player" && leaderboardPeriod==="alltime" && typeof p.rankedScore==="number";
        var isThisMonth = kind==="player" && leaderboardPeriod==="month" && typeof p.rankedScore==="number";
        var heroNumber, subLine1, subLine2, subLine3 = "";
        if (hasRankedScore) {
          heroNumber = Math.round(p.rankedScore);
          subLine1 = '<span class="lb-rate'+(low?" low":"")+'" style="font-size:11px">'+rate+'%</span><span class="lb-detail"> raw · '+p.won.toFixed(1)+'W — '+p.lost.toFixed(1)+'L</span>';
          var daysTotal = p.matchDaysTotal;
          subLine2 = '<div class="lb-detail" style="opacity:0.7">Played '+p.matchDaysPlayed+' of '+daysTotal+' match-days</div>';
          if (p.firstMatchDate) {
            var fmParts = p.firstMatchDate.split("-");
            var fmMonthLabel = MONTHS[parseInt(fmParts[1])-1];
            subLine3 = '<div class="lb-detail" style="opacity:0.55">(since '+fmMonthLabel+')</div>';
          }
        } else if (isThisMonth) {
          heroNumber = rate;
          subLine1 = '<span class="lb-detail">'+p.won.toFixed(1)+'W — '+p.lost.toFixed(1)+'L</span>';
          subLine2 = '<div class="lb-detail" style="opacity:0.7">Played '+p.matchDaysPlayed+' of '+getTotalMatchDaysThisMonth()+' match-days</div>';
          subLine3 = '<div class="lb-detail" style="opacity:0.55">📊 '+Math.round(p.rankedScore)+'% relative</div>';
        } else {
          heroNumber = rate;
          subLine1 = '<span class="lb-detail">'+p.won.toFixed(1)+'W — '+p.lost.toFixed(1)+'L</span>';
          subLine2 = '<div class="lb-detail" style="opacity:0.7">'+tot.toFixed(1)+' matches</div>';
        }

        return '<div class="lb-row'+(rankIdx===0?" rank-1":"")+'" '+attrName+'="'+p.name+'">'+
          '<div class="rank-badge '+badgeClass+'">'+(rankIdx+1)+'</div>'+
          '<div class="lb-main"><div class="lb-name">'+p.name+'</div>'+(sHTML||adjHTML?'<div class="lb-secondary">'+sHTML+adjHTML+'</div>':'')+'</div>'+
          '<div class="lb-stats"><div class="lb-rate'+(low?" low":"")+'">'+heroNumber+'%</div><div class="lb-detail">'+subLine1+'</div>'+subLine2+subLine3+'<div class="lb-bar"><div class="lb-bar-fill'+(low?" low":"")+'" style="width:'+rate+'%"></div></div></div></div>';
      }).join("")+'<div class="count">'+periodTotalGames.toFixed(1)+' match'+(periodTotalGames!==1?"es":"")+" recorded</div>";
  }
  H("lb-individual",rows(computeIndividual(),true,"player"));
  H("lb-pairs",rows(computePairs(),true,"pair"));
  document.querySelectorAll("[data-player]").forEach(function(row){row.addEventListener("click",function(){showPlayerStats(this.getAttribute("data-player"));});});
  document.querySelectorAll("[data-pair]").forEach(function(row){row.addEventListener("click",function(){showPairStats(this.getAttribute("data-pair"));});});
}

function sessionCardHTML(s) {
  var locked = isLocked(s);
  var t1w=Number(s.t1wins),t2w=Number(s.t2wins),isWin=t1w>t2w,isDraw=t1w===t2w;
  var rc=isDraw?"draw":isWin?"":"loss",rl=isDraw?"Draw":isWin?"Won":"Lost";
  var t1n=[s.t1p1,s.t1p2].filter(function(n){return n&&n!=="undefined";}).join(" & ");
  var t2n=[s.t2p1,s.t2p2].filter(function(n){return n&&n!=="undefined";}).join(" & ");
  var hasScores=s.scores&&s.scores.length>0;
  var dots="";for(var i=0;i<t1w;i++)dots+='<span class="dot">W</span>';for(var i=0;i<t2w;i++)dots+='<span class="dot l">L</span>';

  var scoresHTML="";
  if(hasScores){
    scoresHTML='<div class="scores-section"><div class="scores-title">Game Scores</div>'+
      s.scores.map(function(sc,i){
        var won=sc.t1>sc.t2;
        return '<div class="game-score-row"><span class="game-label">Game '+(i+1)+'</span><span class="game-result '+(won?"w":"l")+'">'+sc.t1+' — '+sc.t2+'</span><span class="game-icon">'+(won?"✅":"❌")+'</span></div>';
      }).join("")+'</div>';
  }

  var totalGames=t1w+t2w;
  var scoreInputs="";
  for(var i=0;i<totalGames;i++){
    var existing=s.scores&&s.scores[i];
    scoreInputs+='<div class="score-input-row"><span class="score-game-lbl">Game '+(i+1)+'</span><input type="number" class="score-inp" data-game="'+i+'" data-team="t1" placeholder="0" min="0" value="'+(existing?existing.t1:"")+'"/><span class="score-dash">—</span><input type="number" class="score-inp" data-game="'+i+'" data-team="t2" placeholder="0" min="0" value="'+(existing?existing.t2:"")+'"/></div>';
  }

  return '<div class="session-card '+rc+'" data-key="'+s.firebaseKey+'">'+
    '<div class="card-summary">'+
      '<span class="badge '+rc+'">'+rl+'</span>'+
      gtBadge(s)+
      '<span class="summary-teams">'+t1n+' vs '+t2n+'</span>'+
      '<span class="summary-score'+(isWin?"":" loss")+'">'+t1w+'—'+t2w+'</span>'+
      (hasScores?'<span class="has-scores">📊</span>':'')+
      (locked?'<span style="font-size:11px">🔒</span>':'')+
      '<span class="expand-arrow">›</span>'+
    '</div>'+
    '<div class="card-body">'+
      '<div class="card-actions">'+
        (locked ? '<span style="font-size:12px;color:var(--text-dim);font-family:monospace">🔒 Locked</span>' : '')+
        '<button class="edit-btn" data-key="'+s.firebaseKey+'" data-locked="'+locked+'">✏️ Edit</button>'+
        '<button class="del-btn" data-key="'+s.firebaseKey+'" data-locked="'+locked+'">✕ Delete</button>'+
      '</div>'+
      '<div class="teams-flat">'+
        '<div class="team-side"><div class="team-side-name">'+t1n+'</div><div class="team-side-score'+(isWin?"":isDraw?"":" loss")+'">'+t1w+'</div></div>'+
        '<div class="vs-divider">vs</div>'+
        '<div class="team-side"><div class="team-side-name">'+t2n+'</div><div class="team-side-score'+(isWin?" loss":isDraw?"":"")+'">'+t2w+'</div></div>'+
      '</div>'+
      '<div class="match-meta">'+(t1w+t2w)+' matches • '+fmtDate(s.date)+'</div>'+
      '<div class="dots">'+dots+'</div>'+
      scoresHTML+
      '<div class="score-form" style="display:none">'+
        '<div class="score-form-title">'+(hasScores?"Edit":"Add")+' Game Scores</div>'+
        scoreInputs+
        '<button class="score-save-btn" data-key="'+s.firebaseKey+'" data-total="'+totalGames+'">Save Scores</button>'+
        '<button class="score-cancel-btn">Cancel</button>'+
      '</div>'+
      (!locked ? '<button class="add-scores-btn" data-key="'+s.firebaseKey+'">'+(hasScores?"✏️ Edit Scores":"📊 Add Scores")+'</button>' : '')+
    '</div>'+
  '</div>';
}

function setupDelegation() {
  var hc = document.getElementById("history-content");
  hc.addEventListener("click", async function(e) {
    var t = e.target;

    var summary = t.closest(".card-summary");
    if (summary) {
      var body = summary.parentElement.querySelector(".card-body");
      var arrow = summary.querySelector(".expand-arrow");
      var isOpen = body.classList.contains("open");
      body.classList.toggle("open", !isOpen);
      if (arrow) arrow.classList.toggle("open", !isOpen);
      return;
    }

    var editBtn = t.closest(".edit-btn");
    if (editBtn) {
      e.stopPropagation();
      var locked = editBtn.getAttribute("data-locked") === "true";
      if (locked && !checkAdmin()) return;
      var s = sessions.find(function(x){ return x.firebaseKey === editBtn.getAttribute("data-key"); });
      if (s) startEdit(s);
      return;
    }

    var delBtn = t.closest(".del-btn");
    if (delBtn) {
      e.stopPropagation();
      var locked = delBtn.getAttribute("data-locked") === "true";
      if (locked && !checkAdmin()) return;
      remove(ref(db, "matches/" + delBtn.getAttribute("data-key")));
      return;
    }

    var addScoresBtn = t.closest(".add-scores-btn");
    if (addScoresBtn) {
      e.stopPropagation();
      var card = addScoresBtn.closest(".session-card");
      var form = card.querySelector(".score-form");
      var scoresSection = card.querySelector(".scores-section");
      form.style.display = "block";
      addScoresBtn.style.display = "none";
      if (scoresSection) scoresSection.style.display = "none";
      return;
    }

    var cancelBtn = t.closest(".score-cancel-btn");
    if (cancelBtn) {
      e.stopPropagation();
      var card = cancelBtn.closest(".session-card");
      var form = card.querySelector(".score-form");
      var addBtn = card.querySelector(".add-scores-btn");
      var scoresSection = card.querySelector(".scores-section");
      form.style.display = "none";
      addBtn.style.display = "block";
      if (scoresSection) scoresSection.style.display = "block";
      return;
    }

    var saveScoresBtn = t.closest(".score-save-btn");
    if (saveScoresBtn) {
      e.stopPropagation();
      var key = saveScoresBtn.getAttribute("data-key");
      var total = parseInt(saveScoresBtn.getAttribute("data-total"));
      var card = saveScoresBtn.closest(".session-card");
      var scores = [];
      for (var i = 0; i < total; i++) {
        var t1v = card.querySelector('[data-game="' + i + '"][data-team="t1"]').value;
        var t2v = card.querySelector('[data-game="' + i + '"][data-team="t2"]').value;
        scores.push({ t1: parseInt(t1v) || 0, t2: parseInt(t2v) || 0 });
      }
      try {
        await update(ref(db, "matches/" + key), { scores: scores });
        saveScoresBtn.textContent = "✓ Saved!";
        setTimeout(function(){ saveScoresBtn.textContent = "Save Scores"; }, 1500);
      } catch(err) { saveScoresBtn.textContent = "Failed!"; }
      return;
    }
  });
}

function renderHistory() {
  H("history-content","");
  allHistoryLoaded=false;
  var filtered = getFiltered();
  var totalGames = 0;
  filtered.forEach(function(s){ totalGames += ((Number(s.t1wins)||0) + (Number(s.t2wins)||0)) * wt(s); });
  document.getElementById("history-total-games").textContent = totalGames.toFixed(1) + " match" + (totalGames!==1?"es":"") + " played · " + filtered.length + " session" + (filtered.length!==1?"s":"") + " logged";
  appendHistory();
}

function appendHistory() {
  var filtered=getFiltered();
  var start=historyPage*PAGE_SIZE;
  var end=start+PAGE_SIZE;
  var page=filtered.slice(start,end);
  if(page.length===0&&historyPage===0){H("history-content",emptyHTML("No matches found!"));return;}
  if(page.length<PAGE_SIZE)allHistoryLoaded=true;

  var grouped={};
  page.forEach(function(s){var d=s.date||"unknown";if(!grouped[d])grouped[d]=[];grouped[d].push(s);});
  var dates=Object.keys(grouped).sort(function(a,b){return b.localeCompare(a);});

  var container=document.getElementById("history-content");
  var html=dates.map(function(date){
    return '<div class="day-label">'+fmtDate(date)+'</div>'+grouped[date].map(function(s){return sessionCardHTML(s);}).join("");
  }).join("");

  if(historyPage===0){container.innerHTML=html;}
  else{container.insertAdjacentHTML("beforeend",html);}

  if(allHistoryLoaded&&filtered.length>0){
    var existing=document.getElementById("all-loaded-msg");
    if(!existing){container.insertAdjacentHTML("beforeend",'<div class="loading-indicator" id="all-loaded-msg">All history loaded</div>');}
  }
}

function showPlayerStats(name) {
  currentPlayer=name;
  var ind=computeIndividual(),pl=ind.find(function(p){return p.name===name;});
  if(!pl)return;
  var tot=pl.won+pl.lost,rate=tot?Math.round(pl.won/tot*100):0;
  var bs=computeBestStreak(name),bp=computeBestPartner(name),tg=computeToughest(name);
  var pm=playerMatches(name);
  var w21=0,l21=0,w11=0,l11=0;
  pm.forEach(function(s){var a=inT1(s,name);var mw=a?Number(s.t1wins):Number(s.t2wins);var ml=a?Number(s.t2wins):Number(s.t1wins);if((s.gameType||"21")==="11"){w11+=mw;l11+=ml;}else{w21+=mw;l21+=ml;}});
  var r21=(w21+l21)?Math.round(w21/(w21+l21)*100):0,r11=(w11+l11)?Math.round(w11/(w11+l11)*100):0;

  document.getElementById("p-avatar").textContent=name.charAt(0).toUpperCase();
  document.getElementById("p-name").textContent=name;
  var re=document.getElementById("p-winrate");re.textContent=rate+"%";re.className="player-winrate"+(rate<50?" low":"");
  document.getElementById("p-record").textContent=pl.won.toFixed(1)+"W — "+pl.lost.toFixed(1)+"L • "+(pl.won+pl.lost).toFixed(1)+" matches";

  H("stats-grid",
    '<div class="stat-box"><div class="stat-val accent">'+bs+'</div><div class="stat-lbl">Best Streak</div></div>'+
    '<div class="stat-box"><div class="stat-val">'+(pl.won+pl.lost).toFixed(1)+'</div><div class="stat-lbl">Total Matches</div></div>'+
    '<div class="stat-box"><div class="stat-val accent" style="font-size:14px">'+(bp||"—")+'</div><div class="stat-lbl">Best Partner</div></div>'+
    '<div class="stat-box"><div class="stat-val loss" style="font-size:14px">'+(tg||"—")+'</div><div class="stat-lbl">Toughest Opp</div></div>'+
    '<div class="stat-box wide"><div class="gt-split">'+
      '<div style="text-align:center"><div class="stat-val accent">'+r21+'%</div><div class="stat-lbl">21pt Win Rate</div><div style="font-size:11px;color:var(--text-dim);font-family:monospace;margin-top:4px">'+w21+'W — '+l21+'L</div></div>'+
      '<div style="width:1px;height:36px;background:var(--border-soft)"></div>'+
      '<div style="text-align:center"><div class="stat-val accent">'+r11+'%</div><div class="stat-lbl">11pt Win Rate</div><div style="font-size:11px;color:var(--text-dim);font-family:monospace;margin-top:4px">'+w11+'W — '+l11+'L</div></div>'+
    '</div></div>'
  );

  var insightsHTML = "";
  var partnerStreak = computePartnerStreakInsight(name);
  var opponentStreak = computeOpponentStreakInsight(name);
  var partnerWinRate = computePartnerWinRateInsight(name);
  var gameTypeGap = computeGameTypeInsight(name);

  if (partnerStreak) {
    var icon1 = partnerStreak.type === "W" ? "🔥" : "❄️";
    var verb1 = partnerStreak.type === "W" ? "Won" : "Lost";
    insightsHTML += '<div class="insight-row">'+icon1+' '+verb1+' your last '+partnerStreak.count+' with '+partnerStreak.partner+'</div>';
  }
  if (opponentStreak) {
    var icon2 = opponentStreak.type === "W" ? "🔥" : "❄️";
    var verb2 = opponentStreak.type === "W" ? "Won" : "Lost";
    insightsHTML += '<div class="insight-row">'+icon2+' '+verb2+' your last '+opponentStreak.count+' against '+opponentStreak.opponent+'</div>';
  }
  if (partnerWinRate) {
    var icon3 = partnerWinRate.diff > 0 ? "📈" : "📉";
    var verb3 = partnerWinRate.diff > 0 ? "jumps" : "drops";
    insightsHTML += '<div class="insight-row">'+icon3+' Win rate '+verb3+' with '+partnerWinRate.partner+'<div class="insight-sub">'+Math.round(partnerWinRate.overallRate)+'% overall → '+Math.round(partnerWinRate.partnerRate)+'% together ('+partnerWinRate.matches+' matches)</div></div>';
  }
  if (gameTypeGap) {
    insightsHTML += '<div class="insight-row">🎯 Performs better at '+gameTypeGap.better+' than '+gameTypeGap.worse+'<div class="insight-sub">'+Math.round(gameTypeGap.betterRate)+'% vs '+Math.round(gameTypeGap.worseRate)+'%</div></div>';
  }

  if (insightsHTML) {
    H("insights-section", '<div class="sec-hdr">This Month\'s Insights</div><div class="insights-box">'+insightsHTML+'</div>');
  } else {
    H("insights-section", "");
  }

  var opps={};
  getSessionsForPeriod().forEach(function(s){var a=inT1(s,name),b=[s.t2p1,s.t2p2].indexOf(name)>-1;if(!a&&!b)return;var t=a?[s.t2p1,s.t2p2]:[s.t1p1,s.t1p2];t.forEach(function(p){if(p&&p!=="undefined"&&p!==name)opps[p]=true;});});
  var on=Object.keys(opps);
  if(!on.length){H("h2h-list",'<div style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px">No opponents yet</div>');}
  else{
    H("h2h-list",on.map(function(o){var h=computeH2H(name,o),cls=h.p1wins>h.p2wins?"win":h.p1wins<h.p2wins?"loss":"draw";return '<div class="h2h-row" data-opp="'+o+'"><div class="h2h-opp">vs '+o+'</div><div class="h2h-score '+cls+'">'+h.p1wins+' — '+h.p2wins+'</div><div class="h2h-arr">›</div></div>';}).join(""));
    document.querySelectorAll(".h2h-row").forEach(function(r){r.addEventListener("click",function(){showH2H(name,this.getAttribute("data-opp"));});});
  }
  showTab("player");
}

function showH2H(p1,p2) {
  var h=computeH2H(p1,p2);
  document.getElementById("h2h-p1-name").textContent=p1;document.getElementById("h2h-p2-name").textContent=p2;
  var s1=document.getElementById("h2h-p1-score"),s2=document.getElementById("h2h-p2-score");
  s1.textContent=h.p1wins;s2.textContent=h.p2wins;
  s1.className="h2h-pscore"+(h.p1wins<h.p2wins?" loss":"");s2.className="h2h-pscore"+(h.p2wins<h.p1wins?" loss":"");
  document.getElementById("h2h-last").textContent=h.matches.length?"Last played: "+fmtDate(h.matches[h.matches.length-1].date):"";

  H("h2h-matches",h.matches.slice().reverse().map(function(s){
    var a=inT1(s,p1),t1w=Number(s.t1wins),t2w=Number(s.t2wins);
    var won=a?t1w>t2w:t2w>t1w,draw=t1w===t2w;
    var rc=draw?"d":won?"w":"l",rl=draw?"Draw":won?"Won":"Lost";
    var t1n=[s.t1p1,s.t1p2].filter(function(n){return n&&n!=="undefined";}).join(" & ");
    var t2n=[s.t2p1,s.t2p2].filter(function(n){return n&&n!=="undefined";}).join(" & ");
    var hasScores=s.scores&&s.scores.length>0;

    var scoresBodyHTML="";
    if(hasScores){
      scoresBodyHTML='<div style="padding:8px 0">'+s.scores.map(function(sc,i){var gw=sc.t1>sc.t2;return '<div class="game-score-row"><span class="game-label">Game '+(i+1)+'</span><span class="game-result '+(gw?"w":"l")+'">'+sc.t1+' — '+sc.t2+'</span><span class="game-icon">'+(gw?"✅":"❌")+'</span></div>';}).join("")+"</div>";
    }

    return '<div class="h2h-match-card">'+
      '<div class="h2h-match-summary">'+
        '<div class="h2h-match-date">'+fmtDate(s.date)+'</div>'+
        '<div class="h2h-match-teams">'+t1n+' vs '+t2n+'</div>'+
        gtBadge(s)+
        (hasScores?'<span style="font-size:11px">📊</span>':'')+
        '<div class="h2h-match-result '+rc+'">'+rl+'</div>'+
        '<span style="color:var(--text-dim);font-size:11px;margin-left:2px">›</span>'+
      '</div>'+
      '<div class="h2h-match-body">'+
        '<div style="font-family:monospace;font-size:13px;color:var(--text-dim);margin-top:8px">'+t1w+' — '+t2w+' matches</div>'+
        scoresBodyHTML+
      '</div>'+
    '</div>';
  }).join("")||'<div style="color:var(--text-dim);text-align:center;padding:20px">No matches yet</div>');

  document.querySelectorAll(".h2h-match-summary").forEach(function(el){
    el.addEventListener("click",function(){
      var body=this.nextElementSibling;
      body.classList.toggle("open");
    });
  });

  showTab("h2h");
}

function getPairMatches(pairName) {
  return getSessionsForPeriod().filter(function(s) {
    var t1 = [s.t1p1,s.t1p2].filter(function(n){return n&&n!=="undefined"&&n!=="";}).sort().join(" & ");
    var t2 = [s.t2p1,s.t2p2].filter(function(n){return n&&n!=="undefined"&&n!=="";}).sort().join(" & ");
    return t1 === pairName || t2 === pairName;
  }).sort(function(a,b){ return a.id-b.id; });
}
function showPairStats(pairName) {
  var matches = getPairMatches(pairName);
  var won=0, lost=0;
  matches.forEach(function(s) {
    var t1 = [s.t1p1,s.t1p2].filter(function(n){return n&&n!=="undefined"&&n!=="";}).sort().join(" & ");
    var isT1 = t1 === pairName;
    won += isT1 ? Number(s.t1wins) : Number(s.t2wins);
    lost += isT1 ? Number(s.t2wins) : Number(s.t1wins);
  });
  var tot = won+lost, rate = tot ? Math.round(won/tot*100) : 0;

  document.getElementById("pair-name").textContent = pairName;
  var rateEl = document.getElementById("pair-winrate");
  rateEl.textContent = rate+"%";
  rateEl.className = "player-winrate"+(rate<50?" low":"");
  document.getElementById("pair-record").textContent = won+"W — "+lost+"L • "+(won+lost)+" matches";

  H("pair-matches", matches.slice().reverse().map(function(s) {
    var t1 = [s.t1p1,s.t1p2].filter(function(n){return n&&n!=="undefined"&&n!=="";}).sort().join(" & ");
    var isT1 = t1 === pairName;
    var myWins = isT1 ? Number(s.t1wins) : Number(s.t2wins);
    var oppWins = isT1 ? Number(s.t2wins) : Number(s.t1wins);
    var oppName = isT1
      ? [s.t2p1,s.t2p2].filter(function(n){return n&&n!=="undefined";}).join(" & ")
      : [s.t1p1,s.t1p2].filter(function(n){return n&&n!=="undefined";}).join(" & ");
    var won = myWins > oppWins, draw = myWins === oppWins;
    var rc = draw?"d":won?"w":"l", rl = draw?"Draw":won?"Won":"Lost";
    var hasScores = s.scores && s.scores.length > 0;

    var scoresBodyHTML = "";
    if (hasScores) {
      scoresBodyHTML = '<div style="padding:8px 0">'+s.scores.map(function(sc,i){
        var gw = isT1 ? sc.t1>sc.t2 : sc.t2>sc.t1;
        var myScore = isT1 ? sc.t1 : sc.t2, oppScore = isT1 ? sc.t2 : sc.t1;
        return '<div class="game-score-row"><span class="game-label">Game '+(i+1)+'</span><span class="game-result '+(gw?"w":"l")+'">'+myScore+' — '+oppScore+'</span><span class="game-icon">'+(gw?"✅":"❌")+'</span></div>';
      }).join("")+"</div>";
    }

    return '<div class="h2h-match-card">'+
      '<div class="h2h-match-summary">'+
        '<div class="h2h-match-date">'+fmtDate(s.date)+'</div>'+
        '<div class="h2h-match-teams">vs '+oppName+'</div>'+
        gtBadge(s)+
        (hasScores?'<span style="font-size:11px">📊</span>':'')+
        '<div class="h2h-match-result '+rc+'">'+rl+'</div>'+
        '<span style="color:var(--text-dim);font-size:11px;margin-left:2px">›</span>'+
      '</div>'+
      '<div class="h2h-match-body">'+
        '<div style="font-family:monospace;font-size:13px;color:var(--text-dim);margin-top:8px">'+myWins+' — '+oppWins+' matches</div>'+
        scoresBodyHTML+
      '</div>'+
    '</div>';
  }).join("")||'<div style="color:var(--text-dim);text-align:center;padding:20px">No matches yet</div>');

  document.querySelectorAll("#pair-matches .h2h-match-summary").forEach(function(el){
    el.addEventListener("click",function(){
      var body=this.nextElementSibling;
      body.classList.toggle("open");
    });
  });

  showTab("pair");
}
