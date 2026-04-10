import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  setPersistence,
  inMemoryPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let wasm = null;
let routesCache = [];
let currentUser = null;
let isAdmin = false;
let selectedSeats = [];
let map = null;
let routeLayer = null;
let stopLayer = null;
let coordMap = null;
let coordRouteLayer = null;
let coordStopLayer = null;
let coordClickMarker = null;
let coordPoints = [];
let syncTimer = null;
let syncInFlight = false;
let syncRunAgain = false;
let isHydrating = false;
let terminalLines = [];
let adminTicketQuery = "";
let modalInputMode = false;
let mapPickerMap = null;
let mapPickerMarker = null;
let mapPickerChoice = null;
let mapPickerResolver = null;
let adminPathMap = null;
let adminPathRouteLayer = null;
let adminPathPointsLayer = null;
let adminPathStopsLayer = null;
let adminPathDraft = [];
let adminPathHistory = [];
let adminPathSelectedIndex = -1;
let adminPathMode = "none";
let adminPathDirty = false;
let adminPathDashAnimationFrame = null;
let routeDirectionAnimationFrame = null;
let routeDirectionLines = [];
let mapSvgRenderer = null;
let mapResizeObserver = null;
let mapInvalidateTimer = null;
let cloudStateUnsub = null;
let lastSyncedSnapshot = "";
let cloudReadyForWrites = false;
let cloudSyncUiState = "idle";
let selectedSeatLockContext = null;
let seatHoldExpirySec = 0;
let seatHoldTimer = null;
let myTicketSortOrder = "desc";
let adminPassengerRows = [];
const SEAT_LOCK_TTL_SECONDS = 120;
const APP_BUILD_ID = "2026-04-07-20";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const el = {
  authPanel: document.getElementById("authPanel"),
  authLoginTabBtn: document.getElementById("authLoginTabBtn"),
  authSignupTabBtn: document.getElementById("authSignupTabBtn"),
  authLoginPane: document.getElementById("authLoginPane"),
  authSignupPane: document.getElementById("authSignupPane"),
  appPanel: document.getElementById("appPanel"),
  cloudSyncPill: document.getElementById("cloudSyncPill"),
  userPill: document.getElementById("userPill"),
  routeSelect: document.getElementById("routeSelect"),
  busSelect: document.getElementById("busSelect"),
  travelDate: document.getElementById("travelDate"),
  boardingStopSelect: document.getElementById("boardingStopSelect"),
  droppingStopSelect: document.getElementById("droppingStopSelect"),
  farePreview: document.getElementById("farePreview"),
  routeMeta: document.getElementById("routeMeta"),
  seatMap: document.getElementById("seatMap"),
  seatStatusSummary: document.getElementById("seatStatusSummary"),
  seatOccupancyFill: document.getElementById("seatOccupancyFill"),
  seatHoldTimer: document.getElementById("seatHoldTimer"),
  selectedSummary: document.getElementById("selectedSummary"),
  myTicketsList: document.getElementById("myTicketsList"),
  ticketSortSelect: document.getElementById("ticketSortSelect"),
  ticketSearchInput: document.getElementById("ticketSearchInput"),
  mapRouteSelect: document.getElementById("mapRouteSelect"),
  coordRouteSelect: document.getElementById("coordRouteSelect"),
  coordMapView: document.getElementById("coordMapView"),
  coordLastPoint: document.getElementById("coordLastPoint"),
  coordPointsLog: document.getElementById("coordPointsLog"),
  coordCopyLastBtn: document.getElementById("coordCopyLastBtn"),
  coordCopyAllBtn: document.getElementById("coordCopyAllBtn"),
  coordClearBtn: document.getElementById("coordClearBtn"),
  terminalOutput: document.getElementById("terminalOutput"),
  terminalForm: document.getElementById("terminalForm"),
  terminalInput: document.getElementById("terminalInput"),
  terminalRunBtn: document.getElementById("terminalRunBtn"),
  unifiedReportBox: document.getElementById("unifiedReportBox"),
  adminTabBtn: document.getElementById("adminTabBtn"),
  profileName: document.getElementById("profileName"),
  adminRoutePick: document.getElementById("adminRoutePick"),
  adminBusRouteSelect: document.getElementById("adminBusRouteSelect"),
  adminBusPick: document.getElementById("adminBusPick"),
  adminBusNewBtn: document.getElementById("adminBusNewBtn"),
  deleteBusBtn: document.getElementById("deleteBusBtn"),
  adminStopRouteSelect: document.getElementById("adminStopRouteSelect"),
  adminStopPick: document.getElementById("adminStopPick"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalInput: document.getElementById("modalInput"),
  modalCancelBtn: document.getElementById("modalCancelBtn"),
  modalConfirmBtn: document.getElementById("modalConfirmBtn"),
  adminTicketLiveSearch: document.getElementById("adminTicketLiveSearch"),
  adminPurgeCancelledBtn: document.getElementById("adminPurgeCancelledBtn"),
  adminTicketsMeta: document.getElementById("adminTicketsMeta"),
  adminTicketsList: document.getElementById("adminTicketsList"),
  adminPassengerRoute: document.getElementById("adminPassengerRoute"),
  adminPassengerBus: document.getElementById("adminPassengerBus"),
  adminPassengerDate: document.getElementById("adminPassengerDate"),
  adminPassengerMeta: document.getElementById("adminPassengerMeta"),
  adminPassengerList: document.getElementById("adminPassengerList"),
  adminPassengerExportBtn: document.getElementById("adminPassengerExportBtn"),
  mapPickerModal: document.getElementById("mapPickerModal"),
  mapPickerTitle: document.getElementById("mapPickerTitle"),
  mapPickerHint: document.getElementById("mapPickerHint"),
  mapPickerView: document.getElementById("mapPickerView"),
  mapPickerCoords: document.getElementById("mapPickerCoords"),
  mapPickerCancelBtn: document.getElementById("mapPickerCancelBtn"),
  mapPickerConfirmBtn: document.getElementById("mapPickerConfirmBtn"),
  addBusModal: document.getElementById("addBusModal"),
  addBusForm: document.getElementById("addBusForm"),
  addBusRouteSelect: document.getElementById("addBusRouteSelect"),
  addBusCode: document.getElementById("addBusCode"),
  addBusTime: document.getElementById("addBusTime"),
  addBusCancelBtn: document.getElementById("addBusCancelBtn"),
  addBusSaveBtn: document.getElementById("addBusSaveBtn"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  bookingShell: document.querySelector(".booking-shell")
};

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

/**
 * Custom Dropdown Logic: Replaces native selects with Obsidian-themed UI
 */
function initCustomSelect(select) {
  if (!select || select.dataset.customInit) return;
  select.dataset.customInit = "true";
  select.classList.add("hidden-select");

  const wrapper = document.createElement("div");
  wrapper.className = "custom-select-wrapper";
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  const trigger = document.createElement("div");
  trigger.className = "custom-select-trigger";
  trigger.tabIndex = 0; // Make focusable for keyboard search
  trigger.textContent = select.options[select.selectedIndex]?.textContent || "Select...";
  wrapper.appendChild(trigger);

  const optionsContainer = document.createElement("div");
  optionsContainer.className = "custom-options";
  wrapper.appendChild(optionsContainer);

  let searchBuffer = "";
  let searchTimeout = null;

  const refreshOptions = () => {
    optionsContainer.innerHTML = "";
    Array.from(select.options).forEach((opt, idx) => {
      const isDeparted = opt.textContent.toLowerCase().includes("- departed");
      const li = document.createElement("div");
      li.className = `custom-option ${select.selectedIndex === idx ? "selected" : ""} ${isDeparted ? "departed-opt" : ""}`;
      li.textContent = opt.textContent;
      li.onclick = () => {
        if (isDeparted) return;
        select.selectedIndex = idx;
        select.dispatchEvent(new Event("change"));
        wrapper.classList.remove("open");
      };
      optionsContainer.appendChild(li);
    });
    trigger.textContent = select.options[select.selectedIndex]?.textContent || "Select...";
  };

  trigger.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = wrapper.classList.contains("open");
    document.querySelectorAll(".custom-select-wrapper").forEach(w => w.classList.remove("open"));
    if (!isOpen) { 
      const rect = trigger.getBoundingClientRect();
      optionsContainer.style.top = `${rect.bottom + 6}px`;
      optionsContainer.style.left = `${rect.left}px`;
      optionsContainer.style.width = `${rect.width}px`;
      wrapper.classList.add("open"); 
    }
  };

  // Type-to-search logic
  trigger.addEventListener("keydown", (e) => {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      clearTimeout(searchTimeout);
      searchBuffer += e.key.toLowerCase();
      searchTimeout = setTimeout(() => { searchBuffer = ""; }, 500);

      const matchIdx = Array.from(select.options).findIndex(opt => 
        opt.textContent.toLowerCase().startsWith(searchBuffer) && !opt.disabled
      );
      if (matchIdx >= 0) {
        select.selectedIndex = matchIdx;
        select.dispatchEvent(new Event("change"));
        // Scroll the selected option into view if open
        const options = optionsContainer.querySelectorAll(".custom-option");
        if (options[matchIdx]) options[matchIdx].scrollIntoView({ block: "nearest" });
      }
    }
    if (e.key === "Enter" || e.key === " ") {
      trigger.click();
    }
    if (e.key === "Escape") {
      wrapper.classList.remove("open");
    }
  });

  // Only close if scrolling something OUTSIDE the menu
  window.addEventListener("scroll", (e) => {
    if (wrapper.classList.contains("open") && !optionsContainer.contains(e.target)) {
      wrapper.classList.remove("open");
    }
  }, true);


  select.addEventListener("change", () => {
    trigger.textContent = select.options[select.selectedIndex]?.textContent || "Select...";
    refreshOptions();
  });

  // Watch for dynamic changes (e.g. when bus list refreshes)
  const observer = new MutationObserver(() => refreshOptions());
  observer.observe(select, { childList: true, subtree: true, characterData: true });

  refreshOptions();

  // Expose refresh so external code can force an update
  wrapper._refreshCustomOptions = refreshOptions;
}

document.addEventListener("click", () => {
  document.querySelectorAll(".custom-select-wrapper").forEach(w => w.classList.remove("open"));
});


function updateUserPill() {
  if (!currentUser) return;
  const name = currentUser.displayName || currentUser.email || "User";
  el.userPill.textContent = `${name} (${isAdmin ? "Admin" : "User"})`;
}

function setCloudSyncUi(state, message = "") {
  cloudSyncUiState = state;
  if (!el.cloudSyncPill) return;
  el.cloudSyncPill.classList.remove(
    "cloud-sync-idle",
    "cloud-sync-checking",
    "cloud-sync-syncing",
    "cloud-sync-online",
    "cloud-sync-error"
  );
  const text = String(message || "").trim();
  if (state === "online") {
    el.cloudSyncPill.classList.add("cloud-sync-online");
    el.cloudSyncPill.textContent = text || "Cloud Sync: Active";
    return;
  }
  if (state === "checking") {
    el.cloudSyncPill.classList.add("cloud-sync-checking");
    el.cloudSyncPill.textContent = text || "Cloud Sync: Checking";
    return;
  }
  if (state === "syncing") {
    el.cloudSyncPill.classList.add("cloud-sync-syncing");
    el.cloudSyncPill.textContent = text || "Cloud Sync: Syncing";
    return;
  }
  if (state === "error") {
    el.cloudSyncPill.classList.add("cloud-sync-error");
    el.cloudSyncPill.textContent = text || "Cloud Sync: Not Available";
    return;
  }
  el.cloudSyncPill.classList.add("cloud-sync-idle");
  el.cloudSyncPill.textContent = text || "Cloud Sync: Offline";
}

function setButtonBusy(button, busy, busyText = "Please wait...") {
  if (!button) return;
  if (busy) {
    if (!button.dataset.prevText) button.dataset.prevText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
    return;
  }
  if (button.dataset.prevText) {
    button.textContent = button.dataset.prevText;
    delete button.dataset.prevText;
  }
  button.disabled = false;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, message: text || "Invalid response" };
  }
}

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(value) {
  return escHtml(value).replace(/`/g, "&#96;");
}

function parseTimeToMinutes(text) {
  const v = String(text || "").trim().toUpperCase();
  const as24 = v.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (as24) {
    return Number(as24[1]) * 60 + Number(as24[2]);
  }
  const as12 = v.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/);
  if (!as12) return null;
  let hh = Number(as12[1]);
  const mm = Number(as12[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 1 || hh > 12) return null;
  if (as12[3] === "AM") {
    if (hh === 12) hh = 0;
  } else if (hh !== 12) {
    hh += 12;
  }
  return hh * 60 + mm;
}

function minutesToTime(minsRaw) {
  let mins = Number(minsRaw);
  if (!Number.isFinite(mins)) return "";
  mins = ((mins % 1440) + 1440) % 1440;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function shiftTimeByMinutes(text, delta) {
  const base = parseTimeToMinutes(text);
  if (base === null) return text || "";
  return minutesToTime(base + delta);
}

function formatTime24(text) {
  const mins = parseTimeToMinutes(text);
  return mins === null ? String(text || "") : minutesToTime(mins);
}

function timeInputValue(text) {
  const mins = parseTimeToMinutes(text);
  return mins === null ? "" : minutesToTime(mins);
}

function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


function isYmd(text) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(text || ""));
}

function normalizeYmdInput(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (isYmd(raw)) return raw;
  const dmy = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmy) {
    const dd = dmy[1];
    const mm = dmy[2];
    const yyyy = dmy[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}

function selectedTravelDateYmd() {
  return normalizeYmdInput(el.travelDate?.value || "");
}

function ymdCompare(a, b) {
  if (!a || !b) return 0;
  const sA = String(a).trim();
  const sB = String(b).trim();
  if (sA < sB) return -1;
  if (sA > sB) return 1;
  return 0;
}


function journeyFarePerSeat(route, boardingIndex, droppingIndex) {
  if (!route) return 0;
  const maxFare = Math.max(1, Number(route.fare) || 0);
  const minFare = Math.max(1, Math.ceil(maxFare * 0.5));
  const totalSegments = Math.max(1, (route.stops || []).length - 1);
  const chosenSegments = Math.max(0, droppingIndex - boardingIndex);
  const ratio = Math.max(0, Math.min(1, chosenSegments / totalSegments));
  const fare = Math.round(minFare + (maxFare - minFare) * ratio);
  return Math.max(minFare, Math.min(maxFare, fare));
}

function estimateJourneyDistanceKm(route, boardingIndex, droppingIndex) {
  const stops = route?.stops || [];
  if (!stops.length) return 0;
  const start = Math.max(0, Number(boardingIndex) || 0);
  const end = Math.min(stops.length - 1, Number(droppingIndex) || 0);
  if (end <= start) return 0;
  let km = 0;
  for (let i = start + 1; i <= end; i += 1) {
    const a = [Number(stops[i - 1].lat), Number(stops[i - 1].lon)];
    const b = [Number(stops[i].lat), Number(stops[i].lon)];
    if (!Number.isFinite(a[0]) || !Number.isFinite(a[1]) || !Number.isFinite(b[0]) || !Number.isFinite(b[1])) {
      continue;
    }
    km += distanceKm(a, b);
  }
  return Number.isFinite(km) ? km : 0;
}

function elapsedMinutes(startTime, endTime) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) return 0;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff);
}

function formatDurationMins(totalMins) {
  const mins = Math.max(0, Number(totalMins) || 0);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  if (hh <= 0) return `${mm}m`;
  if (mm === 0) return `${hh}h`;
  return `${hh}h ${mm}m`;
}

function estimateRouteDistanceKm(route) {
  const path =
    (route?.path || []).length > 1
      ? route.path
      : (route?.stops || []).map((s) => [Number(s.lat), Number(s.lon)]);
  if (!Array.isArray(path) || path.length < 2) return 0;
  let km = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    km += distanceKm([Number(a[0]), Number(a[1])], [Number(b[0]), Number(b[1])]);
  }
  return Number.isFinite(km) ? km : 0;
}

function selectedBoardingStopForRoute(route) {
  if (!route || !(route.stops || []).length) return null;
  const stopId = el.boardingStopSelect?.value || route.stops[0].stopId;
  return route.stops.find((s) => s.stopId === stopId) || route.stops[0] || null;
}

function isServiceDeparted(route, bus, travelDate, boardingStop = null) {
  if (!route || !bus || !isYmd(travelDate)) return false;
  const today = todayYmdLocal();
  const diff = ymdCompare(travelDate, today);
  
  if (diff < 0) return true;  // Past date
  if (diff > 0) return false; // Future date
  
  // Current day check
  const stop = boardingStop || selectedBoardingStopForRoute(route);
  if (!stop) return false;
  const timeText = getStopTimeForBus(route, stop, bus.busId) || bus.departureTime;
  const mins = parseTimeToMinutes(timeText);
  if (mins === null) return false;
  
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  
  // 5-minute grace period before marking as hard-departed
  return nowMins > (mins + 5); 
}



function toCsvCell(value) {
  const raw = String(value ?? "");
  return `"${raw.replace(/"/g, "\"\"")}"`;
}

function downloadCsv(filename, headers, rows) {
  const csvLines = [
    headers.map((h) => toCsvCell(h)).join(","),
    ...rows.map((row) => row.map((v) => toCsvCell(v)).join(","))
  ];
  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function callWasm(name, ...args) {
  if (!wasm || typeof wasm[name] !== "function") {
    throw new Error(`WASM function unavailable: ${name}`);
  }
  return wasm[name](...args);
}

function callWasmJson(name, ...args) {
  return safeJson(callWasm(name, ...args));
}

let modalResolver = null;
function showConfirm(title, body, confirmText = "Confirm", cancelText = "Cancel") {
  modalInputMode = false;
  el.modalInput.classList.add("hidden");
  el.modalInput.value = "";
  el.modalTitle.textContent = title;
  el.modalBody.innerHTML = body;
  el.modalConfirmBtn.textContent = confirmText;
  el.modalCancelBtn.textContent = cancelText;
  el.modalCancelBtn.classList.remove("hidden");
  el.modal.classList.remove("hidden");
  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function showConfirmCustom(title, confirmText = "Confirm", cancelText = "Cancel") {
  modalInputMode = false;
  el.modalInput.classList.add("hidden");
  el.modalTitle.textContent = title;
  el.modalConfirmBtn.textContent = confirmText;
  el.modalCancelBtn.textContent = cancelText;
  el.modalCancelBtn.classList.remove("hidden");
  el.modal.classList.remove("hidden");
  return new Promise((resolve) => {
    const customResolver = (yes) => {
      if (!yes) {
        resolve(null);
        return;
      }
      const inputs = Array.from(el.modalBody.querySelectorAll(".passenger-modal-input"));
      const values = inputs.map(i => i.value.trim());
      if (values.some(v => !v)) {
        toast("Please enter all names.");
        // Re-show modal since closeModal hid it
        el.modal.classList.remove("hidden");
        // Re-attach this resolver since closeModal cleared it
        modalResolver = customResolver;
        return;
      }
      resolve(values);
    };
    modalResolver = customResolver;
  });
}

function showAlert(title, body, okText = "OK") {
  modalInputMode = false;
  el.modalInput.classList.add("hidden");
  el.modalInput.value = "";
  el.modalTitle.textContent = title;
  el.modalBody.textContent = body;
  el.modalConfirmBtn.textContent = okText;
  el.modalCancelBtn.classList.add("hidden");
  el.modal.classList.remove("hidden");
  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function showPrompt(title, body, defaultValue = "", confirmText = "Save", cancelText = "Cancel") {
  modalInputMode = true;
  el.modalTitle.textContent = title;
  el.modalBody.textContent = body;
  el.modalInput.classList.remove("hidden");
  el.modalInput.value = defaultValue;
  el.modalConfirmBtn.textContent = confirmText;
  el.modalCancelBtn.textContent = cancelText;
  el.modalCancelBtn.classList.remove("hidden");
  el.modal.classList.remove("hidden");
  setTimeout(() => el.modalInput.focus(), 20);
  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function closeModal(value) {
  const resolver = modalResolver;
  modalResolver = null;
  modalInputMode = false;
  el.modalInput.classList.add("hidden");
  el.modalInput.value = "";
  if (resolver) {
    // For custom resolvers (showConfirmCustom), they may want to keep the modal open.
    // We hide it first by default, but custom resolvers can re-show if needed.
    el.modal.classList.add("hidden");
    resolver(value);
  } else {
    el.modal.classList.add("hidden");
  }
}

function currentRoute() {
  return routesCache.find((r) => r.routeId === el.routeSelect.value) || null;
}

function currentBus() {
  const route = currentRoute();
  if (!route) return null;
  return route.buses.find((b) => b.busId === el.busSelect.value) || null;
}

function routeById(routeId) {
  return routesCache.find((r) => r.routeId === routeId) || null;
}

function getRouteAndBusByTicket(ticket) {
  const liveRoute = routeById(ticket?.routeId || "");
  const route =
    liveRoute ||
    {
      routeId: ticket?.routeId || "",
      ref: ticket?.routeId || "Archived Route",
      from: ticket?.boardingStopName || "-",
      to: ticket?.dropStopName || "-",
      buses: []
    };
  const bus =
    liveRoute?.buses?.find((b) => b.busId === ticket?.busId) ||
    (liveRoute?.buses || []).find((b) => (b.displayName || "").toLowerCase() === (ticket?.busId || "").toLowerCase()) ||
    {
      busId: ticket?.busId || "",
      busCode: ticket?.busId || "Archived Service",
      displayName: "",
      departureTime: ticket?.boardingTime || ""
    };
  return { route, bus };
}

function routeDisplayText(route) {
  if (!route) return "-";
  return `${route.ref} (${route.from} -> ${route.to})`;
}

function isTicketCompleted(ticket) {
  if (!ticket || ticket.cancelled) return false;
  if (ticket.completed === true) return true;
  const travelDate = String(ticket.travelDate || "");
  if (!isYmd(travelDate)) return false;
  const today = todayYmdLocal();
  if (travelDate < today) return true;
  if (travelDate > today) return false;
  const drop = parseTimeToMinutes(ticket.dropTime || "");
  const board = parseTimeToMinutes(ticket.boardingTime || "");
  const endMins = drop === null ? board : drop;
  if (endMins === null) return false;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= endMins;
}

function ticketStatusLabel(ticket) {
  if (ticket?.cancelled) return "Cancelled";
  if (isTicketCompleted(ticket)) return "Completed";
  return "Booked";
}

function isTicketActive(ticket) {
  return !!ticket && !ticket.cancelled && !isTicketCompleted(ticket);
}

function buildBusDisplayName(routeRef, busCode) {
  const ref = String(routeRef || "").trim();
  const code = String(busCode || "").trim();
  if (!ref && !code) return "Service";
  if (!ref) return `Service ${code}`;
  if (!code) return `${ref} Service`;
  return `${ref} Service ${code}`;
}

function busDisplayText(bus, route = null) {
  if (!bus) return "-";
  return buildBusDisplayName(route?.ref || "", bus.busCode);
}

function createInternalBusId(routeId) {
  const route = routeById(routeId);
  const taken = new Set((route?.buses || []).map((b) => b.busId));
  let idx = (route?.buses?.length || 0) + 1;
  let id = `${routeId}-B${String(idx).padStart(2, "0")}`;
  while (taken.has(id)) {
    idx += 1;
    id = `${routeId}-B${String(idx).padStart(2, "0")}`;
  }
  return id;
}

function getBusIndex(route, busId) {
  if (!route || !Array.isArray(route.buses)) return -1;
  return route.buses.findIndex((b) => b.busId === busId);
}

function getStopTimeForBus(route, stop, busId) {
  const idx = getBusIndex(route, busId);
  if (idx >= 0 && Array.isArray(stop.departures) && stop.departures[idx]) {
    return stop.departures[idx];
  }
  if (Array.isArray(stop.departures) && stop.departures.length === 1 && stop.departures[0]) {
    return stop.departures[0];
  }
  return stop.arrival || "-";
}

function stopById(route, stopId) {
  return (route?.stops || []).find((s) => s.stopId === stopId) || null;
}

function getJourneySelection() {
  const route = currentRoute();
  const bus = currentBus();
  if (!route || !bus) return { ok: false, message: "Select route and service." };
  const travelDate = selectedTravelDateYmd();
  if (!isYmd(travelDate)) return { ok: false, message: "Select a valid travel date." };
  if (el.travelDate && el.travelDate.value !== travelDate) {
    el.travelDate.value = travelDate;
  }
  const today = todayYmdLocal();
  if (ymdCompare(travelDate, today) < 0) return { ok: false, message: "Previous day booking is not allowed." };

  const boardingStopId = el.boardingStopSelect?.value || "";
  const droppingStopId = el.droppingStopSelect?.value || "";
  const boardingIndex = (route.stops || []).findIndex((s) => s.stopId === boardingStopId);
  const droppingIndex = (route.stops || []).findIndex((s) => s.stopId === droppingStopId);
  if (boardingIndex < 0 || droppingIndex < 0) {
    return { ok: false, message: "Select boarding and dropping points." };
  }
  if (boardingIndex >= droppingIndex) {
    return { ok: false, message: "Dropping point must be after boarding point." };
  }
  const boardingStop = route.stops[boardingIndex];
  const droppingStop = route.stops[droppingIndex];
  const boardingTime = getStopTimeForBus(route, boardingStop, bus.busId);
  const dropTime = getStopTimeForBus(route, droppingStop, bus.busId);
  const boardingMins = parseTimeToMinutes(boardingTime);
  if (travelDate === today && boardingMins !== null) {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    if (nowMins > (boardingMins + 5)) {
      return { ok: false, message: "Selected boarding time has already passed for today." };
    }
  }
  const farePerSeat = journeyFarePerSeat(route, boardingIndex, droppingIndex);
  return {
    ok: true,
    route,
    bus,
    travelDate,
    boardingStopId,
    droppingStopId,
    boardingStop,
    droppingStop,
    boardingIndex,
    droppingIndex,
    boardingTime,
    dropTime,
    farePerSeat
  };
}

function activeSeatLockContext() {
  const route = currentRoute();
  const bus = currentBus();
  const travelDate = selectedTravelDateYmd();
  if (!route || !bus || !isYmd(travelDate)) return null;
  return { routeId: route.routeId, busId: bus.busId, travelDate };
}

function sameSeatLockContext(a, b) {
  if (!a || !b) return false;
  return a.routeId === b.routeId && a.busId === b.busId && a.travelDate === b.travelDate;
}

function clearSeatSelectionState() {
  selectedSeats = [];
  selectedSeatLockContext = null;
  seatHoldExpirySec = 0;
  refreshSeatHoldTimerUi();
}

function releaseSelectedSeatLocks() {
  if (!currentUser || !selectedSeatLockContext) {
    clearSeatSelectionState();
    return { success: true };
  }
  const res = callWasmJson(
    "apiReleaseSeatLocks",
    currentUser.uid,
    selectedSeatLockContext.routeId,
    selectedSeatLockContext.busId,
    selectedSeatLockContext.travelDate,
    selectedSeats.join(",")
  );
  clearSeatSelectionState();
  if (res.success) {
    queueCloudSync(180).catch(() => {});
  }
  return res;
}

function stopSeatHoldTimer() {
  if (seatHoldTimer) {
    clearInterval(seatHoldTimer);
    seatHoldTimer = null;
  }
}

function refreshSeatHoldTimerUi() {
  if (!el.seatHoldTimer) return;
  if (!selectedSeats.length || !seatHoldExpirySec) {
    el.seatHoldTimer.textContent = "";
    el.seatHoldTimer.classList.remove("critical");
    el.seatHoldTimer.classList.add("hidden");
    stopSeatHoldTimer();
    return;
  }
  el.seatHoldTimer.classList.remove("hidden");
  const now = Math.floor(Date.now() / 1000);
  const left = Math.max(0, seatHoldExpirySec - now);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  el.seatHoldTimer.textContent = `Seats held for ${mm}:${ss}`;
  el.seatHoldTimer.classList.toggle("critical", left <= 30);
  if (left > 0) return;
  stopSeatHoldTimer();
  const hadSelection = selectedSeats.length > 0;
  if (!hadSelection) {
    clearSeatSelectionState();
    return;
  }
  releaseSelectedSeatLocks();
  renderSeatMap();
  renderPassengerFields();
  toast("Seat hold expired. Please select seats again.");
}

function ensureSeatHoldTimer() {
  if (!selectedSeats.length || !seatHoldExpirySec) {
    refreshSeatHoldTimerUi();
    return;
  }
  if (!seatHoldTimer) {
    seatHoldTimer = setInterval(() => {
      refreshSeatHoldTimerUi();
    }, 1000);
  }
  refreshSeatHoldTimerUi();
}

function syncDroppingOptions() {
  const route = currentRoute();
  if (!route || !el.boardingStopSelect || !el.droppingStopSelect) return;
  const boardingId = el.boardingStopSelect.value;
  const boardingIndex = (route.stops || []).findIndex((s) => s.stopId === boardingId);
  const candidates =
    boardingIndex >= 0 ? route.stops.slice(boardingIndex + 1) : [];
  const prevDrop = el.droppingStopSelect.value;
  fillSelect(
    el.droppingStopSelect,
    candidates,
    (s) => s.stopId,
    (s) => `${s.name} (${formatTime24(getStopTimeForBus(route, s, currentBus()?.busId || ""))})`
  );
  if (!candidates.length) {
    el.droppingStopSelect.innerHTML = `<option value="">-- Select --</option>`;
  } else if (candidates.some((s) => s.stopId === prevDrop)) {
    el.droppingStopSelect.value = prevDrop;
  } else {
    el.droppingStopSelect.value = candidates[candidates.length - 1].stopId;
  }
}

function refreshJourneySelectors() {
  const route = currentRoute();
  const bus = currentBus();
  if (!el.travelDate || !el.boardingStopSelect || !el.droppingStopSelect || !el.farePreview) return;
  if (!route || !bus || !(route.stops || []).length) {
    el.boardingStopSelect.innerHTML = `<option value="">-- Select --</option>`;
    el.droppingStopSelect.innerHTML = `<option value="">-- Select --</option>`;
    el.farePreview.textContent = "Fare preview unavailable.";
    return;
  }
  const today = todayYmdLocal();
  const normalizedDate = selectedTravelDateYmd();
  el.travelDate.value = isYmd(normalizedDate) ? normalizedDate : today;
  el.travelDate.min = today;
  const prevBoarding = el.boardingStopSelect.value;
  fillSelect(
    el.boardingStopSelect,
    route.stops,
    (s) => s.stopId,
    (s) => `${s.name} (${formatTime24(getStopTimeForBus(route, s, bus.busId))})`
  );
  if ((route.stops || []).some((s) => s.stopId === prevBoarding)) {
    el.boardingStopSelect.value = prevBoarding;
  } else {
    el.boardingStopSelect.value = route.stops[0].stopId;
  }
  syncDroppingOptions();
  updateFarePreview();
}

function updateFarePreview() {
  if (!el.farePreview) return;
  const sel = getJourneySelection();
  if (!sel.ok) {
    el.farePreview.innerHTML = `<p>${sel.message || "Fare preview unavailable."}</p>`;
    return;
  }
  const selectedCount = Math.max(0, selectedSeats.length || 0);
  const stopsCovered = Math.max(0, sel.droppingIndex - sel.boardingIndex + 1);
  const durationMins = elapsedMinutes(sel.boardingTime, sel.dropTime);
  const total = sel.farePerSeat * selectedCount;
  el.farePreview.innerHTML = `
    <div class="meta-line"><span>Travel Date:</span> <strong>${sel.travelDate}</strong></div>
    <div class="meta-line"><span>Boarding:</span> <strong>${sel.boardingStop.name} (${formatTime24(sel.boardingTime)})</strong></div>
    <div class="meta-line"><span>Dropping:</span> <strong>${sel.droppingStop.name} (${formatTime24(sel.dropTime)})</strong></div>
    <div class="meta-line"><span>Stops covered:</span> <strong>${stopsCovered}</strong></div>
    <div class="meta-line"><span>Duration:</span> <strong>${formatDurationMins(durationMins)}</strong></div>
    <div class="meta-line"><span>Fare per seat:</span> <strong>Rs ${sel.farePerSeat}</strong></div>
    <div class="meta-line"><span>Total (${selectedCount} seat${selectedCount === 1 ? "" : "s"}):</span> <strong>Rs ${total}</strong></div>
  `;
}

function refreshRoutesCache() {
  const res = callWasmJson("apiRoutesJson");
  if (!res.success) throw new Error(res.message || "Failed to load routes");
  routesCache = res.routes || [];
}

function fillSelect(select, items, getValue, getLabel, includeBlank = false) {
  if (!select) return;
  select.textContent = "";
  if (includeBlank) {
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "-- Select --";
    select.appendChild(blank);
  }
  for (const item of items) {
    const option = document.createElement("option");
    option.value = String(getValue(item) ?? "");
    option.textContent = String(getLabel(item) ?? "");
    select.appendChild(option);
  }
}

function renderRouteSelectors(state = {}) {
  const prevBookingRoute = state.bookingRouteId || el.routeSelect.value;
  const prevBookingBus = state.bookingBusId || el.busSelect.value;
  fillSelect(
    el.routeSelect,
    routesCache,
    (r) => r.routeId,
    (r) => `${r.ref} - ${r.from} -> ${r.to}`
  );
  fillSelect(
    el.mapRouteSelect,
    routesCache,
    (r) => r.routeId,
    (r) => `${r.ref} - ${r.from} -> ${r.to}`
  );
  if (routesCache.length) {
    const hasBooking = routesCache.some((r) => r.routeId === prevBookingRoute);
    el.routeSelect.value = hasBooking ? prevBookingRoute : routesCache[0].routeId;
    el.mapRouteSelect.value = el.routeSelect.value;
  }
  renderBusSelector(prevBookingBus);
  renderMapRoute();
  populateAdminSelectors();
}

function renderBusSelector(preferredBusId = "") {
  const route = currentRoute();
  if (!route) {
    el.busSelect.innerHTML = "";
    return;
  }
  const travelDate = selectedTravelDateYmd() || todayYmdLocal();
  const boardingStop = selectedBoardingStopForRoute(route);
  const prevSelected = preferredBusId || el.busSelect.value;
  el.busSelect.textContent = "";
  let firstActiveBusId = "";
  for (const b of route.buses || []) {
    const departed = isServiceDeparted(route, b, travelDate, boardingStop);
    const opt = document.createElement("option");
    opt.value = b.busId;
    opt.disabled = departed;
    opt.textContent = `${buildBusDisplayName(route.ref, b.busCode)} (${formatTime24(b.departureTime)})${departed ? " - Departed" : ""}`;
    el.busSelect.appendChild(opt);
    if (!departed && !firstActiveBusId) firstActiveBusId = b.busId;
  }
  if ((route.buses || []).length) {
    const hasPreferred = route.buses.some((b) => b.busId === prevSelected);
    const preferredBus = hasPreferred ? route.buses.find((b) => b.busId === prevSelected) : null;
    if (preferredBus && !isServiceDeparted(route, preferredBus, travelDate, boardingStop)) {
      el.busSelect.value = preferredBus.busId;
    } else if (firstActiveBusId) {
      el.busSelect.value = firstActiveBusId;
    } else {
      el.busSelect.value = route.buses[0].busId;
    }
  }
  refreshJourneySelectors();
  renderRouteMeta();
  renderSeatMap();
}

function refreshBusDepartureAvailability() {
  const route = currentRoute();
  if (!route || !el.busSelect) return;
  const travelDate = selectedTravelDateYmd() || todayYmdLocal();
  const boardingStop = selectedBoardingStopForRoute(route);
  const selectedBusId = el.busSelect.value;
  let firstActiveBusId = "";
  let selectedStillValid = false;
  for (const opt of Array.from(el.busSelect.options)) {
    const bus = route.buses.find((b) => b.busId === opt.value);
    if (!bus) continue;
    const departed = isServiceDeparted(route, bus, travelDate, boardingStop);
    opt.disabled = departed;
    opt.textContent = `${buildBusDisplayName(route.ref, bus.busCode)} (${formatTime24(bus.departureTime)})${departed ? " - Departed" : ""}`;
    if (!departed && !firstActiveBusId) firstActiveBusId = bus.busId;
    if (bus.busId === selectedBusId && !departed) selectedStillValid = true;
  }
  if (!selectedStillValid && firstActiveBusId) {
    el.busSelect.value = firstActiveBusId;
  }
  // Force the custom dropdown UI to resync after option text changes
  const wrapper = el.busSelect.closest(".custom-select-wrapper");
  if (wrapper && wrapper._refreshCustomOptions) {
    wrapper._refreshCustomOptions();
  }
  // Also fire change event so trigger text updates
  el.busSelect.dispatchEvent(new Event("change"));
}

function focusMapOnRoute(routeId) {
  if (!routeById(routeId)) return;
  el.mapRouteSelect.value = routeId;
  renderMapRoute();
}

function renderRouteMeta() {
  // Logic removed as the UI card was deleted to declutter the sidebar.
}


function renderPassengerFields() {
  const journey = getJourneySelection();
  if (!journey.ok) {
    return;
  }
}

function renderSeatStatusSummary(seatRows = [], seatCapacity = 0) {
  if (!el.seatStatusSummary || !el.seatOccupancyFill) return;
  const selectedCount = Math.max(0, selectedSeats.length || 0);
  const bookedCount = seatRows.filter((s) => s.booked).length;
  const heldByOthersCount = seatRows.filter((s) => !s.booked && s.lockedByOther).length;
  const reservedCount = bookedCount + heldByOthersCount;
  const availableCount = Math.max(0, seatCapacity - reservedCount - selectedCount);
  const occupiedRatio = seatCapacity > 0 ? Math.min(100, Math.round((reservedCount / seatCapacity) * 100)) : 0;
  
  el.seatStatusSummary.innerHTML = ""; // Removed status counts as requested
  
  el.seatOccupancyFill.style.width = `${occupiedRatio}%`;
  el.seatOccupancyFill.title = `Occupancy ${occupiedRatio}%`;
  
  // High-visibility occupancy bar
  el.seatOccupancyFill.style.display = 'block';
  el.seatOccupancyFill.style.minHeight = '100%';
  el.seatOccupancyFill.style.background = occupiedRatio > 0 ? 'linear-gradient(90deg, var(--primary-color), #991b1b)' : 'transparent';
}

function seatLayoutRows(seatCapacity) {
  const rows = [];
  rows.push(["gap", "gap", "gap", "gap", "driver"]);
  let seat = 1;
  while (seat <= seatCapacity) {
    rows.push([
      seat <= seatCapacity ? seat++ : "gap",
      seat <= seatCapacity ? seat++ : "gap",
      "gap",
      seat <= seatCapacity ? seat++ : "gap",
      seat <= seatCapacity ? seat++ : "gap"
    ]);
  }
  return rows;
}

function renderSeatMap() {
  const route = currentRoute();
  const bus = currentBus();
  if (!route || !bus) {
    el.seatMap.innerHTML = "";
    clearSeatSelectionState();
    renderSeatStatusSummary([], 0);
    renderPassengerFields();
    return;
  }
  const normalized = selectedTravelDateYmd();
  const travelDate = isYmd(normalized) ? normalized : todayYmdLocal();
  if (el.travelDate && el.travelDate.value !== travelDate) {
    el.travelDate.value = travelDate;
  }
  const lockContext = { routeId: route.routeId, busId: bus.busId, travelDate };
  const boardingStop = selectedBoardingStopForRoute(route);
  const departedForToday = isServiceDeparted(route, bus, travelDate, boardingStop);
  if (departedForToday && selectedSeats.length && sameSeatLockContext(selectedSeatLockContext, lockContext)) {
    releaseSelectedSeatLocks();
  }

  let seatRes = callWasmJson(
    "apiSeatsJsonForUser",
    route.routeId,
    bus.busId,
    travelDate,
    currentUser?.uid || ""
  );
  if (!seatRes.success) {
    seatRes = callWasmJson("apiSeatsJson", route.routeId, bus.busId, travelDate);
  }
  if (!seatRes.success) {
    toast(seatRes.message || "Cannot load seats.");
    return;
  }

  const seatInfo = new Map();
  const seatRows = seatRes.seats || [];
  seatRows.forEach((s) => seatInfo.set(s.seat, s));
  const heldByYouFromCloud = (seatRes.seats || [])
    .filter((s) => !s.booked && s.lockedByYou)
    .map((s) => Number(s.seat))
    .filter((n) => Number.isInteger(n));
  if (heldByYouFromCloud.length) {
    const merged = new Set([...selectedSeats, ...heldByYouFromCloud]);
    selectedSeats = [...merged].sort((a, b) => a - b).slice(0, 5);
    selectedSeatLockContext = { routeId: route.routeId, busId: bus.busId, travelDate };
  }
  selectedSeats = selectedSeats.filter((s) => {
    const row = seatInfo.get(s);
    return row && !row.booked && !row.lockedByOther;
  });
  if (!selectedSeats.length) {
    selectedSeatLockContext = null;
    seatHoldExpirySec = 0;
  } else if (!selectedSeatLockContext) {
    selectedSeatLockContext = { routeId: route.routeId, busId: bus.busId, travelDate };
  }
  const lockExpiryValues = selectedSeats
    .map((seatNo) => seatInfo.get(seatNo))
    .filter((row) => row && row.lockedByYou && Number(row.lockExpiry) > 0)
    .map((row) => Number(row.lockExpiry));
  if (lockExpiryValues.length) {
    seatHoldExpirySec = Math.min(...lockExpiryValues);
  } else if (selectedSeats.length) {
    seatHoldExpirySec = Math.floor(Date.now() / 1000) + SEAT_LOCK_TTL_SECONDS;
  } else {
    seatHoldExpirySec = 0;
  }

  const rows = seatLayoutRows(bus.seatCapacity);
  const html = [];
  for (const row of rows) {
    for (const item of row) {
      if (item === "gap") {
        html.push(`<div class="seat-gap"></div>`);
      } else if (item === "driver") {
        html.push(`<div class="driver-seat">Driver</div>`);
      } else {
        const info = seatInfo.get(item);
        const booked = !!info?.booked;
        const lockedByOther = !!info?.lockedByOther;
        const lockedByYou = !!info?.lockedByYou;
        const selected = selectedSeats.includes(item);
        html.push(
          `<button type="button" class="seat ${booked ? "booked" : ""} ${lockedByOther ? "locked-other" : ""} ${lockedByYou ? "locked-you" : ""} ${selected ? "selected" : ""} ${departedForToday ? "departed" : ""}" data-seat="${item}" ${booked || lockedByOther || departedForToday ? "disabled" : ""}>${item}</button>`
        );
      }
    }
  }
  el.seatMap.innerHTML = html.join("");
  renderSeatStatusSummary(seatRows, Number(bus.seatCapacity) || 0);
  ensureSeatHoldTimer();
  el.seatMap.querySelectorAll(".seat").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (departedForToday) {
        toast("This service has already departed for today.");
        return;
      }
      const seat = Number(btn.dataset.seat);
      const currentContext = activeSeatLockContext();
      if (!currentContext) {
        toast("Select a valid route, service and date first.");
        return;
      }
      let nextSeats = [];
      if (selectedSeats.includes(seat)) {
        nextSeats = selectedSeats.filter((s) => s !== seat);
      } else {
        if (selectedSeats.length >= 5) {
          toast("Maximum 5 seats per booking.");
          return;
        }
        nextSeats = [...selectedSeats, seat].sort((a, b) => a - b);
      }
      const lockRes = callWasmJson(
        "apiUpsertSeatLocks",
        currentUser?.uid || "",
        currentContext.routeId,
        currentContext.busId,
        currentContext.travelDate,
        nextSeats.join(","),
        SEAT_LOCK_TTL_SECONDS
      );
      if (!lockRes.success) {
        toast(lockRes.message || "Seat lock failed.");
        renderSeatMap();
        return;
      }
      selectedSeats = nextSeats;
      selectedSeatLockContext = selectedSeats.length ? currentContext : null;
      seatHoldExpirySec = Math.floor(Date.now() / 1000) + SEAT_LOCK_TTL_SECONDS;
      queueCloudSync(280).catch(() => {});
      renderSeatMap();
      renderPassengerFields();
    });
  });
  renderPassengerFields();
  const bookBtn = document.querySelector("#bookForm button[type='submit']");
  if (bookBtn) {
    bookBtn.disabled = departedForToday;
  }
  if (departedForToday && el.selectedSummary) {
    el.selectedSummary.textContent = "Selected service has already departed for today.";
  }
}

function ticketHtmlForPrint(t, meta) {
  const ticketId = escHtml(t.ticketId || "-");
  const routeText = escHtml(routeDisplayText(meta.route));
  const serviceText = escHtml(busDisplayText(meta.bus, meta.route));
  const travelDate = escHtml(t.travelDate || "-");
  const boarding = `${escHtml(t.boardingStopName || "-")}${t.boardingTime ? ` (${escHtml(formatTime24(t.boardingTime))})` : ""}`;
  const dropping = `${escHtml(t.dropStopName || "-")}${t.dropTime ? ` (${escHtml(formatTime24(t.dropTime))})` : ""}`;
  const seats = escHtml((t.seats || []).join(", "));
  const passengers = escHtml((t.passengerNames || []).join(", "));
  const fare = Number.isFinite(Number(t.fare)) ? Number(t.fare) : 0;
  const farePerSeat = Number.isFinite(Number(t.farePerSeat)) ? Number(t.farePerSeat) : 0;
  const seatCount = Array.isArray(t.seats) ? t.seats.length : 0;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Ticket ${ticketId}</title>
<style>
body{font-family:Arial,sans-serif;padding:18px;color:#1e2430}
.card{border:1px solid #d7dde8;border-radius:10px;padding:14px;max-width:680px}
h2{margin:0 0 12px;color:#7c0e1a}
.row{margin:6px 0}
</style>
</head>
<body>
  <div class="card">
    <h2>Bus Ticket</h2>
    <div class="row"><strong>Ticket:</strong> ${ticketId}</div>
    <div class="row"><strong>Route:</strong> ${routeText}</div>
    <div class="row"><strong>Service:</strong> ${serviceText}</div>
    <div class="row"><strong>Travel Date:</strong> ${travelDate}</div>
    <div class="row"><strong>Boarding:</strong> ${boarding}</div>
    <div class="row"><strong>Dropping:</strong> ${dropping}</div>
    <div class="row"><strong>Seats:</strong> ${seats}</div>
    <div class="row"><strong>Passengers:</strong> ${passengers}</div>
    <div class="row"><strong>Fare:</strong> Rs ${fare}${farePerSeat ? ` (Rs ${farePerSeat} x ${seatCount})` : ""}</div>
  </div>
</body>
</html>`;
}

function printTicket(t, meta) {
  const w = window.open("", "_blank", "width=900,height=760");
  if (!w) {
    toast("Popup blocked. Allow popups to print ticket.");
    return;
  }
  w.document.write(ticketHtmlForPrint(t, meta));
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 120);
}

function downloadTicketPdf(t, meta) {
  const jsPdfCtor = window?.jspdf?.jsPDF;
  if (!jsPdfCtor) {
    toast("PDF library not loaded. Use Print for now.");
    return;
  }
  const doc = new jsPdfCtor();
  const lines = [
    `Ticket ID: ${t.ticketId || "-"}`,
    `Route: ${routeDisplayText(meta.route)}`,
    `Service: ${busDisplayText(meta.bus, meta.route)}`,
    `Travel Date: ${t.travelDate || "-"}`,
    `Boarding: ${t.boardingStopName || "-"}${t.boardingTime ? ` (${formatTime24(t.boardingTime)})` : ""}`,
    `Dropping: ${t.dropStopName || "-"}${t.dropTime ? ` (${formatTime24(t.dropTime)})` : ""}`,
    `Seats: ${(t.seats || []).join(", ")}`,
    `Passengers: ${(t.passengerNames || []).join(", ")}`,
    `Fare: Rs ${Number(t.fare || 0)}`
  ];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Bus Ticket", 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  let y = 28;
  for (const line of lines) {
    doc.text(String(line), 14, y);
    y += 8;
  }
  const safeId = String(t.ticketId || "ticket").replace(/[^A-Za-z0-9_-]/g, "_");
  doc.save(`${safeId}.pdf`);
}

function myTicketSearchText(t) {
  const meta = getRouteAndBusByTicket(t);
  return [
    t.ticketId,
    t.travelDate,
    t.boardingStopName,
    t.dropStopName,
    t.boardingTime,
    t.dropTime,
    (t.seats || []).join(","),
    (t.passengerNames || []).join(","),
    routeDisplayText(meta.route),
    busDisplayText(meta.bus, meta.route),
    ticketStatusLabel(t)
  ]
    .join(" ")
    .toLowerCase();
}

function refreshMyTickets() {
  const res = callWasmJson("apiTicketsJson");
  if (!res.success) return;
  if (el.ticketSortSelect) {
    myTicketSortOrder = el.ticketSortSelect.value === "asc" ? "asc" : "desc";
  }
  const query = String(el.ticketSearchInput?.value || "").trim().toLowerCase();
  const mine = (res.tickets || [])
    .filter((t) => t.userId === currentUser.uid)
    .filter((t) => (query ? myTicketSearchText(t).includes(query) : true))
    .sort((a, b) => {
      const av = String(a.createdAt || a.ticketId || "");
      const bv = String(b.createdAt || b.ticketId || "");
      return myTicketSortOrder === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  el.myTicketsList.innerHTML = mine.length
    ? mine
        .map(
          (t) => {
            const meta = getRouteAndBusByTicket(t);
            const ticketId = escHtml(t.ticketId || "-");
            const ticketIdAttr = escAttr(t.ticketId || "");
            const routeText = escHtml(routeDisplayText(meta.route));
            const serviceText = escHtml(busDisplayText(meta.bus, meta.route));
            const travelDate = escHtml(t.travelDate || "-");
            const boardingName = escHtml(t.boardingStopName || "-");
            const boardingTime = t.boardingTime ? ` (${escHtml(formatTime24(t.boardingTime))})` : "";
            const droppingName = escHtml(t.dropStopName || "-");
            const droppingTime = t.dropTime ? ` (${escHtml(formatTime24(t.dropTime))})` : "";
            const seatsText = escHtml((t.seats || []).join(", "));
            const passengersText = escHtml((t.passengerNames || []).join(", "));
            const fareTotal = Number.isFinite(Number(t.fare)) ? Number(t.fare) : 0;
            const farePerSeat = Number.isFinite(Number(t.farePerSeat)) ? Number(t.farePerSeat) : 0;
            const seatCount = Array.isArray(t.seats) ? t.seats.length : 0;
            const statusText = ticketStatusLabel(t);
            const isActive = isTicketActive(t);
            return `<div class="ticket-card">
              <strong>${ticketId}</strong><br>
              Route: ${routeText}<br>
              Service: ${serviceText}<br>
              Travel Date: ${travelDate}<br>
              Boarding: ${boardingName}${boardingTime}<br>
              Dropping: ${droppingName}${droppingTime}<br>
              Seats: ${seatsText}<br>
              Passengers: ${passengersText}<br>
              Fare: Rs ${fareTotal}${farePerSeat ? ` (Rs ${farePerSeat} x ${seatCount})` : ""}<br>
              Status: ${statusText}<br>
              <div class="inline-actions">
                ${isActive ? `<button type="button" data-print-ticket="${ticketIdAttr}" class="danger-lite">Print Ticket</button>` : ""}
                ${isActive ? `<button type="button" data-download-ticket="${ticketIdAttr}" class="danger-lite">Download Ticket (PDF)</button>` : ""}
                ${isActive ? `<button type="button" data-cancel="${ticketIdAttr}" class="danger-lite">Cancel Ticket</button>` : ""}
              </div>
            </div>`;
          }
        )
        .join("")
    : "<div>No tickets yet.</div>";
  el.myTicketsList.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ticketId = btn.dataset.cancel;
      const yes = await showConfirm("Cancel Ticket", `Cancel ${ticketId}? Seats will be released.`);
      if (!yes) return;
      const out = callWasmJson("apiCancelTicketForUser", currentUser?.uid || "", ticketId);
      toast(out.message || "Done");
      if (out.success) {
        await refreshAllAfterMutation();
      }
    });
  });
  el.myTicketsList.querySelectorAll("[data-print-ticket]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ticketId = btn.dataset.printTicket;
      const t = mine.find((x) => x.ticketId === ticketId);
      if (!t || t.cancelled) return;
      const meta = getRouteAndBusByTicket(t);
      printTicket(t, meta);
    });
  });
  el.myTicketsList.querySelectorAll("[data-download-ticket]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ticketId = btn.dataset.downloadTicket;
      const t = mine.find((x) => x.ticketId === ticketId);
      if (!t || t.cancelled) return;
      const meta = getRouteAndBusByTicket(t);
      downloadTicketPdf(t, meta);
    });
  });
}

function terminalMenuText() {
  return [
    "===== USER TERMINAL =====",
    "Commands:",
    "routes",
    "services [ROUTE_NO]",
    "select <ROUTE_NO> [SERVICE_NO]",
    "status",
    "date <YYYY-MM-DD>",
    "stops",
    "points <BOARD_STOP_NO> <DROP_STOP_NO>",
    "seats",
    "book <SEATS_CSV> <NAMES_PIPE>",
    "tickets",
    "search <TICKET_ID>",
    "cancel <TICKET_ID>",
    "clear",
    "",
    "Examples:",
    "select 1 2",
    "services",
    "date 2026-04-08",
    "points 1 8",
    "book 1,2 Kumar|Ravi"
  ].join("\n");
}

function appendTerminal(text, autoScroll = true) {
  if (!text) return;
  terminalLines.push(String(text));
  if (terminalLines.length > 300) terminalLines = terminalLines.slice(-220);
  el.terminalOutput.textContent = terminalLines.join("\n");
  if (autoScroll) {
    el.terminalOutput.scrollTop = el.terminalOutput.scrollHeight;
  }
}

function resetTerminal(showMenu = true) {
  terminalLines = [];
  try {
    if (wasm) callWasm("apiClearTerminal");
  } catch {}
  el.terminalOutput.textContent = "";
  if (showMenu) {
    appendTerminal(terminalMenuText(), false);
    el.terminalOutput.scrollTop = 0;
  }
}

function refreshTerminal() {
  el.terminalOutput.textContent = terminalLines.join("\n");
  el.terminalOutput.scrollTop = el.terminalOutput.scrollHeight;
}

function formatTicketsForTerminal(list) {
  if (!list.length) return "No tickets found.";
  return list
    .slice(0, 80)
    .map((t) => {
      const meta = getRouteAndBusByTicket(t);
      return `${t.ticketId} | ${meta.route?.ref || "-"} | ${busDisplayText(meta.bus, meta.route)} | ${t.travelDate || "-"} | ${t.boardingStopName || "-"} -> ${t.dropStopName || "-"} | seats ${t.seats.join(",")} | passengers ${(t.passengerNames || []).join(", ")} | ${ticketStatusLabel(t).toUpperCase()} | Rs ${t.fare}`;
    })
    .join("\n");
}

function terminalContext() {
  const route = currentRoute();
  const bus = currentBus();
  const travelDate = selectedTravelDateYmd() || todayYmdLocal();
  return { route, bus, travelDate };
}

function terminalRouteByNumber(noText) {
  const no = Number(noText);
  if (!Number.isInteger(no) || no < 1 || no > routesCache.length) return null;
  return routesCache[no - 1] || null;
}

function terminalBusByNumber(route, noText) {
  if (!route) return null;
  const buses = route.buses || [];
  const no = Number(noText);
  if (!Number.isInteger(no) || no < 1 || no > buses.length) return null;
  return buses[no - 1] || null;
}

function terminalServiceNo(route, bus) {
  if (!route || !bus) return 0;
  const idx = (route.buses || []).findIndex((b) => b.busId === bus.busId);
  return idx >= 0 ? idx + 1 : 0;
}

function terminalRoutesText() {
  if (!routesCache.length) return "No routes available.";
  const selectedRouteId = currentRoute()?.routeId || "";
  return routesCache
    .map((r, idx) => {
      const mark = r.routeId === selectedRouteId ? "*" : " ";
      return `${idx + 1}. [${mark}] ${r.ref} | ${r.from} -> ${r.to} | Services ${(r.buses || []).length}`;
    })
    .join("\n");
}

function terminalServicesText(route) {
  if (!route) return "Select a route first.";
  const selectedBusId = currentBus()?.busId || "";
  const buses = route.buses || [];
  if (!buses.length) return "No services found for selected route.";
  return buses
    .map((b, idx) => {
      const mark = b.busId === selectedBusId ? "*" : " ";
      return `${idx + 1}. [${mark}] ${buildBusDisplayName(route.ref, b.busCode)} (${formatTime24(b.departureTime)})`;
    })
    .join("\n");
}

function terminalStopsText(route, bus) {
  if (!route || !bus) return "Select route and service first.";
  const boardingId = el.boardingStopSelect?.value || "";
  const dropId = el.droppingStopSelect?.value || "";
  return (route.stops || [])
    .map((s, idx) => {
      const mark = s.stopId === boardingId ? "[B]" : s.stopId === dropId ? "[D]" : "   ";
      return `${mark} ${idx + 1}. ${s.name} (${formatTime24(getStopTimeForBus(route, s, bus.busId))})`;
    })
    .join("\n");
}

function terminalStatusText() {
  const { route, bus, travelDate } = terminalContext();
  if (!route || !bus) return "No route/service selected.";
  const journey = getJourneySelection();
  const boardingText =
    journey.ok && journey.boardingStop
      ? `${journey.boardingStop.name} (${formatTime24(journey.boardingTime)})`
      : "-";
  const droppingText =
    journey.ok && journey.droppingStop
      ? `${journey.droppingStop.name} (${formatTime24(journey.dropTime)})`
      : "-";
  return [
    `Route: ${routeDisplayText(route)}`,
    `Service: #${terminalServiceNo(route, bus)} ${busDisplayText(bus, route)} (${formatTime24(bus.departureTime)})`,
    `Travel Date: ${travelDate}`,
    `Boarding: ${boardingText}`,
    `Dropping: ${droppingText}`
  ].join("\n");
}

async function runTerminalCommand(command) {
  const raw = String(command || "").trim();
  if (!raw) return;
  appendTerminal(`> ${raw}`);
  const [cmd, ...rest] = raw.split(/\s+/);
  const name = cmd.toLowerCase();

  if (name === "clear") {
    resetTerminal(true);
    return;
  }
  if (name === "status") {
    appendTerminal(terminalStatusText());
    return;
  }
  if (name === "routes") {
    appendTerminal(terminalRoutesText());
    return;
  }
  if (name === "services") {
    const route = rest[0] ? terminalRouteByNumber(rest[0]) : currentRoute();
    if (rest[0] && !route) {
      appendTerminal("Route number not found. Use `routes` first.");
      return;
    }
    appendTerminal(terminalServicesText(route));
    return;
  }
  if (name === "tickets") {
    const res = callWasmJson("apiTicketsJson");
    if (!res.success) {
      appendTerminal(res.message || "Unable to load tickets.");
      return;
    }
    const list = (res.tickets || []).filter((t) => t.userId === currentUser?.uid);
    appendTerminal(formatTicketsForTerminal(list));
    return;
  }
  if (name === "search") {
    const ticketId = rest[0] || "";
    if (!ticketId) {
      appendTerminal("Usage: search <TICKET_ID>");
      return;
    }
    const res = callWasmJson("apiSearchTicketForUser", currentUser?.uid || "", ticketId);
    if (!res.success) {
      appendTerminal(res.message || "Ticket not found.");
      return;
    }
    const t = res.ticket;
    if (t?.userId !== currentUser?.uid) {
      appendTerminal("Ticket not found.");
      return;
    }
    const meta = getRouteAndBusByTicket(t);
    appendTerminal(
      [
        `Ticket: ${t.ticketId}`,
        `Route: ${routeDisplayText(meta.route)}`,
        `Service: ${busDisplayText(meta.bus, meta.route)}`,
        `Travel Date: ${t.travelDate || "-"}`,
        `Boarding: ${t.boardingStopName || "-"}${t.boardingTime ? ` (${formatTime24(t.boardingTime)})` : ""}`,
        `Dropping: ${t.dropStopName || "-"}${t.dropTime ? ` (${formatTime24(t.dropTime)})` : ""}`,
        `Seats: ${(t.seats || []).join(", ")}`,
        `Passengers: ${(t.passengerNames || []).join(", ")}`,
        `Fare: Rs ${t.fare}${t.farePerSeat ? ` (Rs ${t.farePerSeat} x ${(t.seats || []).length})` : ""}`,
        `Status: ${ticketStatusLabel(t)}`
      ].join("\n")
    );
    return;
  }
  if (name === "cancel") {
    const ticketId = rest[0] || "";
    if (!ticketId) {
      appendTerminal("Usage: cancel <TICKET_ID>");
      return;
    }
    const sr = callWasmJson("apiSearchTicketForUser", currentUser?.uid || "", ticketId);
    if (!sr.success) {
      appendTerminal(sr.message || "Ticket not found.");
      return;
    }
    if (sr.ticket?.userId !== currentUser?.uid) {
      appendTerminal("Ticket not found.");
      return;
    }
    if (isTicketCompleted(sr.ticket)) {
      appendTerminal("Completed ticket cannot be cancelled.");
      return;
    }
    const out = callWasmJson("apiCancelTicketForUser", currentUser?.uid || "", ticketId);
    appendTerminal(out.message || "Done");
    if (out.success) await refreshAllAfterMutation();
    return;
  }
  if (name === "select" || name === "use") {
    const routeNoText = rest[0] || "";
    const serviceNoText = rest[1] || "";
    const boardingIdxText = rest[2] || "";
    const droppingIdxText = rest[3] || "";

    if (!routeNoText) {
      appendTerminal("Usage: select <ROUTE_NO> [SERVICE_NO] [BOARDING_NO] [DROP_NO]");
      return;
    }
    const route = terminalRouteByNumber(routeNoText);
    if (!route) {
      appendTerminal("Route number not found.");
      return;
    }
    
    // Sync Route
    el.routeSelect.value = route.routeId;
    el.routeSelect.dispatchEvent(new Event("change"));

    // Sync Bus
    if (serviceNoText) {
      const bus = terminalBusByNumber(route, serviceNoText);
      if (bus) {
        el.busSelect.value = bus.busId;
        el.busSelect.dispatchEvent(new Event("change"));
      } else {
        appendTerminal(`Service #${serviceNoText} not found for this route.`);
      }
    }

    // Sync Boarding/Dropping
    const currentBusData = currentBus();
    if (currentBusData) {
      const stops = route.stops || [];
      if (boardingIdxText) {
        const bIdx = parseInt(boardingIdxText) - 1;
        if (stops[bIdx]) {
          el.boardingStopSelect.value = stops[bIdx].stopId;
          el.boardingStopSelect.dispatchEvent(new Event("change"));
        } else {
          appendTerminal(`Boarding stop index ${boardingIdxText} out of range.`);
        }
      }
      if (droppingIdxText) {
        const dIdx = parseInt(droppingIdxText) - 1;
        if (stops[dIdx]) {
          el.droppingStopSelect.value = stops[dIdx].stopId;
          el.droppingStopSelect.dispatchEvent(new Event("change"));
        } else {
          appendTerminal(`Dropping stop index ${droppingIdxText} out of range.`);
        }
      }
    }

    focusMapOnRoute(route.routeId);
    appendTerminal(terminalStatusText());
    return;
  }
  if (name === "date") {
    const inputDate = rest[0] || "";
    const normalized = normalizeYmdInput(inputDate);
    if (!isYmd(normalized)) {
      appendTerminal("Usage: date <YYYY-MM-DD>");
      return;
    }
    const today = todayYmdLocal();
    if (ymdCompare(normalized, today) < 0) {
      appendTerminal("Previous day booking is not allowed.");
      return;
    }
    releaseSelectedSeatLocks();
    el.travelDate.value = normalized;
    updateFarePreview();
    renderRouteMeta();
    renderSeatMap();
    renderPassengerFields();
    appendTerminal(`Travel date set to ${normalized}.`);
    return;
  }
  if (name === "stops") {
    const { route, bus } = terminalContext();
    if (!route || !bus) {
      appendTerminal("Select route/service first. Use: select <ROUTE_NO> [SERVICE_NO]");
      return;
    }
    appendTerminal(terminalStopsText(route, bus));
    return;
  }
  if (name === "points") {
    const { route, bus } = terminalContext();
    if (!route || !bus) {
      appendTerminal("Select route/service first. Use: select <ROUTE_NO> [SERVICE_NO]");
      return;
    }
    const boardNo = Number(rest[0]);
    const dropNo = Number(rest[1]);
    if (!Number.isInteger(boardNo) || !Number.isInteger(dropNo)) {
      appendTerminal("Usage: points <BOARD_STOP_NO> <DROP_STOP_NO>");
      return;
    }
    const stops = route.stops || [];
    if (boardNo < 1 || boardNo > stops.length || dropNo < 1 || dropNo > stops.length) {
      appendTerminal("Stop number out of range. Use `stops`.");
      return;
    }
    if (boardNo >= dropNo) {
      appendTerminal("Dropping stop must be after boarding stop.");
      return;
    }
    const board = stops[boardNo - 1];
    const drop = stops[dropNo - 1];
    el.boardingStopSelect.value = board.stopId;
    syncDroppingOptions();
    el.droppingStopSelect.value = drop.stopId;
    updateFarePreview();
    renderRouteMeta();
    renderPassengerFields();
    appendTerminal(`Boarding set to ${boardNo}. ${board.name}`);
    appendTerminal(`Dropping set to ${dropNo}. ${drop.name}`);
    return;
  }
  if (name === "seats") {
    const { route, bus, travelDate } = terminalContext();
    if (!route || !bus) {
      appendTerminal("Select route/service first. Use: select <ROUTE_NO> [SERVICE_NO]");
      return;
    }
    const res = callWasmJson(
      "apiSeatsJsonForUser",
      route.routeId,
      bus.busId,
      travelDate,
      currentUser?.uid || ""
    );
    if (!res.success) {
      appendTerminal(res.message || "Unable to load seats.");
      return;
    }
    const bookedSeats = (res.seats || [])
      .filter((s) => s.booked)
      .map((s) => Number(s.seat))
      .sort((a, b) => a - b);
    const heldByYouSeats = (res.seats || [])
      .filter((s) => !s.booked && s.lockedByYou)
      .map((s) => Number(s.seat))
      .sort((a, b) => a - b);
    const heldByOthersSeats = (res.seats || [])
      .filter((s) => !s.booked && s.lockedByOther)
      .map((s) => Number(s.seat))
      .sort((a, b) => a - b);
    const booked = bookedSeats.length;
    const held = heldByOthersSeats.length;
    const ownHeld = heldByYouSeats.length;
    const free = res.seatCapacity - booked - held - ownHeld;
    const rows = [];
    for (let seat = 1; seat <= res.seatCapacity; seat += 4) {
      const chunk = [];
      for (let j = 0; j < 4 && seat + j <= res.seatCapacity; j++) {
        const sNo = seat + j;
        const isReserved = bookedSeats.includes(sNo);
        const isMine = heldByYouSeats.includes(sNo);
        const isHeld = heldByOthersSeats.includes(sNo);
        chunk.push(`${String(sNo).padStart(2, "0")}:${isReserved ? "R" : isMine ? "S" : isHeld ? "H" : "A"}`);
      }
      rows.push(chunk.join("  "));
    }
    appendTerminal(`Route ${route.ref} | Service #${terminalServiceNo(route, bus)} | Date ${travelDate}`);
    appendTerminal(`Reserved: ${bookedSeats.length ? bookedSeats.join(", ") : "None"}`);
    appendTerminal(`Held by you: ${heldByYouSeats.length ? heldByYouSeats.join(", ") : "None"}`);
    appendTerminal(`Temporarily held: ${heldByOthersSeats.length ? heldByOthersSeats.join(", ") : "None"}`);
    appendTerminal(`Summary: Reserved ${booked}, Held ${held}, Your Hold ${ownHeld}, Available ${Math.max(0, free)}, Total ${res.seatCapacity}`);
    appendTerminal(rows.join("\n"));
    appendTerminal("Legend: A=Available, S=Selected, H=Temporarily Held, R=Reserved");
    return;
  }
  if (name === "book") {
    if (rest.length < 2) {
      appendTerminal("Usage: book <SEATS_CSV> <NAMES_PIPE>");
      appendTerminal("Example: book 1,2 Kumar|Ravi");
      return;
    }
    const seatsCsv = rest[0];
    const namesPipe = rest.slice(1).join(" ");
    const journey = getJourneySelection();
    if (!journey.ok) {
      appendTerminal(journey.message || "Select valid booking details first.");
      return;
    }
    const passengerCsv = namesPipe.split("|").map((n) => n.trim()).join(",");
    const lockRes = callWasmJson(
      "apiUpsertSeatLocks",
      currentUser.uid,
      journey.route.routeId,
      journey.bus.busId,
      journey.travelDate,
      seatsCsv,
      SEAT_LOCK_TTL_SECONDS
    );
    if (!lockRes.success) {
      appendTerminal(lockRes.message || "Unable to lock seats.");
      return;
    }
    await flushCloudSync();
    const out = callWasmJson(
      "apiBookTicket",
      currentUser.uid,
      el.profileName.value.trim() || currentUser.displayName || "User",
      journey.route.routeId,
      journey.bus.busId,
      seatsCsv,
      passengerCsv,
      journey.travelDate,
      journey.boardingStopId,
      journey.droppingStopId
    );
    appendTerminal(out.message || "Done");
    if (out.success && out.ticket?.ticketId) appendTerminal(`Ticket ID: ${out.ticket.ticketId}`);
    if (out.success) {
      clearSeatSelectionState();
      await refreshAllAfterMutation({
        bookingRouteId: journey.route.routeId,
        bookingBusId: journey.bus.busId,
        mapRouteId: journey.route.routeId
      });
      appendTerminal(`Booked on ${journey.travelDate} from ${journey.boardingStop.name} to ${journey.droppingStop.name}.`);
    }
    return;
  }
  appendTerminal("Unknown command. Type `clear` to see command list.");
}

function distanceKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const v =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
}

function stopRouteDirectionAnimation() {
  if (routeDirectionAnimationFrame !== null) {
    cancelAnimationFrame(routeDirectionAnimationFrame);
    routeDirectionAnimationFrame = null;
  }
  routeDirectionLines = [];
}

function startRouteDirectionAnimation() {
  // Direction animation is handled via CSS class on SVG path.
  routeDirectionAnimationFrame = null;
}

function splitPathIntoRoadSegments(path) {
  const segments = [];
  let current = [];
  for (const pt of path || []) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const p = [Number(pt[0]), Number(pt[1])];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (!current.length) {
      current.push(p);
      continue;
    }
    const prev = current[current.length - 1];
    const jump = distanceKm(prev, p);
    if (jump > 0.65) {
      if (current.length > 1) segments.push(current);
      current = [p];
    } else {
      current.push(p);
    }
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

function clonePath(path) {
  return (path || []).map((p) => [Number(p[0]), Number(p[1])]);
}

function stopAdminPathDashAnimation() {
  if (adminPathDashAnimationFrame !== null) {
    cancelAnimationFrame(adminPathDashAnimationFrame);
    adminPathDashAnimationFrame = null;
  }
}

function pushAdminPathHistory() {
  adminPathHistory.push(clonePath(adminPathDraft));
  if (adminPathHistory.length > 30) adminPathHistory.shift();
}

function setAdminPathMode(mode) {
  adminPathMode = mode;
  const items = [
    [el.adminPathAppendModeBtn, "append"],
    [el.adminPathInsertModeBtn, "insert"],
    [el.adminPathMoveModeBtn, "move"]
  ];
  items.forEach(([button, key]) => {
    if (!button) return;
    button.classList.toggle("mode-active", adminPathMode === key);
  });
  updateAdminPathMeta();
}

function updateAdminPathMeta() {
  if (!el.adminPathMeta) return;
  const route = routeById(el.adminPathRouteSelect?.value || "");
  if (!route) {
    el.adminPathMeta.textContent = "Select a route to edit path points.";
    return;
  }
  const selected =
    adminPathSelectedIndex >= 0 && adminPathSelectedIndex < adminPathDraft.length
      ? adminPathDraft[adminPathSelectedIndex]
      : null;
  const modeText =
    adminPathMode === "append"
      ? "Append: click map to add new point at end."
      : adminPathMode === "insert"
        ? "Insert: select a point, then click map to insert after it."
        : adminPathMode === "move"
          ? "Move: select a point, then click map to move it."
          : "Select points by clicking them on map.";
  el.adminPathMeta.textContent =
    `Route: ${route.ref}\n` +
    `Points: ${adminPathDraft.length}${adminPathDirty ? " (unsaved changes)" : ""}\n` +
    `Selected index: ${selected ? adminPathSelectedIndex : "none"}${selected ? ` -> ${selected[0].toFixed(6)}, ${selected[1].toFixed(6)}` : ""}\n` +
    modeText;
}

function initAdminPathMap() {
  if (adminPathMap) return;
  adminPathMap = L.map("adminPathMap").setView([13.058, 80.26], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(adminPathMap);
  adminPathRouteLayer = L.layerGroup().addTo(adminPathMap);
  adminPathPointsLayer = L.layerGroup().addTo(adminPathMap);
  adminPathStopsLayer = L.layerGroup().addTo(adminPathMap);

  adminPathMap.on("click", (e) => {
    if (!isAdmin) return;
    const routeId = el.adminPathRouteSelect?.value || "";
    if (!routeId || !routeById(routeId)) return;
    const lat = Number(e.latlng.lat.toFixed(6));
    const lon = Number(e.latlng.lng.toFixed(6));
    if (adminPathMode === "append") {
      pushAdminPathHistory();
      adminPathDraft.push([lat, lon]);
      adminPathSelectedIndex = adminPathDraft.length - 1;
      adminPathDirty = true;
      renderAdminPathEditor();
      return;
    }
    if (adminPathMode === "insert") {
      if (adminPathSelectedIndex < 0 || adminPathSelectedIndex >= adminPathDraft.length) {
        toast("Select a path point first.");
        return;
      }
      pushAdminPathHistory();
      adminPathDraft.splice(adminPathSelectedIndex + 1, 0, [lat, lon]);
      adminPathSelectedIndex += 1;
      adminPathDirty = true;
      renderAdminPathEditor();
      return;
    }
    if (adminPathMode === "move") {
      if (adminPathSelectedIndex < 0 || adminPathSelectedIndex >= adminPathDraft.length) {
        toast("Select a path point first.");
        return;
      }
      pushAdminPathHistory();
      adminPathDraft[adminPathSelectedIndex] = [lat, lon];
      adminPathDirty = true;
      renderAdminPathEditor();
    }
  });
}

function loadAdminPathDraftFromRoute(routeId, preserveSelection = false) {
  const route = routeById(routeId);
  if (!route) return;
  const sourcePath =
    Array.isArray(route.path) && route.path.length > 1
      ? route.path
      : (route.stops || []).map((s) => [Number(s.lat), Number(s.lon)]);
  adminPathDraft = clonePath(sourcePath);
  adminPathHistory = [];
  adminPathDirty = false;
  if (!preserveSelection) {
    adminPathSelectedIndex = -1;
  } else if (adminPathSelectedIndex >= adminPathDraft.length) {
    adminPathSelectedIndex = adminPathDraft.length - 1;
  }
  renderAdminPathEditor();
}

function renderAdminPathEditor() {
  if (!isAdmin) return;
  initAdminPathMap();
  stopAdminPathDashAnimation();
  adminPathRouteLayer.clearLayers();
  adminPathPointsLayer.clearLayers();
  adminPathStopsLayer.clearLayers();

  const route = routeById(el.adminPathRouteSelect.value);
  if (!route) {
    updateAdminPathMeta();
    return;
  }

  const bounds = L.latLngBounds([]);
  if (adminPathDraft.length > 1) {
    L.polyline(adminPathDraft, {
      color: "#cf1a2e",
      weight: 5,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(adminPathRouteLayer);
  }
  if (adminPathDraft.length > 1) {
    const moving = L.polyline(adminPathDraft, {
      color: "#fff7da",
      weight: 3,
      opacity: 0.9,
      dashArray: "10 16",
      dashOffset: "0"
    }).addTo(adminPathRouteLayer);
    let off = 0;
    const animate = () => {
      if (!adminPathRouteLayer || !adminPathRouteLayer.hasLayer(moving)) return;
      off -= 0.8;
      moving.setStyle({ dashOffset: `${off}` });
      adminPathDashAnimationFrame = requestAnimationFrame(animate);
    };
    adminPathDashAnimationFrame = requestAnimationFrame(animate);
  }

  adminPathDraft.forEach((point, index) => {
    const marker = L.circleMarker(point, {
      radius: index === adminPathSelectedIndex ? 7 : 4,
      color: index === adminPathSelectedIndex ? "#0f4e73" : "#8c0d19",
      fillColor: index === adminPathSelectedIndex ? "#2288be" : "#d80f22",
      fillOpacity: 0.95,
      weight: 2
    }).addTo(adminPathPointsLayer);
    marker.bindTooltip(`#${index}`, { direction: "top", offset: [0, -2] });
    marker.on("click", () => {
      adminPathSelectedIndex = index;
      renderAdminPathEditor();
    });
    bounds.extend(point);
  });

  (route.stops || []).forEach((s, idx) => {
    const stopMarker = L.circleMarker([Number(s.lat), Number(s.lon)], {
      radius: idx === 0 || idx === route.stops.length - 1 ? 6 : 4,
      color: "#2e5652",
      fillColor: "#67a39c",
      fillOpacity: 0.68,
      weight: 1.5
    }).addTo(adminPathStopsLayer);
    const edgeLabel = idx === 0 ? "Start Stop" : idx === route.stops.length - 1 ? "End Stop" : "Stop";
    stopMarker.bindPopup(`<strong>${edgeLabel}</strong><br>${s.name}`);
    bounds.extend([Number(s.lat), Number(s.lon)]);
  });

  updateAdminPathMeta();
  if (bounds.isValid()) {
    adminPathMap.fitBounds(bounds, { padding: [26, 26] });
  }
}

function undoAdminPathEdit() {
  if (!adminPathHistory.length) {
    toast("Nothing to undo.");
    return;
  }
  adminPathDraft = adminPathHistory.pop();
  adminPathDirty = true;
  if (adminPathSelectedIndex >= adminPathDraft.length) {
    adminPathSelectedIndex = adminPathDraft.length - 1;
  }
  renderAdminPathEditor();
}

function deleteAdminPathSelectedPoint() {
  if (adminPathSelectedIndex < 0 || adminPathSelectedIndex >= adminPathDraft.length) {
    toast("Select a point first.");
    return;
  }
  if (adminPathDraft.length <= 2) {
    toast("Path must keep at least 2 points.");
    return;
  }
  pushAdminPathHistory();
  adminPathDraft.splice(adminPathSelectedIndex, 1);
  if (adminPathSelectedIndex >= adminPathDraft.length) {
    adminPathSelectedIndex = adminPathDraft.length - 1;
  }
  adminPathDirty = true;
  renderAdminPathEditor();
}

async function saveAdminPathToRoute() {
  if (!isAdmin) return;
  const routeId = el.adminPathRouteSelect.value;
  if (!routeId) {
    toast("Select a route first.");
    return;
  }
  if (adminPathDraft.length < 2) {
    toast("Path needs at least 2 points.");
    return;
  }
  const yes = await showConfirm(
    "Save Route Path",
    `Save ${adminPathDraft.length} path points for route ${(routeById(routeId)?.ref || "selected route")}? Stops will not be changed.`,
    "Save Path"
  );
  if (!yes) return;

  setButtonBusy(el.adminPathSaveBtn, true, "Saving...");
  try {
    const clear = callWasmJson("apiClearRoutePath", routeId);
    if (!clear.success) {
      toast(clear.message || "Failed to clear path.");
      return;
    }
    for (const point of adminPathDraft) {
      const added = callWasmJson("apiAddPathPoint", routeId, Number(point[0]), Number(point[1]));
      if (!added.success) {
        toast(added.message || "Failed while adding path point.");
        return;
      }
    }
    await refreshAllAfterMutation({ focusMapRouteId: routeId, mapRouteId: routeId });
    loadAdminPathDraftFromRoute(routeId, true);
    toast("Route path saved and synced.");
  } finally {
    setButtonBusy(el.adminPathSaveBtn, false);
  }
}

function initMap() {
  if (map) return;
  map = L.map("mapView", {
    zoomControl: true,
    preferCanvas: false,
    fadeAnimation: false,
    markerZoomAnimation: false
  }).setView([13.058, 80.26], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
    updateWhenIdle: true,
    keepBuffer: 8
  }).addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  stopLayer = L.layerGroup().addTo(map);
  mapSvgRenderer = L.svg();
  map.addLayer(mapSvgRenderer);
  const invalidate = () => {
    if (!map) return;
    clearTimeout(mapInvalidateTimer);
    mapInvalidateTimer = setTimeout(() => {
      try {
        map.invalidateSize(true);
      } catch {}
    }, 40);
  };
  const mapView = document.getElementById("mapView");
  if (mapView && typeof ResizeObserver !== "undefined") {
    mapResizeObserver = new ResizeObserver(() => invalidate());
    mapResizeObserver.observe(mapView);
  }
  window.addEventListener("resize", invalidate);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) invalidate();
  });
  map.whenReady(() => {
    invalidate();
    setTimeout(invalidate, 180);
  });
}

function renderMapRoute() {
  initMap();
  try {
    map.invalidateSize(true);
  } catch {}
  stopRouteDirectionAnimation();
  routeLayer.clearLayers();
  stopLayer.clearLayers();
  const route = routeById(el.mapRouteSelect.value);
  if (!route) return;

  let pathPoints =
    (route.path || []).length > 1
      ? route.path
      : (route.stops || []).map((s) => [Number(s.lat), Number(s.lon)]);
  const segments = splitPathIntoRoadSegments(pathPoints);
  if (!segments.length) {
    return;
  }

  const bounds = L.latLngBounds([]);
  for (const segment of segments) {
    if (!Array.isArray(segment) || segment.length < 2) continue;
    L.polyline(segment, {
      renderer: mapSvgRenderer,
      color: "#cf1a2e",
      weight: 6,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(routeLayer);
    const directionLine = L.polyline(segment, {
      renderer: mapSvgRenderer,
      color: "#fff7da",
      weight: 3,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
      dashArray: "12 18",
      dashOffset: "0",
      className: "route-flow-line"
    }).addTo(routeLayer);
    routeDirectionLines.push(directionLine);
    for (const point of segment) {
      bounds.extend(point);
    }
  }
  startRouteDirectionAnimation();

  route.stops.forEach((s, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === route.stops.length - 1;
    const marker = L.circleMarker([s.lat, s.lon], {
      radius: isFirst || isLast ? 7 : 5,
      color: isFirst ? "#0f7a43" : "#8c0d19",
      fillColor: isFirst ? "#1ab567" : "#d80f22",
      fillOpacity: 0.85
    }).addTo(stopLayer);
    const allServiceTimes = (route.buses || [])
      .map((b, idx) => {
        const t = formatTime24(getStopTimeForBus(route, s, b.busId));
        return `Service ${idx + 1} (${formatTime24(b.departureTime)}): ${t}`;
      })
      .join("<br>");
    const endpointLabel = isFirst ? "<strong>Start Stop</strong><br>" : (isLast ? "<strong>End Stop</strong><br>" : "");
    marker.bindPopup(
      `${endpointLabel}<strong>${s.name}</strong><br>${allServiceTimes}`
    );
  });

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [24, 24] });
  }
  setTimeout(() => {
    try {
      map.invalidateSize(true);
    } catch {}
  }, 80);
}

function refreshCoordPointLog() {
  if (!el.coordPointsLog || !el.coordLastPoint) return;
  if (!coordPoints.length) {
    el.coordLastPoint.textContent = "Last click: not set";
    el.coordPointsLog.value = "";
    return;
  }
  const last = coordPoints[coordPoints.length - 1];
  el.coordLastPoint.textContent = `Last click: ${last}`;
  el.coordPointsLog.value = coordPoints.map((p, i) => `${i + 1}. ${p}`).join("\n");
  el.coordPointsLog.scrollTop = el.coordPointsLog.scrollHeight;
}

function initCoordMap() {
  if (coordMap || !el.coordMapView) return;
  coordMap = L.map("coordMapView").setView([13.058, 80.26], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(coordMap);
  coordRouteLayer = L.layerGroup().addTo(coordMap);
  coordStopLayer = L.layerGroup().addTo(coordMap);
  coordMap.on("click", (e) => {
    const lat = Number(e.latlng.lat.toFixed(6));
    const lon = Number(e.latlng.lng.toFixed(6));
    const text = `${lat}, ${lon}`;
    coordPoints.push(text);
    if (!coordClickMarker) {
      coordClickMarker = L.circleMarker([lat, lon], {
        radius: 6,
        color: "#0d5f8c",
        fillColor: "#1996d8",
        fillOpacity: 0.9
      }).addTo(coordRouteLayer);
    } else {
      coordClickMarker.setLatLng([lat, lon]);
    }
    refreshCoordPointLog();
  });
}

function renderCoordMapRoute() {
  if (!el.coordRouteSelect) return;
  initCoordMap();
  if (!coordMap || !coordRouteLayer || !coordStopLayer) return;
  coordRouteLayer.clearLayers();
  coordStopLayer.clearLayers();
  coordClickMarker = null;

  const route = routeById(el.coordRouteSelect.value);
  if (!route) return;
  const path =
    (route.path || []).length > 1
      ? route.path
      : (route.stops || []).map((s) => [Number(s.lat), Number(s.lon)]);
  const segments = splitPathIntoRoadSegments(path);
  const bounds = L.latLngBounds([]);
  for (const seg of segments) {
    if (!Array.isArray(seg) || seg.length < 2) continue;
    L.polyline(seg, {
      color: "#cf1a2e",
      weight: 6,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(coordRouteLayer);
    for (const p of seg) bounds.extend(p);
  }
  (route.stops || []).forEach((s, idx) => {
    const marker = L.circleMarker([s.lat, s.lon], {
      radius: idx === 0 || idx === route.stops.length - 1 ? 6 : 4,
      color: "#8c0d19",
      fillColor: "#d80f22",
      fillOpacity: 0.85
    }).addTo(coordStopLayer);
    marker.bindPopup(`<strong>${s.name}</strong><br>${Number(s.lat).toFixed(6)}, ${Number(s.lon).toFixed(6)}`);
    bounds.extend([s.lat, s.lon]);
  });
  if (bounds.isValid()) {
    coordMap.fitBounds(bounds, { padding: [20, 20] });
  }
  setTimeout(() => coordMap?.invalidateSize(), 40);
}

async function copyTextToClipboard(text) {
  const value = String(text || "").trim();
  if (!value) {
    toast("Nothing to copy.");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    toast("Copied.");
  } catch {
    const temp = document.createElement("textarea");
    temp.value = value;
    temp.style.position = "fixed";
    temp.style.left = "-1000px";
    document.body.appendChild(temp);
    temp.focus();
    temp.select();
    try {
      document.execCommand("copy");
      toast("Copied.");
    } catch {
      toast("Copy failed.");
    } finally {
      document.body.removeChild(temp);
    }
  }
}

async function loadRole(uid) {
  const snap = await getDoc(doc(db, "roles", uid));
  isAdmin = !!(snap.exists() && snap.data()?.role === "admin");
  el.adminTabBtn.classList.toggle("hidden", !isAdmin);
}

async function hydrateRoleInBackground(user) {
  try {
    await loadRole(user.uid);
  } catch (e) {
    console.error("Role load failed:", e);
    isAdmin = false;
    el.adminTabBtn.classList.add("hidden");
  }
  updateUserPill();
  if (isAdmin) {
    if (activeTabId() === "adminTab") switchAdminPanel("adminTicketsPanel");
    renderAllViews({
      bookingRouteId: el.routeSelect.value,
      bookingBusId: el.busSelect.value,
      mapRouteId: el.mapRouteSelect.value
    });
  } else if (activeTabId() === "adminTab") {
    document.querySelector('[data-tab="bookingTab"]')?.click();
  }
}

function stopCloudStateListener() {
  if (typeof cloudStateUnsub === "function") {
    cloudStateUnsub();
    cloudStateUnsub = null;
  }
}

function startCloudStateListener() {
  if (!currentUser || !cloudReadyForWrites) return;
  stopCloudStateListener();
  const stateRef = doc(db, "app_state", "main");
  cloudStateUnsub = onSnapshot(
    stateRef,
    (snap) => {
      if (isHydrating || !snap.exists()) return;
      const snapshot = String(snap.data()?.snapshot || "");
      if (!snapshot || snapshot === lastSyncedSnapshot) return;
      const imported = callWasmJson("apiImportSnapshot", snapshot);
      if (!imported.success) return;
      lastSyncedSnapshot = snapshot;
      renderAllViews({
        bookingRouteId: el.routeSelect.value,
        bookingBusId: el.busSelect.value,
        mapRouteId: el.mapRouteSelect.value
      });
      if (cloudSyncUiState !== "syncing") {
        setCloudSyncUi("online", "Cloud Sync: Active");
      }
    },
    () => {
      setCloudSyncUi("error", "Cloud Sync: Reconnecting");
    }
  );
  if (cloudSyncUiState !== "syncing") {
    setCloudSyncUi("online", "Cloud Sync: Active");
  }
}

async function loadCloudSnapshot() {
  isHydrating = true;
  cloudReadyForWrites = false;
  setCloudSyncUi("checking", "Cloud Sync: Checking");
  try {
    const stateRef = doc(db, "app_state", "main");
    const snap = await Promise.race([
      getDoc(stateRef),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Cloud fetch timeout")), 5000))
    ]);
    const data = snap.exists() ? snap.data() : null;
    const snapshot = String(data?.snapshot || "");
    if (snapshot) {
      const imported = callWasmJson("apiImportSnapshot", snapshot);
      if (!imported.success) {
        throw new Error(imported.message || "Cloud snapshot import failed.");
      }
      lastSyncedSnapshot = snapshot;
      cloudReadyForWrites = true;
    } else if (!snap.exists()) {
      // First run: no cloud snapshot yet. Keep runtime empty until user/admin adds data.
      callWasmJson("apiResetSystem");
      lastSyncedSnapshot = callWasm("apiExportSnapshot");
      cloudReadyForWrites = true;
    } else {
      // Document exists but snapshot field is missing/empty.
      callWasmJson("apiResetSystem");
      lastSyncedSnapshot = callWasm("apiExportSnapshot");
      cloudReadyForWrites = true;
    }
    refreshRoutesCache();
    if (!lastSyncedSnapshot) {
      lastSyncedSnapshot = callWasm("apiExportSnapshot");
    }
    setCloudSyncUi("online", "Cloud Sync: Active");
    return true;
  } catch (e) {
    console.error("Cloud snapshot load failed:", e);
    cloudReadyForWrites = false;
    setCloudSyncUi("error", "Cloud Sync: Not Available");
    return false;
  } finally {
    isHydrating = false;
  }
}

async function syncNow() {
  if (!currentUser || isHydrating || !cloudReadyForWrites) return;
  const snapshot = callWasm("apiExportSnapshot");
  if (snapshot === lastSyncedSnapshot) return;
  setCloudSyncUi("syncing", "Cloud Sync: Syncing");
  await setDoc(
    doc(db, "app_state", "main"),
    { snapshot, updatedAt: serverTimestamp() },
    { merge: true }
  );
  lastSyncedSnapshot = snapshot;
  setCloudSyncUi("online", "Cloud Sync: Active");
}

async function flushCloudSync() {
  if (syncInFlight) {
    syncRunAgain = true;
    return;
  }
  syncInFlight = true;
  try {
    await syncNow();
  } catch {
    setCloudSyncUi("error", "Cloud Sync: Retry Needed");
    toast("Cloud sync failed.");
  } finally {
    syncInFlight = false;
    if (syncRunAgain) {
      syncRunAgain = false;
      queueCloudSync(120);
    }
  }
}

function queueCloudSync(delayMs = 250) {
  if (isHydrating || !currentUser || !cloudReadyForWrites) return Promise.resolve();
  const snapshot = callWasm("apiExportSnapshot");
  if (snapshot === lastSyncedSnapshot) return Promise.resolve();
  clearTimeout(syncTimer);
  return new Promise((resolve) => {
    syncTimer = setTimeout(async () => {
      await flushCloudSync();
      resolve();
    }, delayMs);
  });
}

function activeTabId() {
  const active = document.querySelector(".tab-btn.active[data-tab]");
  return active ? active.dataset.tab : "bookingTab";
}

function switchAuthPane(mode) {
  const loginMode = mode === "login";
  el.authLoginPane.classList.toggle("hidden", !loginMode);
  el.authSignupPane.classList.toggle("hidden", loginMode);
  el.authLoginTabBtn.classList.toggle("active", loginMode);
  el.authSignupTabBtn.classList.toggle("active", !loginMode);

  const subtitle = document.getElementById("authHeaderSubtitle");
  if (subtitle) {
    subtitle.textContent = loginMode
      ? "Please provide your authorized credentials to access the management interface."
      : "Enter your details to create an official administrative account.";
  }

  const cardTitle = document.querySelector(".auth-card h2");
  if (cardTitle) {
    cardTitle.textContent = loginMode ? "Welcome" : "New Account";
  }

  const splineTitleText = document.getElementById("splineTitleText");
  if (splineTitleText) {
    splineTitleText.style.opacity = "0";
    setTimeout(() => {
      splineTitleText.innerText = loginMode ? "Welcome Back." : "Get started.";
      splineTitleText.style.opacity = "1";
    }, 300);
  }
}

function bindTabs() {
  document.querySelectorAll(".tab-btn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      resetTerminal(false);
      document.querySelectorAll(".tab-btn[data-tab]").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "terminalTab") {
        resetTerminal(true);
      }
      if (btn.dataset.tab === "bookingTab") setTimeout(() => map?.invalidateSize(), 100);
    });
  });
}

function switchAdminPanel(panelId) {
  document.querySelectorAll(".admin-nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.adminPanel === panelId);
  });
  document.querySelectorAll(".admin-panel").forEach((p) => {
    p.classList.toggle("active", p.id === panelId);
  });
}

function bindAdminPanels() {
  document.querySelectorAll(".admin-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchAdminPanel(btn.dataset.adminPanel);
    });
  });
}

function clearRouteForm() {
  document.getElementById("adminRouteId").value = "";
  document.getElementById("adminRouteRef").value = "";
  document.getElementById("adminRouteFare").value = "";
}

function clearBusForm() {
  document.getElementById("adminBusId").value = "";
  document.getElementById("adminBusId").readOnly = false;
  document.getElementById("adminBusCode").value = "";
  document.getElementById("adminBusTime").value = "";
}

function setBusFormEnabled(enabled) {
  const ids = ["adminBusCode", "adminBusTime"];
  for (const id of ids) {
    const node = document.getElementById(id);
    if (!node) continue;
    node.disabled = !enabled;
  }
  const submit = document.querySelector("#busForm button[type='submit']");
  if (submit) submit.disabled = !enabled;
  if (el.deleteBusBtn) el.deleteBusBtn.disabled = !enabled;
}

function clearStopForm() {
  document.getElementById("adminStopId").value = "";
  document.getElementById("adminStopName").value = "";
}

function setStopFormEnabled(enabled) {
  const ids = ["adminStopName"];
  for (const id of ids) {
    const node = document.getElementById(id);
    if (!node) continue;
    node.disabled = !enabled;
  }
  const submit = document.querySelector("#stopForm button[type='submit']");
  if (submit) submit.disabled = !enabled;
}

function ticketSearchText(t) {
  return [
    t.ticketId,
    t.userName,
    t.userId,
    t.routeId,
    t.busId,
    t.travelDate,
    t.boardingStopName,
    t.dropStopName,
    t.boardingTime,
    t.dropTime,
    (t.seats || []).join(","),
    (t.passengerNames || []).join(","),
    t.createdAt
  ]
    .join(" ")
    .toLowerCase();
}

function renderAdminTickets() {
  if (!isAdmin || !el.adminTicketsList) return;
  const res = callWasmJson("apiTicketsJson");
  if (!res.success) {
    el.adminTicketsMeta.textContent = res.message || "Unable to load tickets.";
    el.adminTicketsList.innerHTML = "";
    return;
  }
  const query = adminTicketQuery.trim().toLowerCase();
  const all = [...(res.tickets || [])].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const filtered = query ? all.filter((t) => ticketSearchText(t).includes(query)) : all;
  const activeCount = filtered.filter((t) => isTicketActive(t)).length;
  el.adminTicketsMeta.textContent = `Showing ${filtered.length} / ${all.length} tickets. Active: ${activeCount}.`;
  el.adminTicketsList.innerHTML = filtered.length
    ? filtered
        .map(
          (t) => {
            const meta = getRouteAndBusByTicket(t);
            const ticketId = escHtml(t.ticketId || "-");
            const ticketIdAttr = escAttr(t.ticketId || "");
            const userName = escHtml(t.userName || "-");
            const userId = escHtml(t.userId || "-");
            const routeText = escHtml(routeDisplayText(meta.route));
            const serviceText = escHtml(busDisplayText(meta.bus, meta.route));
            const travelDate = escHtml(t.travelDate || "-");
            const boardingName = escHtml(t.boardingStopName || "-");
            const boardingTime = t.boardingTime ? ` (${escHtml(formatTime24(t.boardingTime))})` : "";
            const droppingName = escHtml(t.dropStopName || "-");
            const droppingTime = t.dropTime ? ` (${escHtml(formatTime24(t.dropTime))})` : "";
            const seatsText = escHtml((t.seats || []).join(", "));
            const passengersText = escHtml((t.passengerNames || []).join(", "));
            const fareTotal = Number.isFinite(Number(t.fare)) ? Number(t.fare) : 0;
            const farePerSeat = Number.isFinite(Number(t.farePerSeat)) ? Number(t.farePerSeat) : 0;
            const seatCount = Array.isArray(t.seats) ? t.seats.length : 0;
            const statusText = ticketStatusLabel(t);
            const canCancel = isTicketActive(t);
            const canDelete = t.cancelled || isTicketCompleted(t);
            return `<div class="ticket-card admin-ticket-card">
              <strong>${ticketId}</strong>
              <div>User: ${userName} (${userId})</div>
              <div>Route: ${routeText}</div>
              <div>Service: ${serviceText}</div>
              <div>Travel Date: ${travelDate}</div>
              <div>Boarding: ${boardingName}${boardingTime}</div>
              <div>Dropping: ${droppingName}${droppingTime}</div>
              <div>Seats: ${seatsText}</div>
              <div>Passengers: ${passengersText}</div>
              <div>Fare: Rs ${fareTotal}${farePerSeat ? ` (Rs ${farePerSeat} x ${seatCount})` : ""} | ${statusText}</div>
              <div class="inline-actions">
                ${
                  canDelete
                    ? `<button type="button" class="danger-lite" data-clear-ticket-record="${ticketIdAttr}">Delete Record</button>`
                    : ""
                }
                ${canCancel ? `<button type="button" class="danger-lite" data-cancel-ticket="${ticketIdAttr}">Cancel Ticket</button>` : ""}
              </div>
            </div>`;
          }
        )
        .join("")
    : "<div>No tickets found for current search.</div>";

  el.adminTicketsList.querySelectorAll("[data-cancel-ticket]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ticketId = btn.dataset.cancelTicket;
      const yes = await showConfirm("Cancel Ticket", `Cancel ticket ${ticketId}? Seats will be released.`);
      if (!yes) return;
      const out = callWasmJson("apiCancelTicket", ticketId);
      toast(out.message || "Done");
      if (out.success) await refreshAllAfterMutation();
    });
  });

  el.adminTicketsList.querySelectorAll("[data-clear-ticket-record]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ticketId = btn.dataset.clearTicketRecord;
      const ticket = filtered.find((x) => x.ticketId === ticketId);
      const yes = await showConfirm(
        "Delete Ticket Record",
        `Delete ${ticketStatusLabel(ticket)} ticket record ${ticketId}? This removes it from ticket history.`
      );
      if (!yes) return;
      const out = callWasmJson("apiDeleteTicketRecord", ticketId);
      toast(out.message || "Done");
      if (out.success) await refreshAllAfterMutation();
    });
  });
}

function populateAdminPassengerRouteSelect() {
  if (!isAdmin || !el.adminPassengerRoute) return;
  const prevRouteId = el.adminPassengerRoute.value;
  fillSelect(
    el.adminPassengerRoute,
    routesCache,
    (r) => r.routeId,
    (r) => `${r.ref} - ${r.from} -> ${r.to}`
  );
  if (routesCache.length) {
    const hasPrev = routesCache.some((r) => r.routeId === prevRouteId);
    el.adminPassengerRoute.value = hasPrev ? prevRouteId : routesCache[0].routeId;
  }
}

function populateAdminPassengerBusSelect() {
  if (!isAdmin || !el.adminPassengerRoute || !el.adminPassengerBus) return;
  const route = routeById(el.adminPassengerRoute.value);
  const prevBusId = el.adminPassengerBus.value;
  fillSelect(
    el.adminPassengerBus,
    route?.buses || [],
    (b) => b.busId,
    (b) => `${buildBusDisplayName(route?.ref || "", b.busCode)} (${formatTime24(b.departureTime)})`
  );
  if ((route?.buses || []).length) {
    const hasPrev = route.buses.some((b) => b.busId === prevBusId);
    el.adminPassengerBus.value = hasPrev ? prevBusId : route.buses[0].busId;
  }
}

function renderAdminPassengerManifest() {
  if (!isAdmin || !el.adminPassengerMeta || !el.adminPassengerList) return;
  const route = routeById(el.adminPassengerRoute?.value || "");
  const bus = route?.buses?.find((b) => b.busId === el.adminPassengerBus?.value) || null;
  const travelDate = normalizeYmdInput(el.adminPassengerDate?.value || "");
  if (!route || !bus || !isYmd(travelDate)) {
    adminPassengerRows = [];
    el.adminPassengerMeta.textContent = "Select route, service and travel date.";
    el.adminPassengerList.innerHTML = "";
    return;
  }
  const res = callWasmJson("apiTicketsJson");
  if (!res.success) {
    adminPassengerRows = [];
    el.adminPassengerMeta.textContent = res.message || "Unable to load tickets.";
    el.adminPassengerList.innerHTML = "";
    return;
  }
  const tickets = (res.tickets || [])
    .filter((t) => !t.cancelled && t.routeId === route.routeId && t.busId === bus.busId && t.travelDate === travelDate)
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const rows = [];
  for (const t of tickets) {
    const seats = Array.isArray(t.seats) ? t.seats : [];
    const names = Array.isArray(t.passengerNames) ? t.passengerNames : [];
    for (let i = 0; i < seats.length; i += 1) {
      rows.push({
        ticketId: t.ticketId || "-",
        userName: t.userName || "-",
        travelDate: t.travelDate || "-",
        seat: seats[i],
        passengerName: names[i] || "-",
        boarding: t.boardingStopName || "-",
        boardingTime: t.boardingTime ? formatTime24(t.boardingTime) : "-",
        dropping: t.dropStopName || "-",
        dropTime: t.dropTime ? formatTime24(t.dropTime) : "-"
      });
    }
  }
  adminPassengerRows = rows;
  el.adminPassengerMeta.textContent =
    `Route: ${route.ref} | Service: ${buildBusDisplayName(route.ref, bus.busCode)} | Date: ${travelDate}\nTickets: ${tickets.length} | Passenger records: ${rows.length}`;
  el.adminPassengerList.innerHTML = rows.length
    ? rows
        .map(
          (row, idx) =>
            `<div class="ticket-card admin-ticket-card">
              <strong>${idx + 1}. Seat ${escHtml(row.seat)}</strong>
              <div>Passenger: ${escHtml(row.passengerName)}</div>
              <div>Ticket: ${escHtml(row.ticketId)}</div>
              <div>User: ${escHtml(row.userName)}</div>
              <div>Boarding: ${escHtml(row.boarding)} (${escHtml(row.boardingTime)})</div>
              <div>Dropping: ${escHtml(row.dropping)} (${escHtml(row.dropTime)})</div>
            </div>`
        )
        .join("")
    : "<div>No passenger records for this service and date.</div>";
}

function exportAdminPassengerCsv() {
  if (!isAdmin) return;
  if (!adminPassengerRows.length) {
    toast("No passenger records to export.");
    return;
  }
  const route = routeById(el.adminPassengerRoute?.value || "");
  const bus = route?.buses?.find((b) => b.busId === el.adminPassengerBus?.value) || null;
  const travelDate = normalizeYmdInput(el.adminPassengerDate?.value || "");
  const safeRoute = String(route?.ref || "route").replace(/[^A-Za-z0-9_-]/g, "_");
  const safeBus = String(bus?.busCode || "service").replace(/[^A-Za-z0-9_-]/g, "_");
  const safeDate = isYmd(travelDate) ? travelDate : todayYmdLocal();
  downloadCsv(
    `passengers_${safeRoute}_${safeBus}_${safeDate}.csv`,
    [
      "Route",
      "Service",
      "Travel Date",
      "Ticket ID",
      "User",
      "Seat",
      "Passenger Name",
      "Boarding Point",
      "Boarding Time",
      "Dropping Point",
      "Dropping Time"
    ],
    adminPassengerRows.map((row) => [
      route?.ref || "-",
      busDisplayText(bus, route),
      row.travelDate,
      row.ticketId,
      row.userName,
      row.seat,
      row.passengerName,
      row.boarding,
      row.boardingTime,
      row.dropping,
      row.dropTime
    ])
  );
}

function initMapPicker() {
  if (mapPickerMap) return;
  mapPickerMap = L.map("mapPickerView").setView([13.058, 80.26], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(mapPickerMap);
  mapPickerMap.on("click", (e) => {
    const lat = Number(e.latlng.lat.toFixed(6));
    const lon = Number(e.latlng.lng.toFixed(6));
    mapPickerChoice = { lat, lon };
    if (!mapPickerMarker) {
      mapPickerMarker = L.marker([lat, lon]).addTo(mapPickerMap);
    } else {
      mapPickerMarker.setLatLng([lat, lon]);
    }
    el.mapPickerCoords.textContent = `Selected: ${lat}, ${lon}`;
  });
}

async function openMapPicker(title, defaultLat, defaultLon) {
  initMapPicker();
  el.mapPickerTitle.textContent = title;
  const lat = Number(defaultLat);
  const lon = Number(defaultLon);
  const hasDefault = Number.isFinite(lat) && Number.isFinite(lon);
  mapPickerChoice = hasDefault ? { lat, lon } : null;
  if (hasDefault) {
    if (!mapPickerMarker) {
      mapPickerMarker = L.marker([lat, lon]).addTo(mapPickerMap);
    } else {
      mapPickerMarker.setLatLng([lat, lon]);
    }
    mapPickerMap.setView([lat, lon], 14);
    el.mapPickerCoords.textContent = `Selected: ${lat}, ${lon}`;
  } else {
    if (mapPickerMarker) {
      mapPickerMap.removeLayer(mapPickerMarker);
      mapPickerMarker = null;
    }
    mapPickerMap.setView([13.058, 80.26], 12);
    el.mapPickerCoords.textContent = "Selected: not set";
  }
  el.mapPickerModal.classList.remove("hidden");
  setTimeout(() => mapPickerMap.invalidateSize(), 70);
  return new Promise((resolve) => {
    mapPickerResolver = resolve;
  });
}

function closeMapPicker(value) {
  el.mapPickerModal.classList.add("hidden");
  if (mapPickerResolver) {
    mapPickerResolver(value);
    mapPickerResolver = null;
  }
}

function openAddBusModal(prefRouteId = "") {
  if (!el.addBusModal) return;
  fillSelect(
    el.addBusRouteSelect,
    routesCache,
    (r) => r.routeId,
    (r) => `${r.ref} - ${r.from} -> ${r.to}`
  );
  if (routesCache.length) {
    const hasPref = routesCache.some((r) => r.routeId === prefRouteId);
    el.addBusRouteSelect.value = hasPref ? prefRouteId : routesCache[0].routeId;
  }
  el.addBusCode.value = "";
  el.addBusTime.value = "";
  el.addBusModal.classList.remove("hidden");
  setTimeout(() => el.addBusCode.focus(), 30);
}

function closeAddBusModal() {
  if (!el.addBusModal) return;
  el.addBusModal.classList.add("hidden");
  el.addBusForm?.reset();
  setButtonBusy(el.addBusSaveBtn, false);
}

function initializeStopTimesForNewBus(route, newDeparture) {
  if (!route) return { success: false, message: "Route not found for stop timing update." };
  const existingBuses = Array.isArray(route.buses) ? route.buses : [];
  const baseBusCount = existingBuses.length;
  const baseBus = existingBuses[0] || null;
  const baseDepMins = parseTimeToMinutes(baseBus?.departureTime || "");
  const newDepMins = parseTimeToMinutes(newDeparture);
  let changed = 0;
  for (const stop of route.stops || []) {
    const deps = Array.isArray(stop.departures) ? [...stop.departures] : [];
    while (deps.length < baseBusCount) deps.push(stop.arrival || "");
    let appended = deps[0] || stop.arrival || "";
    if (baseDepMins !== null && newDepMins !== null) {
      appended = shiftTimeByMinutes(appended, newDepMins - baseDepMins);
    }
    deps.push(appended);
    const out = callWasmJson(
      "apiEditStop",
      route.routeId,
      stop.stopId,
      stop.name,
      stop.arrival || "",
      deps.join(","),
      Number(stop.lat),
      Number(stop.lon)
    );
    if (!out.success) return { success: false, message: out.message || "Unable to initialize stop timings for new bus." };
    changed += 1;
  }
  return { success: true, changedStops: changed };
}

function populateAdminSelectors() {
  if (!isAdmin) return;
  const prevAdminRoutePick = el.adminRoutePick.value;
  const prevAdminBusRoute = el.adminBusRouteSelect.value;
  const prevAdminBus = el.adminBusPick.value;
  const prevAdminStopRoute = el.adminStopRouteSelect.value;
  const prevAdminStop = el.adminStopPick.value;

  fillSelect(
    el.adminRoutePick,
    routesCache,
    (r) => r.routeId,
    (r) => `${r.ref} - ${r.from} -> ${r.to}`
  );
  fillSelect(
    el.adminBusRouteSelect,
    routesCache,
    (r) => r.routeId,
    (r) => `${r.ref} - ${r.from} -> ${r.to}`
  );
  fillSelect(
    el.adminStopRouteSelect,
    routesCache,
    (r) => r.routeId,
    (r) => `${r.ref} - ${r.from} -> ${r.to}`
  );
  if (routesCache.length) {
    const has = (value) => routesCache.some((r) => r.routeId === value);
    el.adminRoutePick.value = has(prevAdminRoutePick) ? prevAdminRoutePick : routesCache[0].routeId;
    el.adminBusRouteSelect.value = has(prevAdminBusRoute)
      ? prevAdminBusRoute
      : routesCache[0].routeId;
    el.adminStopRouteSelect.value = has(prevAdminStopRoute)
      ? prevAdminStopRoute
      : routesCache[0].routeId;
  }
  loadRouteEditorFromPick();
  populateBusPick();
  populateStopPick();
  if (prevAdminBus) el.adminBusPick.value = prevAdminBus;
  if (prevAdminStop) el.adminStopPick.value = prevAdminStop;
  loadBusEditorFromPick();
  loadStopEditorFromPick();
  populateAdminPassengerRouteSelect();
  populateAdminPassengerBusSelect();
  if (el.adminPassengerDate && !isYmd(normalizeYmdInput(el.adminPassengerDate.value))) {
    el.adminPassengerDate.value = todayYmdLocal();
  }
  renderAdminPassengerManifest();
  renderAdminTickets();
}

function loadRouteEditorFromPick() {
  const route = routeById(el.adminRoutePick.value);
  if (!route) {
    clearRouteForm();
    return;
  }
  document.getElementById("adminRouteId").value = route.routeId;
  document.getElementById("adminRouteId").readOnly = true;
  document.getElementById("adminRouteRef").value = route.ref;
  document.getElementById("adminRouteFare").value = route.fare;
}

function populateBusPick() {
  const route = routeById(el.adminBusRouteSelect.value);
  const buses = route?.buses || [];
  fillSelect(el.adminBusPick, buses, (b) => b.busId, (b) => `${buildBusDisplayName(route?.ref || "", b.busCode)}`, true);
  if (!route) {
    clearBusForm();
    setBusFormEnabled(false);
    return;
  }
  if (!buses.length) {
    clearBusForm();
    setBusFormEnabled(false);
    return;
  }
  if (!el.adminBusPick.value) {
    el.adminBusPick.value = buses[0].busId;
  }
  loadBusEditorFromPick();
}

function loadBusEditorFromPick() {
  const route = routeById(el.adminBusRouteSelect.value);
  if (!route) {
    clearBusForm();
    setBusFormEnabled(false);
    return;
  }
  const bus = route.buses.find((b) => b.busId === el.adminBusPick.value);
  const busIdNode = document.getElementById("adminBusId");
  if (!bus) {
    clearBusForm();
    busIdNode.readOnly = false;
    setBusFormEnabled(false);
    return;
  }
  setBusFormEnabled(true);
  busIdNode.readOnly = true;
  document.getElementById("adminBusId").value = bus.busId;
  document.getElementById("adminBusCode").value = bus.busCode;
  document.getElementById("adminBusTime").value = timeInputValue(bus.departureTime);
}

function populateStopPick() {
  const route = routeById(el.adminStopRouteSelect.value);
  const stops = route?.stops || [];
  fillSelect(el.adminStopPick, stops, (s) => s.stopId, (s) => `${s.name}`, true);
  if (!route || !stops.length) {
    clearStopForm();
    setStopFormEnabled(false);
    return;
  }
  if (!el.adminStopPick.value && stops.length) {
    el.adminStopPick.value = stops[0].stopId;
  }
  loadStopEditorFromPick();
}

function loadStopEditorFromPick() {
  const route = routeById(el.adminStopRouteSelect.value);
  if (!route) {
    clearStopForm();
    setStopFormEnabled(false);
    return;
  }
  const stop = route.stops.find((s) => s.stopId === el.adminStopPick.value);
  if (!stop) {
    clearStopForm();
    setStopFormEnabled(false);
    return;
  }
  setStopFormEnabled(true);
  document.getElementById("adminStopId").value = stop.stopId;
  document.getElementById("adminStopName").value = stop.name;
}

function shiftRouteStopsForBusDeparture(route, busId, oldDeparture, newDeparture) {
  const oldMins = parseTimeToMinutes(oldDeparture);
  const newMins = parseTimeToMinutes(newDeparture);
  if (oldMins === null || newMins === null) {
    return { success: false, message: "Invalid time format. Use hh:mm AM/PM." };
  }
  const delta = newMins - oldMins;
  if (delta === 0) return { success: true, shiftedStops: 0 };
  const busIndex = getBusIndex(route, busId);
  if (busIndex < 0) return { success: false, message: "Bus index not found for timing update." };

  const busCount = Math.max((route.buses || []).length, busIndex + 1);
  let changed = 0;
  for (const stop of route.stops || []) {
    const deps = Array.isArray(stop.departures) ? [...stop.departures] : [];
    while (deps.length < busCount) deps.push(stop.arrival || "");
    deps[busIndex] = shiftTimeByMinutes(deps[busIndex] || stop.arrival || "", delta);
    const out = callWasmJson(
      "apiEditStop",
      route.routeId,
      stop.stopId,
      stop.name,
      stop.arrival || "",
      deps.join(","),
      Number(stop.lat),
      Number(stop.lon)
    );
    if (!out.success) return { success: false, message: out.message || "Unable to update stop timings." };
    changed += 1;
  }
  return { success: true, shiftedStops: changed };
}

function renderUnifiedAdminReport() {
  if (!isAdmin || !el.unifiedReportBox) return;
  const reports = callWasmJson("apiReportsJson");
  const ticketsRes = callWasmJson("apiTicketsJson");
  if (!reports.success) {
    el.unifiedReportBox.textContent = reports.message || "Unable to load reports.";
    return;
  }
  if (!ticketsRes.success) {
    el.unifiedReportBox.textContent = ticketsRes.message || "Unable to load ticket summary.";
    return;
  }

  const routes = [...(reports.routes || [])];
  const totalRevenue = routes.reduce((sum, r) => sum + Number(r.revenue || 0), 0);
  const totalBookings = routes.reduce((sum, r) => sum + Number(r.bookings || 0), 0);
  const tickets = ticketsRes.tickets || [];
  const activeTickets = tickets.filter((t) => isTicketActive(t)).length;
  const cancelledTickets = tickets.filter((t) => t.cancelled).length;
  const completedTickets = tickets.filter((t) => isTicketCompleted(t)).length;
  const top = routes.find((r) => r.routeId === reports.mostPopularRouteId) || null;
  const revenueTop = [...routes].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0] || null;
  const today = todayYmdLocal();
  const todayTickets = tickets.filter((t) => !t.cancelled && t.travelDate === today);
  const todayRevenue = todayTickets.reduce((sum, t) => sum + Number(t.fare || 0), 0);

  routes.sort((a, b) => Number(b.bookings || 0) - Number(a.bookings || 0));
  const routeRows = routes
    .map(
      (r, idx) =>
        `<tr><td>${idx + 1}</td><td>${escHtml(r.ref || r.routeId || "-")}</td><td>${Number(r.bookings || 0)}</td><td>Rs ${Number(r.revenue || 0)}</td></tr>`
    )
    .join("");

  el.unifiedReportBox.innerHTML = `
    <div class="analytics-grid">
      <div class="analytics-card"><div class="k">Total bookings</div><strong>${totalBookings}</strong></div>
      <div class="analytics-card"><div class="k">Total revenue</div><strong>Rs ${totalRevenue}</strong></div>
      <div class="analytics-card"><div class="k">Bookings today</div><strong>${todayTickets.length}</strong></div>
      <div class="analytics-card"><div class="k">Revenue today</div><strong>Rs ${todayRevenue}</strong></div>
      <div class="analytics-card"><div class="k">Cancellations</div><strong>${cancelledTickets}</strong></div>
      <div class="analytics-card"><div class="k">Active tickets</div><strong>${activeTickets}</strong></div>
      <div class="analytics-card"><div class="k">Completed trips</div><strong>${completedTickets}</strong></div>
      <div class="analytics-card"><div class="k">Most popular route</div><strong>${escHtml(top?.ref || "N/A")}</strong></div>
      <div class="analytics-card"><div class="k">Highest revenue route</div><strong>${escHtml(revenueTop?.ref || "N/A")}</strong></div>
    </div>
    <div class="analytics-table-wrap">
      <table class="analytics-table">
        <thead><tr><th>#</th><th>Route</th><th>Bookings</th><th>Revenue</th></tr></thead>
        <tbody>${routeRows || "<tr><td colspan='4'>No route data.</td></tr>"}</tbody>
      </table>
    </div>`;
}

function renderAllViews(state = {}) {
  refreshRoutesCache();
  renderRouteSelectors(state);
  if (currentUser) refreshMyTickets();
  if (isAdmin) {
    renderAdminTickets();
    renderAdminPassengerManifest();
    renderUnifiedAdminReport();
  }
  refreshTerminal();
}

async function refreshAllAfterMutation(options = {}) {
  const state = {
    bookingRouteId: options.bookingRouteId || el.routeSelect.value,
    bookingBusId: options.bookingBusId || el.busSelect.value,
    mapRouteId: options.mapRouteId || el.mapRouteSelect.value
  };
  renderAllViews(state);
  if (options.focusMapRouteId) {
    focusMapOnRoute(options.focusMapRouteId);
  }
  queueCloudSync().catch(() => {});
}

function bindEvents() {
  bindTabs();
  bindAdminPanels();
  switchAuthPane("login");
  if (el.ticketSortSelect) {
    el.ticketSortSelect.value = myTicketSortOrder;
  }

  el.authLoginTabBtn.addEventListener("click", () => switchAuthPane("login"));
  el.authSignupTabBtn.addEventListener("click", () => switchAuthPane("signup"));

  el.modalConfirmBtn.addEventListener("click", () => {
    if (modalInputMode) {
      closeModal(el.modalInput.value);
      return;
    }
    closeModal(true);
  });
  el.modalCancelBtn.addEventListener("click", () => closeModal(modalInputMode ? null : false));
  el.modal.addEventListener("click", (e) => {
    if (e.target === el.modal) closeModal(modalInputMode ? null : false);
  });
  el.mapPickerConfirmBtn.addEventListener("click", () => {
    if (!mapPickerChoice) {
      toast("Select a point on the map.");
      return;
    }
    closeMapPicker(mapPickerChoice);
  });
  el.mapPickerCancelBtn.addEventListener("click", () => closeMapPicker(null));
  el.mapPickerModal.addEventListener("click", (e) => {
    if (e.target === el.mapPickerModal) closeMapPicker(null);
  });
  el.addBusCancelBtn?.addEventListener("click", () => closeAddBusModal());
  el.addBusModal?.addEventListener("click", (e) => {
    if (e.target === el.addBusModal) closeAddBusModal();
  });
  el.addBusForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    setButtonBusy(el.addBusSaveBtn, true, "Creating...");
    try {
      const routeId = el.addBusRouteSelect.value;
      const route = routeById(routeId);
      if (!routeId || !route) {
        toast("Select a route.");
        return;
      }
      const busCode = el.addBusCode.value.trim();
      if (!busCode) {
        toast("Enter bus code.");
        return;
      }
      const departureTime = el.addBusTime.value.trim();
      if (!departureTime) {
        toast("Select departure time.");
        return;
      }
      const busId = createInternalBusId(routeId);
      const out = callWasmJson(
        "apiUpsertBus",
        routeId,
        busId,
        busCode,
        buildBusDisplayName(route.ref, busCode),
        departureTime,
        32
      );
      toast(out.message || "Done");
      if (!out.success) return;
      const timingInit = initializeStopTimesForNewBus(route, departureTime);
      if (!timingInit.success) {
        toast(timingInit.message || "Bus added, but stop timing initialization failed.");
      }
      closeAddBusModal();
      await refreshAllAfterMutation({ bookingRouteId: routeId, mapRouteId: routeId });
      el.adminBusRouteSelect.value = routeId;
      populateBusPick();
      el.adminBusPick.value = busId;
      loadBusEditorFromPick();
      toast(`New bus created: ${buildBusDisplayName(route.ref, busCode)}`);
    } finally {
      setButtonBusy(el.addBusSaveBtn, false);
    }
  });

  el.routeSelect.addEventListener("change", () => {
    releaseSelectedSeatLocks();
    renderBusSelector();
    focusMapOnRoute(el.routeSelect.value);
    refreshJourneySelectors();
    renderRouteMeta();
  });
  el.busSelect.addEventListener("change", () => {
    releaseSelectedSeatLocks();
    refreshJourneySelectors();
    renderRouteMeta();
    renderSeatMap();
  });
  el.travelDate?.addEventListener("change", () => {
    const today = todayYmdLocal();
    const normalized = selectedTravelDateYmd();
    if (!isYmd(normalized)) {
      el.travelDate.value = today;
    } else if (ymdCompare(normalized, today) < 0) {
      el.travelDate.value = today;
    } else {
      el.travelDate.value = normalized;
    }
    releaseSelectedSeatLocks();
    refreshBusDepartureAvailability();
    updateFarePreview();
    renderRouteMeta();
    renderSeatMap();
    renderPassengerFields();
  });
  el.boardingStopSelect?.addEventListener("change", () => {
    syncDroppingOptions();
    refreshBusDepartureAvailability();
    updateFarePreview();
    renderRouteMeta();
    renderPassengerFields();
    renderSeatMap();
  });
  el.droppingStopSelect?.addEventListener("change", () => {
    updateFarePreview();
    renderRouteMeta();
    renderPassengerFields();
  });
  el.mapRouteSelect.addEventListener("change", () => {
    renderMapRoute();
  });
  el.ticketSearchInput?.addEventListener("input", () => {
    refreshMyTickets();
  });
  el.adminTicketLiveSearch.addEventListener("input", () => {
    adminTicketQuery = el.adminTicketLiveSearch.value || "";
    renderAdminTickets();
  });
  el.adminPurgeCancelledBtn.addEventListener("click", async () => {
    if (!isAdmin) return;
    const yes = await showConfirm(
      "Clear All Cancelled Ticket Records",
      "Remove all cancelled tickets from active ticket history?"
    );
    if (!yes) return;
    const out = callWasmJson("apiPurgeCancelledTickets");
    toast(out.message || "Done");
    if (out.success) await refreshAllAfterMutation();
  });
  el.ticketSortSelect?.addEventListener("change", () => {
    myTicketSortOrder = el.ticketSortSelect.value === "asc" ? "asc" : "desc";
    refreshMyTickets();
  });

  el.adminPassengerRoute?.addEventListener("change", () => {
    populateAdminPassengerBusSelect();
    renderAdminPassengerManifest();
  });
  el.adminPassengerBus?.addEventListener("change", () => {
    renderAdminPassengerManifest();
  });
  el.adminPassengerDate?.addEventListener("change", () => {
    const normalized = normalizeYmdInput(el.adminPassengerDate.value);
    el.adminPassengerDate.value = isYmd(normalized) ? normalized : todayYmdLocal();
    renderAdminPassengerManifest();
  });
  el.adminPassengerExportBtn?.addEventListener("click", () => {
    exportAdminPassengerCsv();
  });

  el.sidebarToggle?.addEventListener("click", () => {
    el.bookingShell?.classList.toggle("sidebar-open");
    // Wait for transition, then resize map
    setTimeout(() => {
      try {
        if (typeof map !== 'undefined' && map) {
          map.invalidateSize();
        }
      } catch (e) {}
    }, 450);
  });


  document.getElementById("bookForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const journey = getJourneySelection();
    if (!journey.ok) {
      toast(journey.message || "Select valid journey details.");
      return;
    }
    if (!selectedSeats.length) {
      toast("Select at least one seat.");
      return;
    }

    // New Passenger Name Collection Flow
    const passengersHtml = selectedSeats
      .map((seat) => `
        <div class="modal-input-group">
          <label>Passenger for Seat ${seat}</label>
          <input type="text" class="passenger-modal-input" data-seat="${seat}" placeholder="Enter name" required>
        </div>
      `).join("");

    el.modalBody.innerHTML = `
      <div style="margin-bottom: 12px;">Enter passenger details for this booking:</div>
      ${passengersHtml}
    `;
    
    const names = await showConfirmCustom("Complete Passenger Details", "Book Now");
    if (!names) return;

    const totalFare = journey.farePerSeat * selectedSeats.length;
    const finalYes = await showConfirm(
      "Final Confirmation",
      `
      <div class="confirm-line"><strong>Route:</strong> ${journey.route.ref}</div>
      <div class="confirm-line"><strong>Bus:</strong> ${buildBusDisplayName(journey.route.ref, journey.bus.busCode)}</div>
      <div class="confirm-line"><strong>Date:</strong> ${journey.travelDate}</div>
      <div class="confirm-line"><strong>Seats:</strong> ${selectedSeats.join(", ")}</div>
      <div class="confirm-line" style="margin-top:8px; font-size:1.1rem; color:var(--red-700);"><strong>Total Fare:</strong> Rs ${totalFare}</div>
      `,
      "Book Now"
    );
    if (!finalYes) return;

    const lockContext = activeSeatLockContext();
    if (!lockContext || !sameSeatLockContext(lockContext, {
      routeId: journey.route.routeId,
      busId: journey.bus.busId,
      travelDate: journey.travelDate
    })) {
      toast("Seat context changed. Please select seats again.");
      releaseSelectedSeatLocks();
      renderSeatMap();
      return;
    }
    const lockRes = callWasmJson(
      "apiUpsertSeatLocks",
      currentUser.uid,
      lockContext.routeId,
      lockContext.busId,
      lockContext.travelDate,
      selectedSeats.join(","),
      SEAT_LOCK_TTL_SECONDS
    );
    if (!lockRes.success) {
      toast(lockRes.message || "Seats are no longer available.");
      renderSeatMap();
      return;
    }
    selectedSeatLockContext = lockContext;
    await flushCloudSync();

    const res = callWasmJson(
      "apiBookTicket",
      currentUser.uid,
      el.profileName.value.trim() || currentUser.displayName || "User",
      journey.route.routeId,
      journey.bus.busId,
      selectedSeats.join(","),
      names.join(","),
      journey.travelDate,
      journey.boardingStopId,
      journey.droppingStopId
    );
    toast(res.message || "Done");
    if (res.success) {
      clearSeatSelectionState();
      await refreshAllAfterMutation({
        bookingRouteId: journey.route.routeId,
        bookingBusId: journey.bus.busId,
        mapRouteId: journey.route.routeId
      });
      await showAlert("Booking Successful", `Ticket ID: ${res.ticket?.ticketId || "Generated"}`);
    } else {
      renderSeatMap();
    }
  });

  el.terminalForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const command = el.terminalInput.value.trim();
    if (!command) return;
    const pageScrollBeforeRun = window.scrollY;
    setButtonBusy(el.terminalRunBtn, true, "Running...");
    try {
      await runTerminalCommand(command);
      el.terminalInput.value = "";
    } finally {
      setButtonBusy(el.terminalRunBtn, false);
      try {
        el.terminalInput.focus({ preventScroll: true });
      } catch {
        el.terminalInput.focus();
      }
      window.scrollTo(0, pageScrollBeforeRun);
    }
  });

  document.getElementById("routeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    setButtonBusy(btn, true, "Saving...");
    const routeId = document.getElementById("adminRouteId").value.trim();
    try {
      if (!routeId) {
        toast("Select a route.");
        return;
      }
      const existingRoute = routeById(routeId);
      if (!existingRoute) {
        toast("Select an existing route to edit.");
        return;
      }
      const res = callWasmJson(
        "apiUpsertRoute",
        routeId,
        document.getElementById("adminRouteRef").value.trim(),
        existingRoute.from,
        existingRoute.to,
        Number(document.getElementById("adminRouteFare").value),
        32,
        ""
      );
      toast(res.message || "Done");
      if (res.success) await refreshAllAfterMutation();
    } finally {
      setButtonBusy(btn, false);
    }
  });

  el.adminRoutePick.addEventListener("change", loadRouteEditorFromPick);

  el.adminBusRouteSelect.addEventListener("change", populateBusPick);
  el.adminBusPick.addEventListener("change", loadBusEditorFromPick);
  el.adminBusNewBtn?.addEventListener("click", () => {
    openAddBusModal(el.adminBusRouteSelect.value);
  });
  document.getElementById("busForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    setButtonBusy(btn, true, "Saving...");
    const busId = document.getElementById("adminBusId").value.trim();
    const routeId = el.adminBusRouteSelect.value;
    try {
      if (!routeId) {
        toast("Select a route.");
        return;
      }
      if (!busId) {
        toast("Select a bus to edit. Use Add New Bus to create one.");
        return;
      }
      const route = routeById(routeId);
      const existingBus = route?.buses?.find((b) => b.busId === busId) || null;
      if (!existingBus) {
        toast("Selected bus was not found.");
        return;
      }
      const busCode = document.getElementById("adminBusCode").value.trim();
      if (!busCode) {
        toast("Enter bus code.");
        return;
      }
      const newDeparture = document.getElementById("adminBusTime").value.trim();
      if (!newDeparture) {
        toast("Select departure time.");
        return;
      }
      const res = callWasmJson(
        "apiUpsertBus",
        routeId,
        busId,
        busCode,
        buildBusDisplayName(route?.ref || "", busCode),
        newDeparture,
        32
      );
      toast(res.message || "Done");
      if (res.success && route && existingBus) {
        const shifted = shiftRouteStopsForBusDeparture(route, busId, existingBus.departureTime, newDeparture);
        if (!shifted.success) {
          toast(shifted.message || "Bus saved, but stop timing update failed.");
        } else if (shifted.shiftedStops > 0) {
          toast(`Bus saved. Updated timings at ${shifted.shiftedStops} stops.`);
        }
      }
      if (res.success) await refreshAllAfterMutation();
    } finally {
      setButtonBusy(btn, false);
    }
  });
  document.getElementById("deleteBusBtn").addEventListener("click", async () => {
    if (!isAdmin) return;
    const routeId = el.adminBusRouteSelect.value;
    const busId = el.adminBusPick.value;
    if (!routeId || !busId) return;
    const route = routeById(routeId);
    const bus = route?.buses?.find((b) => b.busId === busId) || null;
    const yes = await showConfirm(
      "Delete Bus",
      `Delete service ${busDisplayText(bus, route)} from route ${route ? routeDisplayText(route) : "selected route"}?`
    );
    if (!yes) return;
    const res = callWasmJson("apiDeleteBus", routeId, busId);
    toast(res.message || "Done");
    if (res.success) await refreshAllAfterMutation();
  });

  el.adminStopRouteSelect.addEventListener("change", () => {
    populateStopPick();
    focusMapOnRoute(el.adminStopRouteSelect.value);
  });
  el.adminStopPick.addEventListener("change", loadStopEditorFromPick);
  document.getElementById("stopForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    setButtonBusy(btn, true, "Saving...");
    const routeId = el.adminStopRouteSelect.value;
    const stopId = el.adminStopPick.value;
    try {
      if (!routeId || !stopId) {
        toast("Select a stop to edit.");
        return;
      }
      const route = routeById(routeId);
      const oldStop = route?.stops?.find((s) => s.stopId === stopId);
      if (!oldStop) {
        toast("Selected stop was not found.");
        return;
      }
      const res = callWasmJson(
        "apiEditStop",
        routeId,
        stopId,
        document.getElementById("adminStopName").value.trim(),
        oldStop.arrival || "",
        (oldStop.departures || []).join(","),
        Number(oldStop.lat),
        Number(oldStop.lon)
      );
      toast(res.message || "Done");
      if (res.success) {
        await refreshAllAfterMutation({ focusMapRouteId: routeId, mapRouteId: routeId });
      }
    } finally {
      setButtonBusy(btn, false);
    }
  });

  document.getElementById("profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = el.profileName.value.trim();
    if (!name) return;
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    setButtonBusy(btn, true, "Updating...");
    let didAuthProfileUpdate = false;
    let didUserDocUpdate = false;
    let didTicketNameSync = false;
    try {
      await updateProfile(auth.currentUser, { displayName: name });
      didAuthProfileUpdate = true;
      await setDoc(
        doc(db, "users", auth.currentUser.uid),
        { name, email: auth.currentUser.email, updatedAt: serverTimestamp() },
        { merge: true }
      );
      didUserDocUpdate = true;
      const ticketNameUpdate = callWasmJson(
        "apiUpdateTicketUserNameForUser",
        auth.currentUser.uid,
        name
      );
      didTicketNameSync = !!ticketNameUpdate.success;
      await refreshAllAfterMutation();
      updateUserPill();
      if (!ticketNameUpdate.success) {
        toast(ticketNameUpdate.message || "Name updated, but some ticket names could not be synced.");
      } else {
        toast("Profile updated.");
      }
    } catch (err) {
      if (didAuthProfileUpdate && !didUserDocUpdate) {
        toast("Name updated in account, but profile sync failed. Please retry once.");
      } else if (didAuthProfileUpdate && didUserDocUpdate && !didTicketNameSync) {
        toast("Name updated, but ticket name sync failed. Please retry once.");
      } else {
        toast(err?.message || "Profile update failed.");
      }
    } finally {
      setButtonBusy(btn, false);
    }
  });

  document.getElementById("passwordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = document.getElementById("newPassword").value.trim();
    if (!pass) return;
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    setButtonBusy(btn, true, "Updating...");
    try {
      await updatePassword(auth.currentUser, pass);
      document.getElementById("newPassword").value = "";
      toast("Password updated successfully.");
    } catch (err) {
      toast(err?.message || "Password update failed. Please login again and retry.");
    } finally {
      setButtonBusy(btn, false);
    }
  });

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    setButtonBusy(btn, true, "Signing in...");
    setCloudSyncUi("checking", "Cloud Sync: Checking");
    try {
      await signInWithEmailAndPassword(
        auth,
        document.getElementById("loginEmail").value.trim(),
        document.getElementById("loginPassword").value
      );
      toast("Login successful.");
    } catch (err) {
      toast(err.message || "Login failed");
      setCloudSyncUi("idle", "Cloud Sync: Offline");
    } finally {
      setButtonBusy(btn, false);
    }
  });

  document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    setButtonBusy(btn, true, "Creating...");
    setCloudSyncUi("checking", "Cloud Sync: Checking");
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        document.getElementById("signupEmail").value.trim(),
        document.getElementById("signupPassword").value
      );
      const name = document.getElementById("signupName").value.trim();
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, "users", cred.user.uid), {
        name,
        email: cred.user.email,
        updatedAt: serverTimestamp()
      });
      toast("Account created.");
    } catch (err) {
      toast(err.message || "Signup failed");
      setCloudSyncUi("idle", "Cloud Sync: Offline");
    } finally {
      setButtonBusy(btn, false);
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    releaseSelectedSeatLocks();
    await flushCloudSync();
    await signOut(auth);
  });
}

async function bootstrapWasm() {
  const factory = (await import(`./dist/reservation.js?v=${APP_BUILD_ID}`)).default;
  wasm = await factory({
    locateFile(path) {
      return `./dist/${path}?v=${APP_BUILD_ID}`;
    }
  });
}

async function handleAuthState(user) {
  currentUser = user;
  if (!user) {
    stopCloudStateListener();
    isAdmin = false;
    el.adminTabBtn.classList.add("hidden");
    el.authPanel.classList.remove("hidden");
    el.appPanel.classList.add("hidden");
    el.userPill.classList.add("hidden");
    resetTerminal(false);
    adminTicketQuery = "";
    if (el.adminTicketLiveSearch) el.adminTicketLiveSearch.value = "";
    switchAuthPane("login");
    callWasmJson("apiResetSystem");
    lastSyncedSnapshot = "";
    cloudReadyForWrites = false;
    clearSeatSelectionState();
    setCloudSyncUi("idle", "Cloud Sync: Offline");
    el.cloudSyncPill?.classList.add("hidden");
    return;
  }
  lastSyncedSnapshot = "";
  cloudReadyForWrites = false;
  clearSeatSelectionState();
  setCloudSyncUi("checking", "Cloud Sync: Checking");
  isAdmin = false;
  el.adminTabBtn.classList.add("hidden");
  el.authPanel.classList.add("hidden");
  el.appPanel.classList.add("hidden");
  el.userPill.classList.add("hidden");
  el.profileName.value = user.displayName || "";
  updateUserPill();
  resetTerminal(false);
  adminTicketQuery = "";
  if (el.adminTicketLiveSearch) el.adminTicketLiveSearch.value = "";
  const cloudOk = await loadCloudSnapshot();
  if (!cloudOk) {
    toast("Cloud sync is unavailable. Please try again in a moment.");
    el.cloudSyncPill?.classList.add("hidden");
    await signOut(auth);
    return;
  }
  el.cloudSyncPill?.classList.remove("hidden");
  const roleTask = hydrateRoleInBackground(user).catch((e) => console.error("Role hydration failed:", e));
  el.appPanel.classList.remove("hidden");
  el.userPill.classList.remove("hidden");
  renderAllViews({
    bookingRouteId: el.routeSelect.value,
    bookingBusId: el.busSelect.value,
    mapRouteId: el.mapRouteSelect.value
  });
  setTimeout(() => {
    try {
      map?.invalidateSize(true);
    } catch {}
  }, 120);
  resetTerminal(activeTabId() === "terminalTab");
  startCloudStateListener();

  // Initialize custom selects globally
  document.querySelectorAll("select").forEach(s => initCustomSelect(s));

  await roleTask;
}


async function main() {
  setCloudSyncUi("idle", "Cloud Sync: Offline");
  try {
    await bootstrapWasm();
  } catch (e) {
    toast("WASM load failed. Build dist/reservation.js first.");
    console.error(e);
  }
  try {
    await setPersistence(auth, inMemoryPersistence);
    await signOut(auth);
  } catch (e) {
    console.error(e);
  }
  window.addEventListener("pageshow", async (ev) => {
    if (ev.persisted && auth.currentUser) {
      try {
        await signOut(auth);
      } catch {}
    }
  });
  bindEvents();
  onAuthStateChanged(auth, (u) => {
    handleAuthState(u).catch((e) => {
      console.error(e);
      toast("Initialization error.");
    });
  });
}

main();
