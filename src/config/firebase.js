import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

var app = initializeApp({
  databaseURL: "https://badminton-7ef03-default-rtdb.asia-southeast1.firebasedatabase.app"
});
var db = getDatabase(app);

export var matchesRef = ref(db, "matches");
export var squadRef = ref(db, "squad");
export var adjustmentsRef = ref(db, "monthlyAdjustments");
export var monthOverridesRef = ref(db, "settings/monthOverrides");
export var weeklyPatternRef = ref(db, "settings/weeklyMatchDays");
