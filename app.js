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
var MATCH_DAY_START_HOUR = 3;
var MATCH_DAY_MIGRATION_KEY = "badmintonMatchDay3amMigratedV2";
var matchDayMigrationRunning = false;
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
var PINNED_PLAYER_KEY = "badmintonPinnedPlayer";
var pinnedPlayer = loadPinnedPlayer();

function loadPinnedPlayer() {
  try { return localStorage.getItem(PINNED_PLAYER_KEY) || null; }
  catch (e) { return null; }
}
function persistPinnedPlayer(name) {
  try {
    if (name) localStorage.setItem(PINNED_PLAYER_KEY, name);
    else localStorage.removeItem(PINNED_PLAYER_KEY);
  } catch (e) {}
}
function populateIdentityPicker() {
  var select = document.getElementById("identity-select");
  if (!select) return;
  if (!squadPlayers.length) {
    select.innerHTML = '<option value="">No squad members yet</option>';
    return;
  }
  select.innerHTML = '<option value="">Choose your name</option>' + squadPlayers.map(function(name) {
    return '<option value="'+name+'">'+name+'</option>';
  }).join("");
  if (pinnedPlayer && squadPlayers.indexOf(pinnedPlayer) > -1) select.value = pinnedPlayer;
}
function renderIdentityUI() {
  var main = document.getElementById("identity-main");
  if (!main) return;
  main.textContent = pinnedPlayer ? pinnedPlayer.charAt(0).toUpperCase() : "👤";
  main.classList.toggle("pinned", !!pinnedPlayer);
  main.setAttribute("aria-label", pinnedPlayer ? "Pinned as " + pinnedPlayer : "Pin yourself");
  main.title = pinnedPlayer ? "Pinned as " + pinnedPlayer : "Pin yourself";
  document.getElementById("identity-picker-title").textContent = pinnedPlayer ? "Pinned as " + pinnedPlayer : "Pin yourself";
  document.getElementById("identity-clear").style.display = pinnedPlayer ? "block" : "none";
  document.getElementById("identity-stats").style.display = pinnedPlayer ? "block" : "none";
  document.getElementById("history-win-filter").textContent = pinnedPlayer ? "My Wins" : "Team 1 Won";
  document.getElementById("history-loss-filter").textContent = pinnedPlayer ? "My Losses" : "Team 1 Lost";
  document.getElementById("history-pov").textContent = pinnedPlayer
    ? "Showing Won/Lost from " + pinnedPlayer + "'s perspective."
    : "Pin yourself to see wins and losses from your perspective.";
  populateIdentityPicker();
}
function setPinnedPlayer(name) {
  var previous = pinnedPlayer;
  pinnedPlayer = name || null;
  persistPinnedPlayer(pinnedPlayer);
  document.getElementById("identity-picker").classList.remove("open");
  if (pinnedPlayer && !editingKey && t1Selected.length === 0 && t2Selected.length === 0) {
    t1Selected = [pinnedPlayer];
  }
  if (previous && previous !== pinnedPlayer) {
    var staleIdx = lineupSelected.indexOf(previous);
    if (staleIdx > -1 && lineupSeededFor === previous) lineupSelected.splice(staleIdx, 1);
  }
  lineupSeededFor = null;
  seedLineupFromPin();
  renderIdentityUI();
  renderChips();
  renderLineupChips();
  renderLeaderboard();
  historyPage = 0;
  renderHistory();
}
function openPinnedPlayerStats() {
  document.getElementById("identity-picker").classList.remove("open");
  if (!pinnedPlayer) return;
  var hasStats = computeIndividual().some(function(player){ return player.name === pinnedPlayer; });
  if (!hasStats) {
    alert(pinnedPlayer + " has no matches in the selected Rankings filter.");
    return;
  }
  showPlayerStats(pinnedPlayer);
}

function isLocked(s) {
  if (!s.date) return false;
  return new Date() > getMatchDayLockTime(s.date);
}

function checkAdmin() {
  if (adminUnlocked) return true;
  var pin = prompt("Enter admin PIN:");
  if (pin === ADMIN_PIN) { adminUnlocked = true; return true; }
  alert("Wrong PIN!");
  return false;
}

function showTab(name) {
  ["leaderboard","history","add","player","h2h","rules","winners","pair","pair-duel"].forEach(function(t) {
    var tab = document.getElementById("tab-"+t);
    tab.classList.remove("active");
    tab.style.display = "none";
    var n = document.getElementById("nav-"+t);
    if (n) n.classList.remove("active");
  });
  var targetTab = document.getElementById("tab-"+name);
  targetTab.classList.add("active");
  targetTab.style.display = "block";
  var n = document.getElementById("nav-"+name);
  if (n) n.classList.add("active");
}

document.getElementById("nav-leaderboard").addEventListener("click", function(){ showTab("leaderboard"); });
document.getElementById("nav-history").addEventListener("click", function(){ showTab("history"); });
document.getElementById("nav-add").addEventListener("click", function(){ resetForm(); showTab("add"); seedLineupFromPin(); renderLineupChips(); });
document.getElementById("nav-rules").addEventListener("click", function(){ showTab("rules"); });
document.getElementById("refresh-btn").addEventListener("click", renderAll);
document.getElementById("identity-main").addEventListener("click", function(e) {
  e.stopPropagation();
  populateIdentityPicker();
  document.getElementById("identity-picker").classList.toggle("open");
});
document.getElementById("identity-stats").addEventListener("click", function(e) {
  e.stopPropagation();
  openPinnedPlayerStats();
});
document.getElementById("identity-save").addEventListener("click", function(e) {
  e.stopPropagation();
  var name = document.getElementById("identity-select").value;
  if (name) setPinnedPlayer(name);
});
document.getElementById("identity-clear").addEventListener("click", function(e) {
  e.stopPropagation();
  setPinnedPlayer(null);
});
document.getElementById("identity-picker").addEventListener("click", function(e){ e.stopPropagation(); });
document.addEventListener("click", function(e) {
  if (!e.target.closest(".identity-bar")) document.getElementById("identity-picker").classList.remove("open");
});
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
document.getElementById("back-from-pair-duel").addEventListener("click", function(){ showTab("pair"); });
document.getElementById("champion-banner").addEventListener("click", function(){ resetWinnersView(); renderMonthlyWinners(); showTab("winners"); });
document.getElementById("back-from-winners").addEventListener("click", function(){ resetWinnersView(); showTab("leaderboard"); });
document.getElementById("back-from-winner-month").addEventListener("click", function(){ resetWinnersView(); });

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
  if (pinnedPlayer && squadPlayers.indexOf(pinnedPlayer) === -1) {
    pinnedPlayer = null;
    persistPinnedPlayer(null);
  }
  if (pinnedPlayer && !editingKey && t1Selected.length === 0 && t2Selected.length === 0) {
    t1Selected = [pinnedPlayer];
  }
  seedLineupFromPin();
  renderIdentityUI();
  renderChips(); renderSquadTags(); renderLineupChips();
  renderLeaderboard();
  historyPage = 0; renderHistory();
});
onValue(matchesRef, function(snap) {
  var d = snap.val();
  sessions = [];
  if (d) { Object.keys(d).forEach(function(k){ var s=d[k]; s.firebaseKey=k; sessions.push(s); }); }
  sessions.sort(function(a,b){ return b.id-a.id; });
  historyPage = 0;
  sessionsLoaded = true;
  migrateExistingMatchDayDates();
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
  if (pinnedPlayer) {
    if (!inMatch(s,pinnedPlayer)) return false;
    var result = getResult(s,pinnedPlayer);
    if (resultFilter==="win") return result==="W";
    if (resultFilter==="loss") return result==="L";
  }
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
  editingKey=null;t1Selected=(pinnedPlayer&&squadPlayers.indexOf(pinnedPlayer)>-1)?[pinnedPlayer]:[];t2Selected=[];gameType="21";
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
  document.getElementById("t1wins").value=s.t1wins;document.getElementById("t2wins").value=s.t2wins;
  document.getElementById("save-btn").textContent="Update Match";document.getElementById("cancel-btn").style.display="block";
  document.getElementById("form-title").textContent="Edit Match · "+fmtDate(s.date);
  document.getElementById("btn-21").classList.toggle("active",gameType==="21");
  document.getElementById("btn-11").classList.toggle("active",gameType==="11");
  renderChips();showTab("add");
}
async function handleSave() {
  var existing = editingKey ? sessions.find(function(s){ return s.firebaseKey === editingKey; }) : null;
  var date = existing && existing.date ? existing.date : getTodayString();
  var t1w=document.getElementById("t1wins").value,t2w=document.getElementById("t2wins").value;
  var errEl=document.getElementById("form-err"),sucEl=document.getElementById("form-suc"),btn=document.getElementById("save-btn");
  errEl.style.display="none";sucEl.style.display="none";
  if(t1w===""||t2w===""){errEl.textContent="Please fill in all fields!";errEl.style.display="block";return;}
  if(t1Selected.length!==2||t2Selected.length!==2){errEl.textContent="Please select 2 players for each team!";errEl.style.display="block";return;}
  if (!editingKey) {
    if (new Date() > getMatchDayLockTime(date) && !checkAdmin()) {
      errEl.textContent = "This date is locked (past 3am next day). Admin PIN required.";
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
function getRecentFormDotsHTML(name, limit) {
  limit = limit || 5;
  var results = playerMatches(name).map(function(s) { return getResult(s, name); }).slice(-limit);
  if (!results.length) return "";
  return '<div class="lb-form">' + results.map(function(r) {
    return '<span class="lb-dot '+(r==="W"?"win":r==="L"?"loss":"draw")+'"></span>';
  }).join("") + '</div>';
}
function getPairResult(s, pairName) {
  var t1 = [s.t1p1,s.t1p2].filter(function(n){return n&&n!=="undefined"&&n!=="";}).sort().join(" & ");
  var isT1 = t1 === pairName;
  var t1w = Number(s.t1wins), t2w = Number(s.t2wins);
  if (isT1) return t1w > t2w ? "W" : t1w < t2w ? "L" : "D";
  return t2w > t1w ? "W" : t2w < t1w ? "L" : "D";
}
function getRecentPairFormDotsHTML(pairName, limit) {
  limit = limit || 5;
  var results = getPairMatches(pairName).map(function(s) { return getPairResult(s, pairName); }).slice(-limit);
  if (!results.length) return "";
  return '<div class="lb-form">' + results.map(function(r) {
    return '<span class="lb-dot '+(r==="W"?"win":r==="L"?"loss":"draw")+'"></span>';
  }).join("") + '</div>';
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
  var monthMatches = getSessionsForPeriod().filter(function(s){ return inMatch(s,n); }).sort(function(a,b){ return a.id-b.id; });
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
  var monthMatches = getSessionsForPeriod().filter(function(s){ return inMatch(s,n); }).sort(function(a,b){ return a.id-b.id; });
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
  var monthMatches = getSessionsForPeriod().filter(function(s){ return inMatch(s,n); });
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
  var monthMatches = getSessionsForPeriod().filter(function(s){ return inMatch(s,n); });
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

/* ── Flair (trash titles / nemesis / prestige) — display only, never affects ranking ──
   Everything below is scoped to the active leaderboard filter. Titles are awarded by
   comparing players against each other *within that filter*, and every threshold scales
   with how many matches the filter contains, so All Time and This Month give different
   winners instead of repeating the same end-of-list streak. */
var flairCache = null;
function resetFlairCache() { flairCache = null; }
function getFlairPeriodLabel() {
  return formatFilterLabel(leaderboardFilterLabel || "Selected Period");
}
function getFlairMatchesFor(n) {
  return getSessionsForPeriod().filter(function(s){ return inMatch(s,n); }).sort(function(a,b){ return a.id-b.id; });
}
function buildFlairContext() {
  var ordered = getSessionsForPeriod().slice().sort(function(a,b){ return a.id-b.id; });
  var players = {};
  var allDays = {};

  ordered.forEach(function(s) {
    if (s.date) allDays[s.date] = true;
    [s.t1p1,s.t1p2,s.t2p1,s.t2p2].forEach(function(n) {
      if (!n || n === "undefined" || n === "") return;
      if (!players[n]) players[n] = { name:n, results:[], wins:0, losses:0, decided:0, w21:0, l21:0, w11:0, l11:0, days:{}, vs:{} };
      var pl = players[n];
      var result = getResult(s,n);
      pl.results.push(result);
      if (s.date) pl.days[s.date] = true;
      if (result !== "D") {
        if (result === "W") pl.wins++; else pl.losses++;
        pl.decided++;
        if ((s.gameType||"21") === "11") { if (result === "W") pl.w11++; else pl.l11++; }
        else { if (result === "W") pl.w21++; else pl.l21++; }
      }
      var onT1 = inT1(s,n);
      var mine = onT1 ? Number(s.t1wins) : Number(s.t2wins);
      var theirs = onT1 ? Number(s.t2wins) : Number(s.t1wins);
      getOpponentsFor(s,n).forEach(function(o) {
        if (!pl.vs[o]) pl.vs[o] = { name:o, mine:0, theirs:0, sessions:0, lastResult:null };
        pl.vs[o].mine += mine;
        pl.vs[o].theirs += theirs;
        pl.vs[o].sessions++;
        if (result !== "D") pl.vs[o].lastResult = result;
      });
    });
  });

  var names = Object.keys(players);
  var totalDays = Object.keys(allDays).length;
  var maxMatches = 0;

  names.forEach(function(n) {
    var pl = players[n];
    pl.matches = pl.results.length;
    pl.daysPlayed = Object.keys(pl.days).length;
    pl.rate = pl.decided ? (pl.wins/pl.decided)*100 : 0;
    maxMatches = Math.max(maxMatches, pl.matches);

    var type = null, count = 0;
    for (var i = pl.results.length-1; i >= 0; i--) {
      var r = pl.results[i];
      if (r === "D") break;
      if (type === null) { type = r; count = 1; }
      else if (r === type) count++;
      else break;
    }
    pl.streakType = type;
    pl.streakCount = count;
    pl.streakNotable = count >= Math.max(3, Math.ceil(pl.matches * 0.2));

    pl.n21 = pl.w21 + pl.l21;
    pl.n11 = pl.w11 + pl.l11;
    pl.r21 = pl.n21 ? (pl.w21/pl.n21)*100 : 0;
    pl.r11 = pl.n11 ? (pl.w11/pl.n11)*100 : 0;
    pl.gap11 = (pl.n21 >= 2 && pl.n11 >= 2) ? pl.r11 - pl.r21 : 0;
  });

  var minSample = Math.max(3, Math.ceil(maxMatches * 0.25));

  function pick(eligible, better) {
    var winner = null;
    names.forEach(function(n) {
      var pl = players[n];
      if (!eligible(pl)) return;
      if (!winner || better(pl, players[winner])) winner = n;
    });
    return winner;
  }

  var sup = {};
  sup.hotStreak = pick(
    function(pl){ return pl.streakType === "W" && pl.streakNotable; },
    function(a,b){ return a.streakCount > b.streakCount || (a.streakCount === b.streakCount && a.matches > b.matches); }
  );
  sup.coldStreak = pick(
    function(pl){ return pl.streakType === "L" && pl.streakNotable; },
    function(a,b){ return a.streakCount > b.streakCount || (a.streakCount === b.streakCount && a.matches > b.matches); }
  );
  sup.bestRate = pick(
    function(pl){ return pl.decided >= minSample; },
    function(a,b){ return a.rate > b.rate || (a.rate === b.rate && a.decided > b.decided); }
  );
  sup.worstRate = pick(
    function(pl){ return pl.decided >= minSample; },
    function(a,b){ return a.rate < b.rate || (a.rate === b.rate && a.decided > b.decided); }
  );
  if (sup.bestRate && sup.bestRate === sup.worstRate) sup.worstRate = null;
  sup.sniper11 = pick(
    function(pl){ return pl.gap11 >= 15; },
    function(a,b){ return a.gap11 > b.gap11; }
  );
  sup.grinder21 = pick(
    function(pl){ return pl.gap11 <= -15; },
    function(a,b){ return a.gap11 < b.gap11; }
  );
  sup.mostPresent = totalDays >= 2 ? pick(
    function(pl){ return pl.daysPlayed >= totalDays; },
    function(a,b){ return a.matches > b.matches; }
  ) : null;
  sup.leastPresent = (totalDays >= 3 && names.length >= 3) ? pick(
    function(pl){ return pl.daysPlayed <= Math.max(1, Math.floor(totalDays * 0.4)); },
    function(a,b){ return a.daysPlayed < b.daysPlayed || (a.daysPlayed === b.daysPlayed && a.matches < b.matches); }
  ) : null;

  var standings = computeIndividual();
  var top = standings.find(function(pl){ return pl.qualified && (pl.won+pl.lost) > 0; });

  return { players: players, names: names, totalDays: totalDays, minSample: minSample, sup: sup, leaderName: top ? top.name : null };
}
function getFlairContext() {
  if (!flairCache) flairCache = buildFlairContext();
  return flairCache;
}
function computeFlairStreak(n) {
  var pl = getFlairContext().players[n];
  if (!pl || !pl.streakCount || !pl.streakType) return null;
  return { type: pl.streakType, count: pl.streakCount };
}
function getFlairLeaderName() {
  return getFlairContext().leaderName;
}
function computeTrashTalkFlair(n) {
  var ctx = getFlairContext();
  var pl = ctx.players[n];
  if (!pl || !pl.matches) return null;
  var sup = ctx.sup;
  var periodLabel = getFlairPeriodLabel();

  if (sup.hotStreak === n) {
    return { id: "court-bully", icon: "🔥", label: "Court Bully", body: pl.streakCount + "-win streak · hottest notable run in " + periodLabel + ". One superlative per filter." };
  }
  if (sup.coldStreak === n) {
    return { id: "free-points", icon: "❄️", label: "Free Points", body: pl.streakCount + "-loss streak · coldest notable run in " + periodLabel + "." };
  }
  if (sup.bestRate === n) {
    return { id: "problem-child", icon: "😈", label: "Problem Child", body: Math.round(pl.rate) + "% win rate · best in " + periodLabel + " (min sample)." };
  }
  if (sup.worstRate === n) {
    return { id: "charity-case", icon: "🎁", label: "Charity Case", body: Math.round(pl.rate) + "% win rate · lowest in " + periodLabel + " (min sample)." };
  }
  if (sup.sniper11 === n) {
    return { id: "sniper11", icon: "🎯", label: "11-pt Sniper", body: "Much stronger in 11-point games than 21s in " + periodLabel + "." };
  }
  if (sup.grinder21 === n) {
    return { id: "grinder21", icon: "⚙️", label: "Grinder", body: "Much stronger in 21-point games than 11s in " + periodLabel + "." };
  }
  if (sup.mostPresent === n) {
    return { id: "no-days-off", icon: "📆", label: "No Days Off", body: "Played every match day in " + periodLabel + "." };
  }
  if (sup.leastPresent === n) {
    return { id: "cameo", icon: "👋", label: "Cameo Appearance", body: "Fewest match days in " + periodLabel + "." };
  }
  if (pl.streakType === "W" && pl.streakCount >= 2) {
    return { id: "heating-up", icon: "🌡️", label: "Heating Up", body: pl.streakCount + "-win streak right now in " + periodLabel + "." };
  }
  if (pl.streakType === "L" && pl.streakCount >= 2) {
    return { id: "thin-ice", icon: "🧊", label: "On Thin Ice", body: pl.streakCount + "-loss streak right now in " + periodLabel + "." };
  }
  if (pl.decided >= 3 && pl.rate >= 60) {
    return { id: "quietly-cooking", icon: "🍳", label: "Quietly Cooking", body: Math.round(pl.rate) + "% win rate without a superlative crown in " + periodLabel + "." };
  }
  if (pl.decided >= 3 && pl.rate <= 40) {
    return { id: "bench-warmer", icon: "🪑", label: "Bench Warmer", body: Math.round(pl.rate) + "% win rate · struggling but not last in " + periodLabel + "." };
  }
  return { id: "in-the-mix", icon: "🎭", label: "In the Mix", body: "No trash-talk superlative this filter — middle of the pack vibes in " + periodLabel + "." };
}
function computeTrashTalkTitle(n) {
  var flair = computeTrashTalkFlair(n);
  return flair ? flair.label : null;
}
function buildTrashTitleHTML(trash) {
  if (!trash) return "";
  return '<button type="button" class="trash-title-tip tag-tip" aria-expanded="false">'+
    '<span class="tag-tip-label">"'+escAttr(trash.label)+'"</span>'+
    '<span class="tag-pop" role="tooltip">'+
      '<span class="tag-pop-title">'+trash.icon+' '+escAttr(trash.label)+'</span>'+
      '<span class="tag-pop-body">'+escAttr(trash.body)+'</span>'+
    '</span>'+
  '</button>';
}
function computeNemesis(n) {
  var pl = getFlairContext().players[n];
  if (!pl || !pl.matches) return null;
  var minMeetings = Math.max(2, Math.min(6, Math.ceil(pl.matches * 0.15)));
  var best = null;
  Object.keys(pl.vs).forEach(function(o) {
    var row = pl.vs[o];
    if (row.sessions < minMeetings) return;
    var deficit = row.theirs - row.mine;
    if (deficit <= 0) return;
    if (!best || deficit > best.deficit || (deficit === best.deficit && row.sessions > best.sessions) || (deficit === best.deficit && row.sessions === best.sessions && o < best.name)) {
      best = { name: row.name, mine: row.mine, theirs: row.theirs, sessions: row.sessions, deficit: deficit, lastResult: row.lastResult };
    }
  });
  if (!best) return null;
  return {
    name: best.name,
    mine: best.mine,
    theirs: best.theirs,
    sessions: best.sessions,
    lastResult: best.lastResult,
    struck: best.lastResult === "W"
  };
}
function computeKingmakerName(leaderName) {
  if (!leaderName) return null;
  var partners = {};
  getSessionsForPeriod().forEach(function(s) {
    if (!inMatch(s, leaderName)) return;
    if (getResult(s, leaderName) !== "W") return;
    var mate = getPartnerFor(s, leaderName);
    if (!mate) return;
    partners[mate] = (partners[mate] || 0) + 1;
  });
  var best = null, bestWins = 0;
  Object.keys(partners).forEach(function(p) {
    if (partners[p] > bestWins || (partners[p] === bestWins && (!best || p < best))) {
      bestWins = partners[p];
      best = p;
    }
  });
  return bestWins >= 2 ? best : null;
}
function computeAssassinName(leaderName) {
  if (!leaderName) return null;
  var winsOverLeader = {};
  getSessionsForPeriod().forEach(function(s) {
    if (!inMatch(s, leaderName)) return;
    if (getResult(s, leaderName) !== "L") return;
    getOpponentsFor(s, leaderName).forEach(function(p) {
      if (!p || p === "undefined" || p === leaderName) return;
      winsOverLeader[p] = (winsOverLeader[p] || 0) + 1;
    });
  });
  var best = null, bestWins = 0;
  Object.keys(winsOverLeader).forEach(function(p) {
    if (winsOverLeader[p] > bestWins || (winsOverLeader[p] === bestWins && (!best || p < best))) {
      bestWins = winsOverLeader[p];
      best = p;
    }
  });
  return bestWins >= 1 ? { name: best, wins: bestWins } : null;
}
function computePrestigeTitles(n) {
  var ctx = getFlairContext();
  var pl = ctx.players[n];
  if (!pl) return [];
  var titles = [];

  var dominatorAt = Math.max(5, Math.ceil(pl.matches * 0.25));
  if (pl.streakType === "W" && pl.streakCount >= dominatorAt) {
    titles.push({ id: "dominator", icon: "👑", label: "Dominator", hint: pl.streakCount + "-win streak · " + getFlairPeriodLabel() });
  }

  var leaderName = ctx.leaderName;
  var assassin = computeAssassinName(leaderName);
  if (assassin && assassin.name === n) {
    titles.push({ id: "assassin", icon: "🗡️", label: "Assassin", hint: assassin.wins + " win" + (assassin.wins !== 1 ? "s" : "") + " over #1 " + leaderName });
  }

  var kingmaker = computeKingmakerName(leaderName);
  if (kingmaker && kingmaker === n) {
    titles.push({ id: "kingmaker", icon: "♟️", label: "Kingmaker", hint: "Best partner of #1 · " + leaderName });
  }
  return titles;
}
function buildPlayerFlair(n) {
  return {
    trash: computeTrashTalkFlair(n),
    nemesis: computeNemesis(n),
    prestige: computePrestigeTitles(n)
  };
}
function computePartnerChemistry(name) {
  var partners = {};
  getSessionsForPeriod().forEach(function(s) {
    if (!inMatch(s, name)) return;
    var mate = getPartnerFor(s, name);
    if (!mate) return;
    if (!partners[mate]) partners[mate] = { won: 0, lost: 0, total: 0 };
    var weight = wt(s);
    var result = getResult(s, name);
    partners[mate].total += weight;
    if (result === "W") partners[mate].won += weight;
    else if (result === "L") partners[mate].lost += weight;
  });
  return Object.keys(partners).map(function(p) {
    var row = partners[p];
    var decided = row.won + row.lost;
    return {
      name: p,
      won: row.won,
      lost: row.lost,
      total: row.total,
      rate: decided ? Math.round(row.won / decided * 100) : 0
    };
  }).filter(function(r) { return r.total > 0; }).sort(function(a, b) {
    return b.total - a.total || b.rate - a.rate || a.name.localeCompare(b.name);
  });
}
function buildPartnerChemistryHTML(name) {
  var rows = computePartnerChemistry(name);
  if (!rows.length) return "";
  var heading = (pinnedPlayer === name ? "Your " : name + "'s ") + "Partner Chemistry · " + getFlairPeriodLabel();
  return '<div class="sec-hdr">'+heading+'</div><div class="chem-box">'+
    rows.map(function(r) {
      var tone = r.rate >= 50 ? "up" : "down";
      return '<div class="chem-row">'+
        '<div class="chem-top"><span class="chem-name">'+r.name+'</span><span class="chem-rate '+tone+'">'+r.rate+'%</span></div>'+
        '<div class="chem-bar"><div class="chem-fill '+tone+'" style="width:'+r.rate+'%"></div></div>'+
        '<div class="chem-meta">'+r.won.toFixed(1)+'W — '+r.lost.toFixed(1)+'L · '+r.total.toFixed(1)+' games</div>'+
      '</div>';
    }).join("")+
  '</div>';
}
function escAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function buildAchievementSuperlatives() {
  var standings = computeIndividual();
  var qualified = standings.filter(function(p) { return p.qualified && (p.won + p.lost) > 0; });
  var ctx = getFlairContext();
  var topDog = qualified.length ? qualified[0].name : null;
  var podium = qualified.slice(1, 3).map(function(p) { return p.name; });

  var attendanceKing = null, maxDays = -1;
  ctx.names.forEach(function(n) {
    var days = ctx.players[n].daysPlayed;
    if (days > maxDays) { maxDays = days; attendanceKing = n; }
    else if (days === maxDays && attendanceKing && n < attendanceKing) attendanceKing = n;
  });
  if (maxDays < 2) attendanceKing = null;

  var lastLaughWinners = [];
  var ordered = getSessionsForPeriod().slice().sort(function(a, b) { return a.id - b.id; });
  if (ordered.length) {
    var last = ordered[ordered.length - 1];
    [last.t1p1, last.t1p2, last.t2p1, last.t2p2].forEach(function(n) {
      if (!n || n === "undefined") return;
      if (getResult(last, n) === "W" && lastLaughWinners.indexOf(n) === -1) lastLaughWinners.push(n);
    });
  }

  var iceKing = null, maxLossStreak = 0;
  ctx.names.forEach(function(n) {
    var pl = ctx.players[n];
    if (pl.streakType === "L" && pl.streakCount >= 4 && pl.streakCount > maxLossStreak) {
      maxLossStreak = pl.streakCount;
      iceKing = n;
    }
  });

  var h2hKing = null, maxH2hCount = -1;
  ctx.names.forEach(function(n) {
    var pl = ctx.players[n];
    var count = 0;
    Object.keys(pl.vs).forEach(function(o) {
      if (pl.vs[o].sessions >= 3 && pl.vs[o].mine > pl.vs[o].theirs) count++;
    });
    if (count > maxH2hCount) { maxH2hCount = count; h2hKing = n; }
  });
  if (maxH2hCount < 2) h2hKing = null;

  return { topDog: topDog, podium: podium, attendanceKing: attendanceKing, lastLaughWinners: lastLaughWinners, iceKing: iceKing, h2hKing: h2hKing };
}
function hasWhitewashDay(name) {
  var byDay = {};
  playerMatches(name).forEach(function(s) {
    if (!s.date) return;
    if (!byDay[s.date]) byDay[s.date] = { w: 0, l: 0 };
    var r = getResult(s, name);
    if (r === "W") byDay[s.date].w++;
    else if (r === "L") byDay[s.date].l++;
  });
  return Object.keys(byDay).some(function(d) { return byDay[d].w >= 3 && byDay[d].l === 0; });
}
function hasBounceBack(name) {
  var results = playerMatches(name).map(function(s) { return getResult(s, name); });
  var i = 0;
  while (i < results.length) {
    var lossRun = 0;
    while (i < results.length && results[i] === "L") { lossRun++; i++; }
    if (lossRun >= 4) {
      var winRun = 0;
      while (i < results.length && results[i] === "W") { winRun++; i++; }
      if (winRun >= 4) return true;
    } else {
      i++;
    }
  }
  return false;
}
function hasBeatEveryoneCareer(name) {
  if (!squadPlayers.length) return false;
  var beaten = {};
  sessions.forEach(function(s) {
    if (!inMatch(s, name) || getResult(s, name) !== "W") return;
    getOpponentsFor(s, name).forEach(function(o) { beaten[o] = true; });
  });
  return squadPlayers.every(function(p) { return p === name || beaten[p]; });
}
function countMonthlyChampionWins(name) {
  return computeMonthlyWinnersList().filter(function(r) { return r.winners.indexOf(name) > -1; }).length;
}
function computeAchievements(name) {
  var achievements = [];
  var periodLabel = getFlairPeriodLabel();
  var pl = getFlairContext().players[name];
  if (!pl || !pl.matches) return achievements;

  var bestStreak = computeBestStreak(name);
  var chemistry = computePartnerChemistry(name);
  var careerGames = sessions.filter(function(s) { return inMatch(s, name); }).length;
  var superlatives = buildAchievementSuperlatives();
  var totalDays = getTotalMatchDaysThisMonth();
  var leaderName = getFlairLeaderName();
  var nemesis = computeNemesis(name);
  var champWins = countMonthlyChampionWins(name);

  function add(id, icon, label, body) {
    achievements.push({ id: id, icon: icon, label: label, body: body });
  }

  if (superlatives.topDog === name) {
    add("top-dog", "🐕", "Top Dog", "Ranked #1 in " + periodLabel + ".");
  }
  if (superlatives.podium.indexOf(name) > -1) {
    add("podium", "🥉", "Podium", "Top 3 in " + periodLabel + " after qualification rules.");
  }
  if (superlatives.attendanceKing === name) {
    add("attendance-king", "📅", "Attendance King", "Most match days played in " + periodLabel + " (" + pl.daysPlayed + " days).");
  }
  if (superlatives.lastLaughWinners.indexOf(name) > -1) {
    add("last-laugh", "😏", "Last Laugh", "On the winning side of the most recent match in " + periodLabel + ".");
  }
  if (superlatives.iceKing === name) {
    add("ice-king", "🧊", "Ice King", "Longest active loss streak in the squad (" + pl.streakCount + " straight).");
  }
  if (superlatives.h2hKing === name) {
    add("h2h-king", "👊", "H2H King", "Winning game tally vs the most opponents (3+ meetings each) in " + periodLabel + ".");
  }

  if (pl.decided >= 8 && pl.losses === 0) {
    add("perfect-month", "💯", "Perfect Month", "100% win rate with " + pl.decided + "+ decided matches in " + periodLabel + ".");
  }
  if (totalDays >= 4 && pl.daysPlayed >= totalDays) {
    add("road-warrior", "🛣️", "Road Warrior", "Played every match day in " + periodLabel + " (" + totalDays + " days).");
  }
  if (chemistry.some(function(r) { return r.total >= 12 && r.rate >= 75; })) {
    var serial = chemistry.find(function(r) { return r.total >= 12 && r.rate >= 75; });
    add("serial-duo", "🔗", "Serial Duo", serial.rate + "% with " + serial.name + " across " + serial.total.toFixed(1) + " games · " + periodLabel + ".");
  }
  if (bestStreak >= 12) {
    add("streak-demon", "👹", "Streak Demon", bestStreak + "-match win streak at your peak in " + periodLabel + ".");
  }
  if ((pl.n21 >= 10 && pl.r21 >= 80) || (pl.n11 >= 10 && pl.r11 >= 80)) {
    var fmt = pl.n21 >= 10 && pl.r21 >= 80 ? "21-point" : "11-point";
    var fmtRate = Math.round(pl.n21 >= 10 && pl.r21 >= 80 ? pl.r21 : pl.r11);
    add("specialist", "🎯", "Specialist", fmtRate + "% in " + fmt + " games (10+ played) · " + periodLabel + ".");
  }
  if (hasWhitewashDay(name)) {
    add("whitewash", "🌊", "Whitewash", "At least one match day with 3+ wins and zero losses in " + periodLabel + ".");
  }
  if (hasBounceBack(name)) {
    add("bounce-back", "🔄", "Bounce Back", "Rallied from a 4+ loss run into a 4+ win run in " + periodLabel + ".");
  }

  if (leaderName && leaderName !== name) {
    var beatLeader = false;
    getFlairMatchesFor(name).forEach(function(s) {
      if (getOpponentsFor(s, name).indexOf(leaderName) > -1 && getResult(s, name) === "W") beatLeader = true;
    });
    if (beatLeader) {
      add("giant-killer", "⚔️", "Giant Killer", "Beat #" + leaderName + " at least once in " + periodLabel + ".");
    }
  }
  if (nemesis && nemesis.struck) {
    add("nemesis-slayer", "🗡️", "Nemesis Slayer", "Last meeting vs " + nemesis.name + " was a win (" + nemesis.mine + " — " + nemesis.theirs + " games).");
  }
  var oppKeys = Object.keys(pl.vs);
  if (oppKeys.length >= 2 && oppKeys.every(function(o) {
    return pl.vs[o].sessions >= 5 && pl.vs[o].mine > pl.vs[o].theirs;
  })) {
    add("bracket-buster", "💥", "Bracket Buster", "Winning games vs every opponent with 5+ meetings in " + periodLabel + ".");
  }

  if (pl.matches >= 15) add("iron-will", "🏋️", "Iron Will", pl.matches + " matches logged in " + periodLabel + ".");
  if (pl.streakType === "W" && pl.streakCount >= 5) add("hot-hand", "🔥", "Hot Hand", "On a " + pl.streakCount + "-win streak right now · " + periodLabel + ".");
  if (bestStreak >= 8) add("streak-machine", "⚡", "Streak Machine", "Best win streak of " + bestStreak + " in " + periodLabel + ".");
  if (pl.decided >= 10 && pl.rate >= 70) add("win-machine", "🏆", "Win Machine", Math.round(pl.rate) + "% win rate across " + pl.decided + "+ matches · " + periodLabel + ".");
  if (oppKeys.length >= 3 && oppKeys.every(function(o) { return pl.vs[o].sessions >= 1 && pl.vs[o].mine > pl.vs[o].theirs; })) {
    add("full-sweep", "🧹", "Full Sweep", "Winning game tally vs every opponent in " + periodLabel + ".");
  }
  if (chemistry.length && chemistry[0].total >= 8) {
    add("dynamic-duo", "🤝", "Dynamic Duo", chemistry[0].total.toFixed(1) + " games with " + chemistry[0].name + " · " + periodLabel + ".");
  }

  if (careerGames >= 200) add("immortal", "🏛️", "Immortal", careerGames + " career games logged all-time.");
  else if (careerGames >= 100) add("centurion", "💎", "Centurion", careerGames + " career games logged all-time.");
  else if (careerGames >= 50) add("veteran", "🎖️", "Veteran", careerGames + " career games logged all-time.");

  if (champWins >= 3) add("hall-of-fame", "🌟", "Hall of Fame", "Monthly champion " + champWins + " times.");
  else if (champWins >= 1) add("monthly-legend", "🏅", "Monthly Legend", "Past monthly champion.");
  if (hasBeatEveryoneCareer(name)) {
    add("beat-everyone", "🗺️", "Beat Everyone", "At least one win vs every squad member, all-time.");
  }

  return achievements;
}
function buildTagTipButton(className, icon, label, body) {
  return '<button type="button" class="tag tag-tip '+className+'" aria-expanded="false">'+
    '<span class="tag-tip-label">'+icon+' '+escAttr(label)+'</span>'+
    '<span class="tag-pop" role="tooltip">'+
      '<span class="tag-pop-title">'+icon+' '+escAttr(label)+'</span>'+
      '<span class="tag-pop-body">'+escAttr(body)+'</span>'+
    '</span>'+
  '</button>';
}
var PRESTIGE_DEFINITIONS = {
  dominator: "Win streak worth at least a quarter of your matches in this filter (min 5).",
  assassin: "Most wins over that filter's #1.",
  kingmaker: "Most wins partnering the current #1."
};
function buildPrestigeTagsHTML(titles) {
  return titles.map(function(t) {
    var body = (t.hint ? t.hint + " · " : "") + (PRESTIGE_DEFINITIONS[t.id] || "");
    return buildTagTipButton("prestige prestige-"+t.id, t.icon, t.label, body);
  }).join("");
}
function buildAchievementsHTML(name) {
  var items = computeAchievements(name);
  if (!items.length) return "";
  var heading = (pinnedPlayer === name ? "Your " : name + "'s ") + "Achievements";
  return '<div class="sec-hdr">'+heading+'</div><div class="achievements-box" id="achievements-box">'+
    items.map(function(a) {
      return buildTagTipButton("achievement", a.icon, a.label, a.body);
    }).join("")+
  '</div>';
}
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
function closeAllTagTips() {
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
function bindTagTips() {
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
function getEarnedMonthKey(appliedMonthKey) {
  var parts = appliedMonthKey.split("-");
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  var d = new Date(year, month - 2, 1);
  var m = d.getMonth() + 1;
  return d.getFullYear() + "-" + (m < 10 ? "0" + m : String(m));
}
function getEarnedMonthLabel(appliedMonthKey) {
  var key = getEarnedMonthKey(appliedMonthKey);
  var parts = key.split("-");
  return MONTHS[parseInt(parts[1], 10) - 1] + " " + parts[0];
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
  resetWinnersView();
  var results = computeMonthlyWinnersList();
  var el = document.getElementById("winners-list");
  if (!results.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🏅</div><p>No monthly winners recorded yet</p></div>';
    return;
  }
  el.innerHTML = results.map(function(r, i) {
    var medal = i === 0 ? "🥇" : (i === 1 ? "🥈" : "🏅");
    return '<div class="winner-row'+(i===0?" champ":"")+'" data-month="'+r.appliedMonth+'" role="button" tabindex="0" title="View '+r.earnedLabel+' leaderboard">' +
      '<div class="winner-medal">'+medal+'</div>' +
      '<div class="winner-month">'+r.earnedLabel+'</div>' +
      '<div class="winner-name">'+r.winners.join(" & ")+'</div>' +
      '<div class="winner-arr">›</div>' +
      '</div>';
  }).join("");
  el.querySelectorAll(".winner-row").forEach(function(row) {
    row.addEventListener("click", function() { showWinnerMonth(this.getAttribute("data-month")); });
    row.addEventListener("keydown", function(e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showWinnerMonth(this.getAttribute("data-month")); }
    });
  });
}
function resetWinnersView() {
  var listView = document.getElementById("winners-list-view");
  var monthView = document.getElementById("winners-month-view");
  var backToRankings = document.getElementById("back-from-winners");
  if (listView) listView.style.display = "block";
  if (monthView) monthView.style.display = "none";
  if (backToRankings) backToRankings.style.display = "block";
}
function computeIndividualForEarnedMonth(earnedMonthKey, appliedMonthKey) {
  var src = getSessionsForMonth(earnedMonthKey);
  var p = {};
  src.forEach(function(s) {
    var w = wt(s);
    [s.t1p1, s.t1p2].forEach(function(n) {
      if (!n || n === "undefined" || n === "") return;
      if (!p[n]) p[n] = { name: n, won: 0, lost: 0 };
      p[n].won += Number(s.t1wins) * w;
      p[n].lost += Number(s.t2wins) * w;
    });
    [s.t2p1, s.t2p2].forEach(function(n) {
      if (!n || n === "undefined" || n === "") return;
      if (!p[n]) p[n] = { name: n, won: 0, lost: 0 };
      p[n].won += Number(s.t2wins) * w;
      p[n].lost += Number(s.t1wins) * w;
    });
  });
  var arr = Object.values(p);
  var totalMatchDays = countTotalMatchDaysInSrc(src);
  arr.forEach(function(pl) {
    pl.matchDaysPlayed = countPlayerMatchDaysInSrc(src, pl.name);
    pl.matchDaysNeeded = Math.ceil(totalMatchDays * 0.5);
    pl.matchDaysTotal = totalMatchDays;
    pl.qualified = totalMatchDays === 0 ? true : pl.matchDaysPlayed >= totalMatchDays * 0.5;
    var adj = getAdjustmentForMonth(pl.name, appliedMonthKey);
    applyPlayerMeritFields(pl, totalMatchDays, adj);
  });
  return arr.sort(function(a, b) {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    return b.effectiveScore - a.effectiveScore || b.won - a.won;
  });
}
function buildWinnerMonthLeaderboardHTML(standings, championNames, periodTotalGames, totalMatchDays) {
  if (!standings.length) return emptyHTML("No standings for this month.");
  var qualifiedRank = 0;
  return '<div class="winners-month-lb">' + standings.map(function(p) {
    var tot = p.won + p.lost, rate = tot ? Math.round(p.won / tot * 100) : 0, low = rate < 50;
    var isChamp = championNames.indexOf(p.name) > -1;
    var adjHTML = "";
    if (p.brownie > 0) adjHTML += '<span class="tag brownie">🍪 +'+p.brownie+'%</span>';
    if (p.negative < 0) adjHTML += '<span class="tag penalty" title="'+(p.negativeReason||"")+'">⚠️ '+p.negative+'%</span>';

    if (p.qualified === false) {
      return '<div class="lb-row lb-row-static'+(isChamp?" winner-month-champ-row":"")+'" style="opacity:0.65">' +
        '<div class="rank-badge">—</div>' +
        '<div class="lb-main"><div class="lb-name">'+p.name+(isChamp?' <span class="winner-month-champ-tag">🏅</span>':"")+'</div>' +
          '<div class="lb-secondary"><span>Played '+p.matchDaysPlayed+' of '+p.matchDaysNeeded+' required days</span></div></div>' +
        '<div class="lb-stats"><div class="lb-rate'+(low?" low":"")+'" style="font-size:15px">'+rate+'%</div>' +
          '<div class="lb-detail">'+p.won.toFixed(1)+'W — '+p.lost.toFixed(1)+'L</div>' +
          '<div style="font-size:10px;color:var(--text-dim);font-weight:700;margin-top:2px">Building Data</div></div></div>';
    }

    var rankIdx = qualifiedRank;
    qualifiedRank++;
    var badgeClass = rankIdx === 0 ? "gold" : rankIdx === 1 ? "silver" : rankIdx === 2 ? "bronze" : "";
    var relativePct = formatAttendanceAdjustedWilsonDisplay(p.attendanceAdjustedWilsonScore);
    var relativePenalized = p.matchDaysPlayed < totalMatchDays;
    return '<div class="lb-row lb-row-static'+(rankIdx===0?" rank-1":"")+(isChamp?" winner-month-champ-row":"")+'">' +
      '<div class="rank-badge '+badgeClass+'">'+(rankIdx+1)+'</div>' +
      '<div class="lb-main"><div class="lb-name">'+p.name+(isChamp?' <span class="winner-month-champ-tag">🏅</span>':"")+'</div>' +
        (adjHTML ? '<div class="lb-secondary">'+adjHTML+'</div>' : '') + '</div>' +
      '<div class="lb-stats"><div class="lb-rate'+(low?" low":"")+'">'+rate+'%</div>' +
        '<div class="lb-detail">'+p.won.toFixed(1)+'W — '+p.lost.toFixed(1)+'L</div>' +
        '<div class="lb-relative'+(relativePenalized?" penalized":"")+'">'+relativePct+'% Merit</div>' +
        '<div class="lb-detail" style="opacity:0.7">'+p.matchDaysPlayed+'/'+totalMatchDays+' days played</div>' +
        '<div class="lb-bar"><div class="lb-bar-fill'+(low?" low":"")+'" style="width:'+rate+'%"></div></div>' +
      '</div></div>';
  }).join("") + '<div class="count">'+periodTotalGames.toFixed(1)+' match'+(periodTotalGames!==1?"es":"")+' recorded</div></div>';
}
function showWinnerMonth(appliedMonthKey) {
  var entry = computeMonthlyWinnersList().find(function(r) { return r.appliedMonth === appliedMonthKey; });
  if (!entry) return;

  var earnedMonthKey = getEarnedMonthKey(appliedMonthKey);
  var monthSessions = getSessionsForMonth(earnedMonthKey);
  var totalGames = 0;
  monthSessions.forEach(function(s) { totalGames += (Number(s.t1wins) + Number(s.t2wins)) * wt(s); });
  var totalMatchDays = countTotalMatchDaysInSrc(monthSessions);
  var standings = computeIndividualForEarnedMonth(earnedMonthKey, appliedMonthKey);

  document.getElementById("winners-list-view").style.display = "none";
  document.getElementById("winners-month-view").style.display = "block";
  document.getElementById("back-from-winners").style.display = "none";
  document.getElementById("winners-month-header").innerHTML =
    '<div class="winners-month-title">'+entry.earnedLabel+' Leaderboard</div>' +
    '<div class="winners-month-champ">🏅 '+entry.winners.join(" & ")+'</div>' +
    '<div class="winners-month-meta">'+totalGames.toFixed(1)+' match'+(totalGames!==1?"es":"")+' · '+totalMatchDays+' match day'+(totalMatchDays!==1?"s":"")+'</div>';

  document.getElementById("winners-month-content").innerHTML =
    buildWinnerMonthLeaderboardHTML(standings, entry.winners, totalGames, totalMatchDays);
}
function populateChampionBanner() {
  var results = computeMonthlyWinnersList();
  var banner = document.getElementById("champion-banner");
  banner.style.display = "none"; // Monthly Winners tab temporarily hidden - flip back to "flex" to re-enable
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
function shiftToMatchDayDate(d) {
  var copy = new Date(d);
  if (copy.getHours() < MATCH_DAY_START_HOUR) copy.setDate(copy.getDate() - 1);
  return copy;
}
function getMatchDayDateFrom(input) {
  var d = shiftToMatchDayDate(input ? new Date(input) : new Date());
  if (isNaN(d.getTime())) return null;
  return formatDateString(d);
}
function getMatchDayNow() {
  return shiftToMatchDayDate(new Date());
}
function formatDateString(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,"0");
  var day = String(d.getDate()).padStart(2,"0");
  return y + "-" + m + "-" + day;
}
function getMatchDayLockTime(dateStr) {
  var lockTime = new Date(dateStr);
  lockTime.setDate(lockTime.getDate() + 1);
  lockTime.setHours(MATCH_DAY_START_HOUR, 0, 0, 0);
  return lockTime;
}
function getTodayString() {
  return getMatchDayDateFrom();
}
function isTodayMatchDay() {
  var dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return weeklyPattern.indexOf(dayNames[getMatchDayNow().getDay()]) > -1;
}
async function migrateExistingMatchDayDates() {
  if (matchDayMigrationRunning) return;
  try {
    if (localStorage.getItem(MATCH_DAY_MIGRATION_KEY) === "1") return;
  } catch (e) { return; }
  if (!sessionsLoaded || !sessions.length) return;

  var payload = {};
  var now = Date.now();
  sessions.forEach(function(s) {
    if (!s.firebaseKey || !s.id) return;
    var savedAt = Number(s.id);
    if (!savedAt || savedAt < 1577836800000 || savedAt > now + 86400000) return;
    var correctDate = getMatchDayDateFrom(savedAt);
    if (!correctDate || correctDate === s.date) return;
    payload["matches/" + s.firebaseKey + "/date"] = correctDate;
  });

  if (!Object.keys(payload).length) {
    try { localStorage.setItem(MATCH_DAY_MIGRATION_KEY, "1"); } catch (e) {}
    return;
  }

  matchDayMigrationRunning = true;
  try {
    await update(ref(db), payload);
    try { localStorage.setItem(MATCH_DAY_MIGRATION_KEY, "1"); } catch (e) {}
  } catch (e) {
    console.error("Match day migration failed:", e);
  } finally {
    matchDayMigrationRunning = false;
  }
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
  return getAdjustmentForMonth(name, getCurrentMonthKey());
}
function getAdjustmentForMonth(name, monthKey) {
  if (monthlyAdjustments[monthKey] && monthlyAdjustments[monthKey][name]) {
    var a = monthlyAdjustments[monthKey][name];
    return { brownie: Number(a.brownie) || 0, negative: Number(a.negative) || 0, negativeReason: a.negativeReason || "" };
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
  var src = getSessionsThisMonthAlways(); // always genuinely THIS MONTH, independent of the Rankings filter toggle
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
    // Blend skill (stable, whole-month competence) with momentum (recent streak) into
    // ONE balancing signal. Skill is the foundation; momentum nudges it up or down, capped
    // so a very long streak can't completely dominate the blend. Uses a dedicated,
    // always-This-Month streak calculation (NOT computeStreaks, which depends on whatever
    // filter happens to be active on Rankings - same bug class we just fixed for pairing counts).
    function getThisMonthStreak(name) {
      var m = getSessionsThisMonthAlways().filter(function(s){ return inMatch(s,name); }).sort(function(a,b){ return a.id-b.id; });
      if (!m.length) return null;
      var results = m.map(function(s){ return getResult(s,name); });
      var last = results[results.length-1], streak = 1;
      for (var i = results.length-2; i >= 0; i--) {
        if (results[i] === last) streak++; else break;
      }
      return { type: last, count: streak };
    }
    function getBlendedScore(name) {
      var skillRate = getThisMonthRawRate(name);
      var streak = getThisMonthStreak(name);
      if (!streak) return skillRate;
      var cappedCount = Math.min(streak.count, 5);
      var momentumAdj = cappedCount * 4 * (streak.type === "W" ? 1 : -1);
      return skillRate + momentumAdj;
    }
    var blendedScores = {};
    players.forEach(function(p){ blendedScores[p] = getBlendedScore(p); });

    function scoreSplit(split, c) {
      return split.reduce(function(sum, pair) { return sum + getPairCount(c, pair[0], pair[1]); }, 0);
    }
    function balanceImbalancePenalty(split) {
      return split.reduce(function(sum, pair) {
        var gap = Math.abs(blendedScores[pair[0]] - blendedScores[pair[1]]);
        return sum + (200 - gap); // reward a BIG gap (strong/hot + weak/cold together)
      }, 0);
    }
    var PAIRING_WEIGHT = 1000;
    function combinedScore(split, c) {
      return scoreSplit(split, c) * PAIRING_WEIGHT + balanceImbalancePenalty(split);
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
var lineupSeededFor = null;

function seedLineupFromPin() {
  if (!pinnedPlayer || squadPlayers.indexOf(pinnedPlayer) === -1) return;
  if (lineupSeededFor === pinnedPlayer) return;
  lineupSeededFor = pinnedPlayer;
  if (lineupSelected.indexOf(pinnedPlayer) === -1 && lineupSelected.length < 6) lineupSelected.push(pinnedPlayer);
}

function renderLineupChips() {
  var pool = squadPlayers;
  var el = document.getElementById("lineup-chips");
  if (!pool.length) {
    el.innerHTML = '<div style="color:var(--text-dim);font-size:12px">Add players in Manage Squad below first</div>';
    return;
  }
  el.innerHTML = pool.map(function(p) {
    var sel = lineupSelected.indexOf(p) > -1;
    var youTag = p === pinnedPlayer ? '<span class="chip-you">you</span>' : "";
    return '<button class="chip'+(sel?" sel-t1":"")+'" data-lp="'+p+'">'+p+youTag+'</button>';
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

function calculateWilsonScoreLowerBound(wins, losses, z) {
  z = z == null ? 2.1 : z;
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
function calculateAttendanceAdjustedWilsonScore(wins, losses, daysPlayed, totalMatchDays) {
  var wilsonPerformance = calculateWilsonScoreLowerBound(wins, losses, 2.1);
  var attendanceRatio = 1;
  if (totalMatchDays > 0) {
    attendanceRatio = daysPlayed / totalMatchDays;
    if (attendanceRatio < 0) attendanceRatio = 0;
    if (attendanceRatio > 1) attendanceRatio = 1;
  }
  var attendancePenalty = (1 - attendanceRatio) * 10;
  return wilsonPerformance - attendancePenalty;
}
function formatAttendanceAdjustedWilsonDisplay(score) {
  if (typeof score !== "number" || isNaN(score)) return "0.0";
  return (Math.round(score * 10) / 10).toFixed(1);
}
function formatMeritCalcValue(n, decimals) {
  if (typeof n !== "number" || isNaN(n)) n = 0;
  return (Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals)).toFixed(decimals);
}
function buildMeritCalculationRows(pl) {
  var wins = pl.won;
  var losses = pl.lost;
  var totalGames = wins + losses;
  var rawRate = totalGames ? (wins / totalGames) * 100 : 0;
  var wilson = calculateWilsonScoreLowerBound(wins, losses, 2.1);
  var daysPlayed = pl.matchDaysPlayed != null ? pl.matchDaysPlayed : 0;
  var totalMatchDays = pl.matchDaysTotal != null ? pl.matchDaysTotal : countTotalMatchDaysInSrc(getSessionsForPeriod());
  var attendanceRatio = 1;
  if (totalMatchDays > 0) {
    attendanceRatio = daysPlayed / totalMatchDays;
    if (attendanceRatio < 0) attendanceRatio = 0;
    if (attendanceRatio > 1) attendanceRatio = 1;
  }
  var attendancePenalty = (1 - attendanceRatio) * 10;
  var merit = wilson - attendancePenalty;

  var winsStr = formatMeritCalcValue(wins, 1);
  var totalStr = formatMeritCalcValue(totalGames, 1);
  var rawStr = formatMeritCalcValue(rawRate, 1);
  var wilsonStr = formatMeritCalcValue(wilson, 1);
  var ratioStr = formatMeritCalcValue(attendanceRatio, 2);
  var penaltyStr = formatMeritCalcValue(attendancePenalty, 1);
  var meritStr = formatMeritCalcValue(merit, 1);

  function row(label, formula, result) {
    return '<div class="merit-calc-row">' +
      '<div class="merit-calc-label">' + label + '</div>' +
      '<div class="merit-calc-formula">' + formula + '</div>' +
      '<div class="merit-calc-result">' + result + '</div>' +
    '</div>';
  }

  return row(
    "Win Rate",
    "Wins (" + winsStr + ") / Total Games (" + totalStr + ") × 100",
    "= " + rawStr + "%"
  ) + row(
    "Wilson Performance",
    "Wilson Score (z = 2.1)",
    "= " + wilsonStr + "%"
  ) + row(
    "Attendance",
    "Days Played (" + daysPlayed + ") / Match Days (" + totalMatchDays + ")",
    "= " + ratioStr
  ) + row(
    "Attendance Penalty",
    "(1 − Attendance(" + ratioStr + ")) × 10",
    "= " + penaltyStr
  ) + row(
    "Merit",
    wilsonStr + " − " + penaltyStr,
    "= " + meritStr + "%"
  );
}
function buildMeritStatBoxHTML(pl, meritDisplay) {
  return '<div class="stat-box merit-stat-tip tag-tip" role="button" tabindex="0" aria-expanded="false" aria-label="Merit calculation">' +
    '<div class="stat-val accent">' + escAttr(meritDisplay) + '</div>' +
    '<div class="stat-lbl">Merit</div>' +
    '<span class="tag-pop merit-calc-pop" role="tooltip">' +
      '<span class="tag-pop-title">🏅 Merit Calculation</span>' +
      '<div class="merit-calc-body">' + buildMeritCalculationRows(pl) + '</div>' +
    '</span>' +
  '</div>';
}
function applyPlayerMeritFields(pl, totalMatchDays, adj) {
  adj = adj || { brownie: 0, negative: 0, negativeReason: "" };
  var rawRate = pl.won + pl.lost ? (pl.won / (pl.won + pl.lost)) * 100 : 0;
  pl.rawRate = rawRate;
  pl.matchDaysTotal = totalMatchDays;
  pl.matchDaysNeeded = Math.ceil(totalMatchDays * 0.5);
  var attendanceRatio = totalMatchDays > 0 ? (pl.matchDaysPlayed / totalMatchDays) : 1;
  pl.attendanceRatio = attendanceRatio;
  pl.brownie = adj.brownie;
  pl.negative = adj.negative;
  pl.negativeReason = adj.negativeReason;
  pl.rankedScore = (rawRate * attendanceRatio) + adj.negative;
  pl.attendanceAdjustedWilsonScore = calculateAttendanceAdjustedWilsonScore(pl.won, pl.lost, pl.matchDaysPlayed, totalMatchDays);
  pl.effectiveScore = pl.attendanceAdjustedWilsonScore + adj.negative;
}
function computeIndividual(srcOverride) {
  var p={};
  var src = srcOverride || getSessionsForPeriod();
  if (!srcOverride && leaderboardPeriod === "month") {
    getHistoricallyActivePlayers().forEach(function(n){ p[n]={name:n,won:0,lost:0}; });
  }
  src.forEach(function(s){var w=wt(s);[s.t1p1,s.t1p2].forEach(function(n){if(!n||n==="undefined"||n==="")return;if(!p[n])p[n]={name:n,won:0,lost:0};p[n].won+=Number(s.t1wins)*w;p[n].lost+=Number(s.t2wins)*w;});[s.t2p1,s.t2p2].forEach(function(n){if(!n||n==="undefined"||n==="")return;if(!p[n])p[n]={name:n,won:0,lost:0};p[n].won+=Number(s.t2wins)*w;p[n].lost+=Number(s.t1wins)*w;});});
  var arr = Object.values(p);
  if (leaderboardPeriod === "alltime") {
    var ALLTIME_MIN_MATCH_DAYS = 5;
    arr.forEach(function(pl) {
      if (srcOverride) {
        pl.matchDaysPlayed = countPlayerMatchDaysInSrc(src, pl.name);
        pl.matchDaysTotal = countTotalMatchDaysInSrc(src);
        pl.qualified = pl.matchDaysPlayed >= ALLTIME_MIN_MATCH_DAYS;
      } else {
        var att = getAllTimeAttendanceForPlayer(pl.name);
        pl.matchDaysPlayed = att.attended;
        pl.matchDaysTotal = att.total;
        pl.firstMatchDate = getPlayerFirstMatchDate(pl.name);
        pl.qualified = att.attended >= ALLTIME_MIN_MATCH_DAYS;
      }
      pl.matchDaysNeeded = ALLTIME_MIN_MATCH_DAYS;
      applyPlayerMeritFields(pl, pl.matchDaysTotal, { brownie: 0, negative: 0, negativeReason: "" });
    });
  } else {
    var totalMatchDays = countTotalMatchDaysInSrc(src);
    arr.forEach(function(pl) {
      pl.matchDaysPlayed = countPlayerMatchDaysInSrc(src, pl.name);
      pl.qualified = totalMatchDays === 0 ? true : pl.matchDaysPlayed >= totalMatchDays * 0.5;
      var adj;
      if (leaderboardPeriod === "month") {
        adj = getAdjustmentFor(pl.name);
      } else if (leaderboardPeriod === "customMonth") {
        adj = getAdjustmentForMonth(pl.name, customMonthValue || getCurrentMonthKey());
      } else {
        adj = { brownie: 0, negative: 0, negativeReason: "" };
      }
      applyPlayerMeritFields(pl, totalMatchDays, adj);
    });
  }
  return arr.sort(function(a,b){
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    return b.effectiveScore-a.effectiveScore||b.won-a.won;
  });
}
function computePairs(srcOverride) {
  var p={};
  var src = srcOverride || getSessionsForPeriod();
  src.forEach(function(s){var w=wt(s);var p1=[s.t1p1,s.t1p2].filter(function(n){return n&&n!=="undefined"&&n!=="";}).sort().join(" & ");var p2=[s.t2p1,s.t2p2].filter(function(n){return n&&n!=="undefined"&&n!=="";}).sort().join(" & ");if(p1){if(!p[p1])p[p1]={name:p1,won:0,lost:0};p[p1].won+=Number(s.t1wins)*w;p[p1].lost+=Number(s.t2wins)*w;}if(p2){if(!p[p2])p[p2]={name:p2,won:0,lost:0};p[p2].won+=Number(s.t2wins)*w;p[p2].lost+=Number(s.t1wins)*w;}});
  return Object.values(p).sort(function(a,b){var ra=a.won+a.lost?a.won/(a.won+a.lost):0,rb=b.won+b.lost?b.won/(b.won+b.lost):0;return rb-ra||b.won-a.won;});
}
function countTotalMatchDaysInSrc(src) {
  var days = {};
  src.forEach(function(s) { if (s.date) days[s.date] = true; });
  return Object.keys(days).length;
}
function countPlayerMatchDaysInSrc(src, name) {
  var days = {};
  src.forEach(function(s) {
    if (!s.date) return;
    if ([s.t1p1,s.t1p2,s.t2p1,s.t2p2].indexOf(name) > -1) days[s.date] = true;
  });
  return Object.keys(days).length;
}
function getPreviousPeriodSessions() {
  var current = getSessionsForPeriod();
  var dates = {};
  current.forEach(function(s) { if (s.date) dates[s.date] = true; });
  var sorted = Object.keys(dates).sort();
  if (sorted.length < 2) return [];
  var latest = sorted[sorted.length - 1];
  return current.filter(function(s) { return s.date !== latest; });
}
function buildQualifiedRankMap(standings, kind) {
  var map = {};
  var rank = 0;
  standings.forEach(function(pl) {
    if (kind === "player" && pl.qualified === false) return;
    if (pl.won + pl.lost <= 0) return;
    map[pl.name] = rank;
    rank++;
  });
  return map;
}
function computeRankMovementMap(kind) {
  var compute = kind === "pair" ? computePairs : computeIndividual;
  var currentMap = buildQualifiedRankMap(compute(), kind);
  var prevSessions = getPreviousPeriodSessions();
  var previousMap = prevSessions.length ? buildQualifiedRankMap(compute(prevSessions), kind) : {};
  var movement = {};
  Object.keys(currentMap).forEach(function(name) {
    var currentRank = currentMap[name];
    if (!(name in previousMap)) {
      movement[name] = { type: "new" };
      return;
    }
    var delta = previousMap[name] - currentRank;
    if (delta > 0) movement[name] = { type: "up", amount: delta };
    else if (delta < 0) movement[name] = { type: "down", amount: Math.abs(delta) };
    else movement[name] = { type: "same" };
  });
  return movement;
}
function renderRankMovementBadge(name, movementMap) {
  var m = movementMap[name];
  if (!m) return "";
  if (m.type === "up") return '<span class="rank-move rank-move-up rank-move-animate" title="Moved up '+m.amount+'">↑'+m.amount+'</span>';
  if (m.type === "down") return '<span class="rank-move rank-move-down rank-move-animate" title="Moved down '+m.amount+'">↓'+m.amount+'</span>';
  if (m.type === "new" || m.type === "same") return "";
  return "";
}

function renderLeaderboard() {
  resetFlairCache();
  var periodSessions = getSessionsForPeriod();
  var periodTotalGames = 0;
  periodSessions.forEach(function(s){ periodTotalGames += ((Number(s.t1wins)||0) + (Number(s.t2wins)||0)) * wt(s); });
  var playerMovement = computeRankMovementMap("player");
  var pairMovement = computeRankMovementMap("pair");
  function rows(data,clickable,kind){
    kind = kind || "player";
    var attrName = kind === "pair" ? "data-pair" : "data-player";
    var movementMap = kind === "pair" ? pairMovement : playerMovement;
    if(!data.length)return emptyHTML();
    var qualifiedRank = 0;
    return(clickable?'<div class="tap-hint">Tap '+(kind==="pair"?"a pair":"a player")+' to see stats</div>':"")+
      data.map(function(p){
        var tot=p.won+p.lost,rate=tot?Math.round(p.won/tot*100):0,low=rate<50;
        var isMe = kind === "player" && pinnedPlayer === p.name;
        var meHTML = isMe ? '<span class="you-label">YOU</span>' : "";
        var sHTML="";
        if(clickable&&kind==="player"){var st=computeStreaks(p.name);if(st&&st.count>=2){if(st.type==="W")sHTML='<span class="tag hot">🔥 won last '+st.count+'</span>';else if(st.type==="L")sHTML='<span class="tag cold">❄️ lost last '+st.count+'</span>';}}
        var flair = (clickable && kind === "player") ? buildPlayerFlair(p.name) : null;
        var trashHTML = (flair && flair.trash) ? '<span class="trash-title">"'+flair.trash.label+'"</span>' : "";
        var prestigeCornerHTML = "";
        if (flair && flair.prestige.length) {
          prestigeCornerHTML = '<div class="lb-prestige-corner">' + flair.prestige.map(function(t){
            var tip = t.label + (t.hint ? " · " + t.hint : "");
            return '<span class="tag prestige icon-only prestige-'+t.id+'" title="'+tip+'" aria-label="'+tip+'">'+t.icon+'</span>';
          }).join("") + '</div>';
        }
        var nemesisHTML = (flair && flair.nemesis) ? '<span class="tag nemesis" title="'+getFlairPeriodLabel()+' nemesis">💀 '+flair.nemesis.name+'</span>' : "";

        var formHTML = clickable
          ? (kind === "player" ? getRecentFormDotsHTML(p.name) : getRecentPairFormDotsHTML(p.name))
          : '<div class="lb-bar"><div class="lb-bar-fill'+(low?" low":"")+'" style="width:'+rate+'%"></div></div>';

        if (p.qualified === false) {
          return '<div class="lb-row'+(isMe?" is-me":"")+(prestigeCornerHTML?" has-prestige":"")+'" '+attrName+'="'+p.name+'" style="opacity:0.65">'+
            prestigeCornerHTML+
            '<div class="rank-badge">—</div>'+
            '<div class="lb-main"><div class="lb-name">'+p.name+meHTML+trashHTML+'</div>'+
              '<div class="lb-secondary">'+sHTML+nemesisHTML+'<span>Played '+p.matchDaysPlayed+' of '+p.matchDaysNeeded+' required days</span></div></div>'+
            '<div class="lb-stats"><div class="lb-rate'+(low?" low":"")+'" style="font-size:15px">'+rate+'%</div><div class="lb-detail">'+p.won.toFixed(1)+'W — '+p.lost.toFixed(1)+'L</div><div style="font-size:10px;color:var(--text-dim);font-weight:700;margin-top:2px">Building Data</div>'+((clickable && kind === "player") ? getRecentFormDotsHTML(p.name) : "")+'</div></div>';
        }

        var rankIdx = qualifiedRank;
        qualifiedRank++;
        var badgeClass = rankIdx===0?"gold":rankIdx===1?"silver":rankIdx===2?"bronze":"";
        var adjHTML = "";
        if (p.brownie > 0) adjHTML += '<span class="tag brownie">🍪 +'+p.brownie+'%</span>';
        if (p.negative < 0) adjHTML += '<span class="tag penalty" title="'+(p.negativeReason||"")+'">⚠️ '+p.negative+'%</span>';

        var showMerit = kind === "player" && typeof p.attendanceAdjustedWilsonScore === "number";
        var heroNumber, subLine1, subLine2, subLine3 = "";
        if (showMerit) {
          heroNumber = rate;
          subLine1 = '<span class="lb-detail">'+p.won.toFixed(1)+'W — '+p.lost.toFixed(1)+'L</span>';
          var meritPct = formatAttendanceAdjustedWilsonDisplay(p.attendanceAdjustedWilsonScore);
          var periodDays = p.matchDaysTotal != null ? p.matchDaysTotal : countTotalMatchDaysInSrc(periodSessions);
          var meritPenalized = p.matchDaysPlayed < periodDays;
          subLine2 = '<div class="lb-relative'+(meritPenalized?" penalized":"")+'">'+meritPct+'% Merit</div>';
          if (leaderboardPeriod === "alltime") {
            subLine3 = '<div class="lb-detail" style="opacity:0.7">Played '+p.matchDaysPlayed+' of '+periodDays+' match-days</div>';
            if (p.firstMatchDate) {
              var fmParts = p.firstMatchDate.split("-");
              var fmMonthLabel = MONTHS[parseInt(fmParts[1])-1];
              subLine3 += '<div class="lb-detail" style="opacity:0.55">(since '+fmMonthLabel+')</div>';
            }
          } else {
            subLine3 = '<div class="lb-detail" style="opacity:0.7">'+p.matchDaysPlayed+'/'+periodDays+' days played</div>';
          }
        } else {
          heroNumber = rate;
          subLine1 = '<span class="lb-detail">'+p.won.toFixed(1)+'W — '+p.lost.toFixed(1)+'L</span>';
          subLine2 = '<div class="lb-detail" style="opacity:0.7">'+tot.toFixed(1)+' matches</div>';
        }

        var secondary = sHTML + adjHTML + nemesisHTML;
        var moveBadge = renderRankMovementBadge(p.name, movementMap);
        return '<div class="lb-row'+(rankIdx===0?" rank-1":"")+(isMe?" is-me":"")+(prestigeCornerHTML?" has-prestige":"")+'" '+attrName+'="'+p.name+'">'+
          prestigeCornerHTML+
          '<div class="rank-badge '+badgeClass+'">'+(rankIdx+1)+moveBadge+'</div>'+
          '<div class="lb-main"><div class="lb-name">'+p.name+meHTML+trashHTML+'</div>'+(secondary?'<div class="lb-secondary">'+secondary+'</div>':'')+'</div>'+
          '<div class="lb-stats"><div class="lb-rate'+(low?" low":"")+'">'+heroNumber+'%</div><div class="lb-detail">'+subLine1+'</div>'+subLine2+subLine3+formHTML+'</div></div>';
      }).join("")+'<div class="count">'+periodTotalGames.toFixed(1)+' match'+(periodTotalGames!==1?"es":"")+" recorded</div>";
  }
  H("lb-individual",rows(computeIndividual(),true,"player"));
  H("lb-pairs",rows(computePairs(),true,"pair"));
  document.querySelectorAll("[data-player]").forEach(function(row){row.addEventListener("click",function(){showPlayerStats(this.getAttribute("data-player"));});});
  document.querySelectorAll("[data-pair]").forEach(function(row){row.addEventListener("click",function(){showPairStats(this.getAttribute("data-pair"));});});
}

function sessionCardHTML(s) {
  var locked = isLocked(s);
  var t1w=Number(s.t1wins),t2w=Number(s.t2wins),t1IsWin=t1w>t2w,isDraw=t1w===t2w;
  var hasPinnedPov = !!pinnedPlayer && inMatch(s,pinnedPlayer);
  var povResult = hasPinnedPov ? getResult(s,pinnedPlayer) : (isDraw?"D":t1IsWin?"W":"L");
  var rc=povResult==="D"?"draw":povResult==="W"?"":"loss";
  var rl=povResult==="D"?"Draw":povResult==="W"?(hasPinnedPov?"Your Win":"Won"):(hasPinnedPov?"Your Loss":"Lost");
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
      '<span class="summary-score'+(povResult==="W"?"":" loss")+'">'+t1w+'—'+t2w+'</span>'+
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
        '<div class="team-side"><div class="team-side-name">'+t1n+'</div><div class="team-side-score'+(t1IsWin?"":isDraw?"":" loss")+'">'+t1w+'</div></div>'+
        '<div class="vs-divider">vs</div>'+
        '<div class="team-side"><div class="team-side-name">'+t2n+'</div><div class="team-side-score'+(t1IsWin?" loss":isDraw?"":"")+'">'+t2w+'</div></div>'+
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

function buildPlayerFormChartHTML(name) {
  var matches = playerMatches(name);
  var n = matches.length;
  var periodLabel = getFlairPeriodLabel();
  if (!n) {
    return '<div class="sec-hdr">Form · '+periodLabel+'</div><div class="form-chart-card form-chart-empty">No matches in this filter yet.</div>';
  }

  var results = [];
  var values = [0];
  var net = 0;
  matches.forEach(function(s) {
    var r = getResult(s, name);
    results.push(r);
    if (r === "W") net++;
    else if (r === "L") net--;
    values.push(net);
  });

  var endNet = values[values.length - 1];
  var peak = values.reduce(function(best, val) { return Math.max(best, val); }, 0);
  var low = values.reduce(function(best, val) { return Math.min(best, val); }, 0);
  var yMin = Math.min(0, low);
  var yMax = Math.max(0, peak);
  var yPad = Math.max(1, Math.ceil((yMax - yMin) * 0.12));
  if (yMin === yMax) { yMin = -1; yMax = 1; }
  else { yMin -= yPad; yMax += yPad; }
  var yRange = yMax - yMin || 1;

  var W = 320, H = 128;
  var padL = 30, padR = 10, padT = 12, padB = 24;
  var cW = W - padL - padR;
  var cH = H - padT - padB;

  function yAt(val) {
    return padT + (1 - (val - yMin) / yRange) * cH;
  }
  function pointAt(i, val) {
    var x = padL + (i / n) * cW;
    return { x: x, y: yAt(val) };
  }

  var coords = values.map(function(val, i) { return pointAt(i, val); });
  var linePath = coords.map(function(p, i) { return (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
  var zeroY = yAt(0).toFixed(1);
  var areaPath = linePath +
    " L" + coords[coords.length - 1].x.toFixed(1) + " " + zeroY +
    " L" + coords[0].x.toFixed(1) + " " + zeroY + " Z";

  var tickVals = [];
  tickVals.push(yMax);
  if (yMin < 0 && yMax > 0) tickVals.push(0);
  else if (yMin >= 0) tickVals.push(0);
  tickVals.push(yMin);
  tickVals = tickVals.filter(function(v, i, arr) { return arr.indexOf(v) === i; }).sort(function(a, b) { return b - a; });

  var gridLines = tickVals.map(function(val) {
    var y = yAt(val).toFixed(1);
    var isZero = val === 0;
    return '<line class="form-chart-grid'+(isZero?" form-chart-grid-zero":"")+'" x1="'+padL+'" y1="'+y+'" x2="'+(padL+cW)+'" y2="'+y+'"'+(isZero?' stroke-dasharray="4 3"':"")+'/>';
  }).join("");

  var yLabels = tickVals.map(function(val) {
    var label = val > 0 ? "+"+val : String(val);
    return '<text class="form-chart-axis-y" x="'+(padL-6)+'" y="'+(yAt(val)+3).toFixed(1)+'" text-anchor="end">'+label+'</text>';
  }).join("");

  var xLabels = '<text class="form-chart-axis-x" x="'+padL+'" y="'+(H-6)+'" text-anchor="start">0</text>'+
    '<text class="form-chart-axis-x" x="'+(padL+cW)+'" y="'+(H-6)+'" text-anchor="end">'+n+'</text>';

  var showDots = n <= 24;
  var dots = showDots ? coords.slice(1).map(function(p, i) {
    var cls = results[i] === "W" ? "form-chart-dot win" : results[i] === "L" ? "form-chart-dot loss" : "form-chart-dot draw";
    return '<circle class="'+cls+'" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="2.6"/>';
  }).join("") : "";

  var lineSegments = "";
  for (var si = 1; si < coords.length; si++) {
    var segCls = values[si] > values[si - 1] ? "up" : values[si] < values[si - 1] ? "down" : "flat";
    lineSegments += '<path class="form-chart-line-seg '+segCls+'" d="M'+coords[si-1].x.toFixed(1)+' '+coords[si-1].y.toFixed(1)+' L'+coords[si].x.toFixed(1)+' '+coords[si].y.toFixed(1)+'"/>';
  }

  var trendCls = endNet > 0 ? "up" : endNet < 0 ? "down" : "flat";
  var nowDisplay = endNet > 0 ? "+"+endNet : String(endNet);
  var trendText = endNet > 0 ? "↑ +"+endNet+" net" : endNet < 0 ? "↓ "+endNet+" net" : "→ even";
  var fillTop = endNet >= 0 ? "rgba(110,201,149,0.2)" : "rgba(226,112,127,0.16)";

  return '<div class="sec-hdr">Form · '+periodLabel+'</div>'+
    '<div class="form-chart-card">'+
      '<div class="form-chart-top">'+
        '<span class="form-chart-now form-chart-change '+trendCls+'">'+nowDisplay+'</span>'+
        '<span class="form-chart-meta">'+n+' match'+(n!==1?"es":"")+' · <span class="form-chart-change '+trendCls+'">'+trendText+'</span></span>'+
      '</div>'+
      '<svg class="form-chart-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-label="Net wins over '+n+' matches in '+periodLabel+'">'+
        '<defs><linearGradient id="formChartFill" x1="0" y1="0" x2="0" y2="1">'+
          '<stop offset="0%" stop-color="'+fillTop+'"/>'+
          '<stop offset="100%" stop-color="rgba(10,12,17,0)"/>'+
        '</linearGradient></defs>'+
        gridLines +
        yLabels +
        xLabels +
        '<path class="form-chart-area" d="'+areaPath+'" fill="url(#formChartFill)"/>'+
        lineSegments +
        dots +
        '<circle class="form-chart-end '+trendCls+'" cx="'+coords[coords.length-1].x.toFixed(1)+'" cy="'+coords[coords.length-1].y.toFixed(1)+'" r="3.2"/>'+
      '</svg>'+
      '<div class="form-chart-foot">'+
        '<span>Start 0</span>'+
        '<span>High '+(peak>0?"+"+peak:peak)+'</span>'+
        '<span>Low '+(low>0?"+"+low:low)+'</span>'+
        '<span>Now '+nowDisplay+'</span>'+
      '</div>'+
    '</div>';
}

function showPlayerStats(name) {
  currentPlayer=name;
  resetFlairCache();
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

  var flair = buildPlayerFlair(name);
  var trashEl = document.getElementById("p-trash-title");
  if (flair.trash) {
    trashEl.innerHTML = buildTrashTitleHTML(flair.trash);
    trashEl.style.display = "block";
  } else {
    trashEl.innerHTML = "";
    trashEl.style.display = "none";
  }
  if (flair.prestige.length) {
    H("p-prestige", buildPrestigeTagsHTML(flair.prestige));
  } else {
    H("p-prestige", "");
  }

  var meritDisplay = typeof pl.attendanceAdjustedWilsonScore === "number"
    ? formatAttendanceAdjustedWilsonDisplay(pl.attendanceAdjustedWilsonScore) + "%"
    : "—";

  H("stats-grid",
    '<div class="stat-box"><div class="stat-val accent">'+bs+'</div><div class="stat-lbl">Best Streak</div></div>'+
    buildMeritStatBoxHTML(pl, meritDisplay)+
    '<div class="stat-box"><div class="stat-val accent" style="font-size:14px">'+(bp||"—")+'</div><div class="stat-lbl">Best Partner</div></div>'+
    '<div class="stat-box"><div class="stat-val loss" style="font-size:14px">'+(tg||"—")+'</div><div class="stat-lbl">Toughest Opp</div></div>'+
    '<div class="stat-box wide"><div class="gt-split">'+
      '<div style="text-align:center"><div class="stat-val accent">'+r21+'%</div><div class="stat-lbl">21pt Win Rate</div><div style="font-size:11px;color:var(--text-dim);font-family:monospace;margin-top:4px">'+w21+'W — '+l21+'L</div></div>'+
      '<div style="width:1px;height:36px;background:var(--border-soft)"></div>'+
      '<div style="text-align:center"><div class="stat-val accent">'+r11+'%</div><div class="stat-lbl">11pt Win Rate</div><div style="font-size:11px;color:var(--text-dim);font-family:monospace;margin-top:4px">'+w11+'W — '+l11+'L</div></div>'+
    '</div></div>'
  );

  H("achievements-section", buildAchievementsHTML(name));
  H("form-chart-section", buildPlayerFormChartHTML(name));
  H("partner-chemistry-section", buildPartnerChemistryHTML(name));

  if (flair.nemesis) {
    var nem = flair.nemesis;
    var gap = nem.theirs - nem.mine;
    H("nemesis-section",
      '<div class="sec-hdr">Nemesis</div>'+
      '<div class="nemesis-row'+(nem.struck?" struck":"")+'" id="nemesis-card" data-opp="'+nem.name+'" role="button" tabindex="0" title="Tap for head to head">'+
        '<span class="nemesis-ico">💀</span>'+
        '<span class="nemesis-copy">'+
          '<span class="nemesis-name">'+nem.name+'</span>'+
          '<span class="nemesis-meta">'+nem.mine+' — '+nem.theirs+' · -'+gap+' games</span>'+
        '</span>'+
        '<span class="nemesis-badge'+(nem.struck?" struck":"")+'">'+(nem.struck?"struck":"rival")+'</span>'+
        '<span class="nemesis-arr">›</span>'+
      '</div>'
    );
    var nemCard = document.getElementById("nemesis-card");
    if (nemCard) {
      nemCard.addEventListener("click", function(){ showH2H(name, this.getAttribute("data-opp")); });
    }
  } else {
    H("nemesis-section", "");
  }

  var insightsHTML = "";
  var partnerStreak = computePartnerStreakInsight(name);
  var opponentStreak = computeOpponentStreakInsight(name);
  var partnerWinRate = computePartnerWinRateInsight(name);
  var gameTypeGap = computeGameTypeInsight(name);

  var isSelf = pinnedPlayer === name;
  var streakLead = isSelf ? "You've" : name + " has";
  var possessive = isSelf ? "Your" : name + "'s";

  if (partnerStreak) {
    var icon1 = partnerStreak.type === "W" ? "🔥" : "❄️";
    var verb1 = partnerStreak.type === "W" ? "won" : "lost";
    insightsHTML += '<div class="insight-row">'+icon1+' '+streakLead+' '+verb1+' the last '+partnerStreak.count+' alongside '+partnerStreak.partner+'</div>';
  }
  if (opponentStreak) {
    var icon2 = opponentStreak.type === "W" ? "🔥" : "❄️";
    var verb2 = opponentStreak.type === "W" ? "won" : "lost";
    insightsHTML += '<div class="insight-row">'+icon2+' '+streakLead+' '+verb2+' the last '+opponentStreak.count+' against '+opponentStreak.opponent+'</div>';
  }
  if (partnerWinRate) {
    var icon3 = partnerWinRate.diff > 0 ? "📈" : "📉";
    var verb3 = partnerWinRate.diff > 0 ? "jumps" : "drops";
    insightsHTML += '<div class="insight-row">'+icon3+' '+possessive+' win rate '+verb3+' with '+partnerWinRate.partner+'<div class="insight-sub">'+Math.round(partnerWinRate.overallRate)+'% overall → '+Math.round(partnerWinRate.partnerRate)+'% together ('+partnerWinRate.matches+' matches)</div></div>';
  }
  if (gameTypeGap) {
    var gapLead = isSelf ? "You play better at " : name + " plays better at ";
    insightsHTML += '<div class="insight-row">🎯 '+gapLead+gameTypeGap.better+' than '+gameTypeGap.worse+'<div class="insight-sub">'+Math.round(gameTypeGap.betterRate)+'% vs '+Math.round(gameTypeGap.worseRate)+'%</div></div>';
  }

  if (insightsHTML) {
    var insightsHeading = (isSelf ? "Your " : name + "'s ") + getFlairPeriodLabel() + " Insights";
    H("insights-section", '<div class="sec-hdr">'+insightsHeading+'</div><div class="insights-box">'+insightsHTML+'</div>');
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
  bindTagTips();
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

  var opponentStats = {};
  matches.forEach(function(s) {
    var t1 = [s.t1p1,s.t1p2].filter(function(n){return n&&n!="undefined"&&n!=="";}).sort().join(" & ");
    var isT1 = t1 === pairName;
    var oppName = isT1
      ? [s.t2p1,s.t2p2].filter(function(n){return n&&n!="undefined";}).join(" & ")
      : [s.t1p1,s.t1p2].filter(function(n){return n&&n!="undefined";}).join(" & ");
    if (!oppName) return;
    if (!opponentStats[oppName]) opponentStats[oppName] = { wins: 0, losses: 0, matches: 0 };
    var myWins = isT1 ? Number(s.t1wins) : Number(s.t2wins);
    var oppWins = isT1 ? Number(s.t2wins) : Number(s.t1wins);
    opponentStats[oppName].matches++;
    if (myWins > oppWins) opponentStats[oppName].wins++;
    else if (myWins < oppWins) opponentStats[oppName].losses++;
  });
  var oppList = Object.keys(opponentStats).sort();
  if (!oppList.length) {
    document.getElementById("pair-duel-summary").innerHTML = '<div style="color:var(--text-dim);font-size:13px">No duel records yet</div>';
  } else {
    document.getElementById("pair-duel-summary").innerHTML = oppList.map(function(opp){
      var stat = opponentStats[opp];
      var cls = stat.wins > stat.losses ? "win" : stat.wins < stat.losses ? "loss" : "draw";
      return '<div class="h2h-row" data-pair-duel="'+opp+'" style="margin-bottom:8px"><div class="h2h-opp">vs '+opp+'</div><div class="h2h-score '+cls+'">'+stat.wins+' — '+stat.losses+'</div><div class="h2h-arr">›</div></div>';
    }).join("");
    document.querySelectorAll("[data-pair-duel]").forEach(function(row){
      row.addEventListener("click",function(){
        var selectedOpp = this.getAttribute("data-pair-duel");
        var filtered = matches.filter(function(s){
          var t1 = [s.t1p1,s.t1p2].filter(function(n){return n&&n!="undefined"&&n!=="";}).sort().join(" & ");
          var isT1 = t1 === pairName;
          var oppName = isT1
            ? [s.t2p1,s.t2p2].filter(function(n){return n&&n!="undefined";}).join(" & ")
            : [s.t1p1,s.t1p2].filter(function(n){return n&&n!="undefined";}).join(" & ");
          return oppName === selectedOpp;
        }).slice().reverse();

        var duelWins = 0, duelLosses = 0;
        filtered.forEach(function(s){
          var t1 = [s.t1p1,s.t1p2].filter(function(n){return n&&n!="undefined"&&n!=="";}).sort().join(" & ");
          var isT1 = t1 === pairName;
          var myWins = isT1 ? Number(s.t1wins) : Number(s.t2wins);
          var oppWins = isT1 ? Number(s.t2wins) : Number(s.t1wins);
          if (myWins > oppWins) duelWins++; else if (myWins < oppWins) duelLosses++;
        });

        document.getElementById("pair-duel-p1-name").textContent = pairName;
        document.getElementById("pair-duel-p2-name").textContent = selectedOpp;
        var s1 = document.getElementById("pair-duel-p1-score");
        var s2 = document.getElementById("pair-duel-p2-score");
        s1.textContent = duelWins;
        s2.textContent = duelLosses;
        s1.className = "h2h-pscore" + (duelWins < duelLosses ? " loss" : "");
        s2.className = "h2h-pscore" + (duelLosses < duelWins ? " loss" : "");
        document.getElementById("pair-duel-last").textContent = filtered.length ? "Last played: "+fmtDate(filtered[0].date) : "";

        H("pair-duel-matches", filtered.map(function(s) {
          var t1 = [s.t1p1,s.t1p2].filter(function(n){return n&&n!="undefined"&&n!=="";}).sort().join(" & ");
          var isT1 = t1 === pairName;
          var myWins = isT1 ? Number(s.t1wins) : Number(s.t2wins);
          var oppWins = isT1 ? Number(s.t2wins) : Number(s.t1wins);
          var oppName = isT1
            ? [s.t2p1,s.t2p2].filter(function(n){return n&&n!="undefined";}).join(" & ")
            : [s.t1p1,s.t1p2].filter(function(n){return n&&n!="undefined";}).join(" & ");
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

        document.querySelectorAll("#pair-duel-matches .h2h-match-summary").forEach(function(el){
          el.addEventListener("click",function(){
            var body=this.nextElementSibling;
            body.classList.toggle("open");
          });
        });
        showTab("pair-duel");
      });
    });
  }

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
