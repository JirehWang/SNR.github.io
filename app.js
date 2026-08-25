
/* --------------------------------------------------------------------------
   Equipment Maintenance Metadata & Conflict Tracking
   -------------------------------------------------------------------------- */

const MAINTENANCE_STORAGE_KEY = "snr_equipment_maintenance_meta_v1";

function getMaintenanceMetadataMap() {
  try {
    const raw = window.localStorage?.getItem(MAINTENANCE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveMaintenanceMetadata(equipmentId, meta) {
  try {
    const map = getMaintenanceMetadataMap();
    if (meta == null) {
      delete map[String(equipmentId)];
    } else {
      map[String(equipmentId)] = meta;
    }
    window.localStorage?.setItem(MAINTENANCE_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn("Save maintenance metadata failed", e);
  }
}

function getEquipmentMaintenanceMeta(equipment) {
  if (!equipment) return null;
  const map = getMaintenanceMetadataMap();
  const meta = map[String(equipment.id)] || {};
  return {
    started_at: equipment.maintenance_started_at || meta.started_at || equipment.updated_at || equipment.created_at || new Date().toISOString(),
    months: Number(equipment.maintenance_months || meta.months || 1),
  };
}

function getReservationEquipmentConflict(reservation) {
  if (!reservation) return null;
  if (reservation.status === "cancelled" || reservation.status === "checked_out") return null;

  const equipment = state.equipment.find((e) => Number(e.id) === Number(reservation.equipment_id));
  if (!equipment) return null;

  // Case 1: Equipment is offline
  if (equipment.status === "offline") {
    return {
      type: "offline",
      reason: "設備已停用",
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      equipment,
    };
  }

  // Case 2: Equipment is in maintenance
  if (equipment.status === "maintenance") {
    const meta = getEquipmentMaintenanceMeta(equipment);
    const startDate = new Date(meta.started_at);
    const endDate = new Date(startDate.getTime());
    endDate.setMonth(endDate.getMonth() + meta.months);

    const resStart = new Date(reservation.start_time).getTime();
    const resEnd = new Date(reservation.end_time).getTime();

    if (resStart < endDate.getTime() && resEnd > startDate.getTime()) {
      return {
        type: "maintenance",
        reason: "設備維修中",
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        equipment,
        maintenanceStartedAt: startDate,
        maintenanceUntil: endDate,
        months: meta.months,
      };
    }
  }

  return null;
}

function isMaintenanceExpired(equipment, now = new Date()) {
  if (!equipment || equipment.status !== "maintenance") return false;
  const meta = getEquipmentMaintenanceMeta(equipment);
  const startDate = new Date(meta.started_at);
  const endDate = new Date(startDate.getTime());
  endDate.setMonth(endDate.getMonth() + meta.months);
  return now.getTime() >= endDate.getTime();
}

function showEquipmentConflictWarningDialog(equipment, affectedReservations, mode = "offline") {
  const dialog = document.getElementById("equipmentConflictWarningDialog");
  if (!dialog || !affectedReservations || affectedReservations.length === 0) return;

  const titleEl = document.getElementById("conflictWarningTitle");
  const subtitleEl = document.getElementById("conflictWarningSubtitle");
  const bannerEl = document.getElementById("conflictAlertBanner");
  const tbodyEl = document.getElementById("conflictWarningRows");

  const isMaintenance = mode.includes("maintenance");
  const isExtended = mode === "maintenance_extended";

  if (isExtended) {
    titleEl.textContent = `🔧 設備維修延長警告：${equipment.name}`;
    subtitleEl.textContent = "設備維修期已延長一個月，以下接下來一個月內的受影響專案將以紅色高亮標註。";
    bannerEl.innerHTML = `⚠️ 設備 <strong>${escapeHtml(equipment.name)}</strong> 已延長維修期，在延長維修期間內共有 <strong>${affectedReservations.length}</strong> 筆尚未結案的預約專案受到影響。`;
  } else if (isMaintenance) {
    titleEl.textContent = `🔧 設備維修狀態警告：${equipment.name}`;
    subtitleEl.textContent = "設備進入維修狀態，以下未來一個月內受影響的專案將以紅色高亮標註。";
    bannerEl.innerHTML = `⚠️ 設備 <strong>${escapeHtml(equipment.name)}</strong> 目前設定為「維修中」，在未來一個月維修期內共有 <strong>${affectedReservations.length}</strong> 筆尚未結案的預約專案受到影響。`;
  } else {
    titleEl.textContent = `⚠️ 設備停用狀態警告：${equipment.name}`;
    subtitleEl.textContent = "設備已轉為停用狀態，以下受影響的尚未結案專案將以紅色高亮標註。";
    bannerEl.innerHTML = `⚠️ 設備 <strong>${escapeHtml(equipment.name)}</strong> 目前設定為「停用」，共有 <strong>${affectedReservations.length}</strong> 筆尚未結案的預約專案受到影響。`;
  }

  tbodyEl.innerHTML = affectedReservations.map((res) => {
    const view = getReservationViewModel(res);
    return `
      <tr>
        <td><strong>${escapeHtml(view.requesterName)}</strong><br><span class="muted">${escapeHtml(res.department || "PQE")}</span></td>
        <td><strong>${escapeHtml(view.projectName)}</strong></td>
        <td>${escapeHtml(view.timeRange)}</td>
        <td>${escapeHtml(res.purpose || "-")}</td>
      </tr>
    `;
  }).join("");

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  }
}

function promptMaintenanceExtensionDialog(equipment) {
  const dialog = document.getElementById("maintenanceExtensionDialog");
  if (!dialog) return;

  const infoBox = document.getElementById("maintenanceExtensionInfoBox");
  const meta = getEquipmentMaintenanceMeta(equipment);
  const startDate = new Date(meta.started_at);
  const endDate = new Date(startDate.getTime());
  endDate.setMonth(endDate.getMonth() + meta.months);

  const nextEndDate = new Date(endDate.getTime());
  nextEndDate.setMonth(nextEndDate.getMonth() + 1);

  infoBox.innerHTML = `
    <div><strong>設備名稱：</strong>${escapeHtml(equipment.name)}</div>
    <div><strong>目前狀態：</strong><span class="badge maintenance">維修中</span></div>
    <div><strong>維修起算：</strong>${formatDate(startDate)}</div>
    <div><strong>原預計截止：</strong>${formatDate(endDate)}（已滿 ${meta.months} 個月）</div>
    <div><strong>延長後截止：</strong>${formatDate(nextEndDate)}（累計 ${meta.months + 1} 個月）</div>
  `;

  const extendBtn = document.getElementById("maintenanceExtendBtn");
  const newExtendBtn = extendBtn.cloneNode(true);
  extendBtn.parentNode.replaceChild(newExtendBtn, extendBtn);

  newExtendBtn.addEventListener("click", () => {
    dialog.close();
    extendEquipmentMaintenance(equipment);
  });

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  }
}

function extendEquipmentMaintenance(equipment) {
  const meta = getEquipmentMaintenanceMeta(equipment);
  const oldEndDate = new Date(new Date(meta.started_at).getTime());
  oldEndDate.setMonth(oldEndDate.getMonth() + meta.months);

  const newMonths = meta.months + 1;
  const newEndDate = new Date(new Date(meta.started_at).getTime());
  newEndDate.setMonth(newEndDate.getMonth() + newMonths);

  saveMaintenanceMetadata(equipment.id, {
    started_at: meta.started_at,
    months: newMonths,
  });

  // Find newly affected reservations in the extension window [oldEndDate, newEndDate]
  const newAffected = state.reservations.filter((res) => {
    if (Number(res.equipment_id) !== Number(equipment.id)) return false;
    if (res.status === "cancelled" || res.status === "checked_out") return false;
    const resStart = new Date(res.start_time).getTime();
    const resEnd = new Date(res.end_time).getTime();
    return resStart < newEndDate.getTime() && resEnd >= oldEndDate.getTime();
  });

  renderAll();

  if (newAffected.length > 0) {
    showEquipmentConflictWarningDialog(equipment, newAffected, "maintenance_extended");
  }
}

const SUPABASE_URL = "https://sbqqylrnjfrrqwrdiiun.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNicXF5bHJuamZycnF3cmRpaXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5Mzg1MTEsImV4cCI6MjA5ODUxNDUxMX0.DlOsiff8VpyBNB1BrvnR8ny6b0CXwziM6ZqaHDcHz0Y";

const AUTO_REFRESH_MS = 60000;
const SCHEDULE_EXTENSION_MONTHS = 6;
const SCHEDULE_EXTENSION_COOLDOWN_MS = 300;
const GANTT_VIEWPORT_RELAYOUT_DEBOUNCE_MS = 180;
const GANTT_DRAG_THRESHOLD_PX = 6;
const GANTT_DISPLAY_DAYS = 31;

const FLOORPLAN_STORAGE_KEY = "snr.floorplan.placements.v1";
const EQUIPMENT_DRAFT_ID = -1;
const FLOORPLAN_SEED_PLACEMENTS = [
  { equipment_id: 13, x_percent: 68.8, y_percent: 29.22, width_percent: 5.07, height_percent: 6.52, location_state: "placed" },
  { equipment_id: 1, x_percent: 59.0, y_percent: 29.22, width_percent: 5.26, height_percent: 6.72, location_state: "placed" },
  { equipment_id: 5, x_percent: 48.35, y_percent: 29.22, width_percent: 5.4, height_percent: 6.52, location_state: "placed" },
  { equipment_id: 6, x_percent: 68.4, y_percent: 15.88, width_percent: 5.02, height_percent: 6.56, location_state: "placed" },
  { equipment_id: 7, x_percent: 58.6, y_percent: 15.88, width_percent: 4.61, height_percent: 7.15, location_state: "placed" },
  { equipment_id: 8, x_percent: 48.15, y_percent: 15.69, width_percent: 4.7, height_percent: 7.15, location_state: "placed" },
  { equipment_id: 9, x_percent: 37.75, y_percent: 29.41, width_percent: 5.34, height_percent: 6.92, location_state: "placed" },
  { equipment_id: 10, x_percent: 27.03, y_percent: 29.22, width_percent: 5.27, height_percent: 6.72, location_state: "placed" },
  { equipment_id: 11, x_percent: 26.85, y_percent: 15.88, width_percent: 4.68, height_percent: 6.55, location_state: "placed" },
  { equipment_id: 12, x_percent: 4.55, y_percent: 15.23, width_percent: 13.02, height_percent: 7.2, location_state: "placed" },
  { equipment_id: 2, x_percent: 82.5, y_percent: 70.0, width_percent: 12.5, height_percent: 8.0, location_state: "unplaced" },
  { equipment_id: 3, x_percent: 83.2, y_percent: 2.83, width_percent: 9.0, height_percent: 11.9, location_state: "placed" },
  { equipment_id: 4, x_percent: 68.1, y_percent: 2.83, width_percent: 10.2, height_percent: 4.9, location_state: "placed" },
  { equipment_id: 14, x_percent: 12.6, y_percent: 30.32, width_percent: 4.67, height_percent: 11.77, location_state: "placed" },
  { equipment_id: 15, x_percent: 12.69, y_percent: 42.43, width_percent: 5.78, height_percent: 10.58, location_state: "placed" },
  { equipment_id: 16, x_percent: 7.25, y_percent: 61.02, width_percent: 4.61, height_percent: 9.27, location_state: "placed" },
  { equipment_id: 17, x_percent: 78.68, y_percent: 82.6, width_percent: 14.33, height_percent: 8.4, location_state: "placed" },
];

const state = {
  client: null,
  config: null,
  equipment: [],
  floorplanPlacements: [],
  savedFloorplanPlacements: [],
  reservations: [],
  requesters: [],
  weekStart: startOfWeek(new Date()),
  bulletinMonthStart: startOfMonth(new Date()),
  scheduleStart: startOfDay(new Date()),
  scheduleRangeStart: addMonths(startOfDay(new Date()), -SCHEDULE_EXTENSION_MONTHS),
  scheduleRangeEnd: addMonths(addMonths(startOfDay(new Date()), 1), SCHEDULE_EXTENSION_MONTHS),
  scheduleFocusDate: startOfDay(new Date()),
  mainGanttViewport: {
    key: "",
    timerId: null,
  },
  ganttDrag: null,
  isExtendingSchedule: false,
  lastScheduleExtensionAt: 0,
  activeView: "reservation",
  reservationList: {
    status: "open",
    page: 1,
    pageSize: 10,
  },
  editingEquipmentId: null,
  selectedFloorplanEquipmentId: null,
  selectedGanttEquipmentId: null,
  reservationFloorplanThumbnail: true,
  floorplanLayoutEnabled: false,
  floorplanDirty: false,
  floorplanPointer: null,
  floorplanStorageMode: "seed",
  equipmentDialogOpen: false,
  equipmentDialogSaved: false,
  equipmentDialogReadOnly: false,
  equipmentDraftEquipmentId: null,
  equipmentDraftPlacements: [],
  equipmentDraftPointer: null,
  editingRequesterId: null,
  equipmentFormDirty: false,
  equipmentLabelSupported: true,
  equipmentSpecSupported: true,
  requesterFormDirty: false,
  requesterEmailAutofillValue: "",
  requesterSuggestions: {
    requester_name: [],
    requester_email: [],
  },
  bulletinScroll: {
    intervalSeconds: 30,
    durationSeconds: 1,
    timerId: null,
    animationFrameId: null,
    direction: "down",
  },
  analyticsPreset: "this-month",
  analyticsStartDate: "",
  analyticsEndDate: "",
  analyticsEquipmentId: "all",
  analyticsData: null,
};

const statusText = {
  available: "可預約",
  reserved: "已預約",
  maintenance: "維修中",
  offline: "停用",
  cancelled: "已取消",
  checked_in: "已啟用",
  checked_out: "已完成",
};

statusText.validation = "驗證中";

const dayNames = ["Sun.", "Mon.", "Tue.", "Wed.", "Thu.", "Fri.", "Sat."];

document.addEventListener("DOMContentLoaded", async () => {
  initializeReservationCreateDialog();
  bindEvents();
  hydrateViewFromLocation();
  initializeSupabase();
  initializeBulletinControls();
  setDefaultTimes();
  renderAll();
  await connectAndLoad();
  window.setInterval(() => {
    if (state.client) {
      connectAndLoad();
    }
  }, AUTO_REFRESH_MS);
});

function bindEvents() {
  document.getElementById("refreshBtn").addEventListener("click", () => connectAndLoad(true));
  document.getElementById("bulletinPrevMonth").addEventListener("click", () => moveBulletinMonth(-1));
  document.getElementById("bulletinNextMonth").addEventListener("click", () => moveBulletinMonth(1));
  document.getElementById("bulletinFullscreenBtn").addEventListener("click", openBulletinFullscreen);
  document.getElementById("openBulletinWindowBtn").addEventListener("click", openBulletinWindow);
  document.getElementById("bulletinScrollInterval").addEventListener("change", updateBulletinScrollSettings);
  document.getElementById("bulletinScrollDuration").addEventListener("change", updateBulletinScrollSettings);
  window.addEventListener("resize", handleBulletinViewportChange);
  document.addEventListener("fullscreenchange", handleBulletinFullscreenChange);

  document.getElementById("reservationForm").addEventListener("submit", submitReservation);
  document.querySelector("#reservationForm select[name='equipment_id']").addEventListener("change", syncReservationEquipmentState);
  document.getElementById("openReservationCreateDialogBtn").addEventListener("click", () => openReservationCreateDialog());
  document.getElementById("reservationCreateDialogCloseBtn").addEventListener("click", closeReservationCreateDialog);
  document.getElementById("schedulePrevMonth").addEventListener("click", () => moveMainScheduleMonth(-1));
  document.getElementById("scheduleNextMonth").addEventListener("click", () => moveMainScheduleMonth(1));
  document.getElementById("scheduleRangeLabel").addEventListener("click", () => {
    scrollMainScheduleToDate(state.scheduleFocusDate || state.scheduleStart);
  });
  const ganttWrap = document.querySelector(".gantt-schedule-wrap");
  bindGanttDrag(ganttWrap);
  ganttWrap?.addEventListener("scroll", handleMainGanttScroll, { passive: true });
  window.addEventListener("resize", handleMainGanttResize);

  document.getElementById("equipmentForm").addEventListener("submit", submitEquipment);
  document.getElementById("equipmentForm").addEventListener("input", markEquipmentFormDirty);
  document.getElementById("equipmentCancelBtn").addEventListener("click", cancelEquipmentEdit);
  document.getElementById("equipmentResetBtn").addEventListener("click", resetEquipmentForm);
  document.getElementById("conflictWarningCloseBtn")?.addEventListener("click", () => document.getElementById("equipmentConflictWarningDialog")?.close());
  document.getElementById("conflictWarningConfirmBtn")?.addEventListener("click", () => document.getElementById("equipmentConflictWarningDialog")?.close());
  document.getElementById("maintenanceExtensionCloseBtn")?.addEventListener("click", () => document.getElementById("maintenanceExtensionDialog")?.close());
  document.getElementById("maintenanceLaterBtn")?.addEventListener("click", () => document.getElementById("maintenanceExtensionDialog")?.close());
  document.getElementById("equipmentAddBtn")?.addEventListener("click", () => startEditEquipment(null));
  document.getElementById("equipmentDialogCloseBtn")?.addEventListener("click", cancelEquipmentEdit);
  document.getElementById("equipmentEditorDialog")?.addEventListener("cancel", handleEquipmentDialogCancel);
  document.getElementById("equipmentEditorDialog")?.addEventListener("close", handleEquipmentDialogClose);
  document.getElementById("equipmentEditorDraftForm")?.addEventListener("input", handleEquipmentEditorDraftInput);
  document.getElementById("equipmentEditorDraftSubmitBtn")?.addEventListener("click", () => {
    document.getElementById("equipmentForm")?.requestSubmit();
  });
  document.getElementById("equipmentEditorDraftCancelBtn")?.addEventListener("click", cancelEquipmentEdit);
  document.getElementById("equipmentEditorDraftResetBtn")?.addEventListener("click", resetEquipmentForm);
  document.getElementById("floorplanLayoutBtn")?.addEventListener("click", toggleFloorplanLayoutMode);
  document.getElementById("floorplanResetBtn")?.addEventListener("click", resetFloorplanLayout);
  document.getElementById("floorplanSaveBtn")?.addEventListener("click", saveFloorplanLayout);
  document.getElementById("floorplanSelectBtn")?.addEventListener("click", focusSelectedFloorplanDevice);
  document.getElementById("reservationFloorplanToggleBtn")?.addEventListener("click", toggleReservationFloorplanThumbnail);
  document.getElementById("clearGanttFilterBtn")?.addEventListener("click", clearGanttFloorplanFilter);
  document.getElementById("ganttFilterResetBtn")?.addEventListener("click", clearGanttFloorplanFilter);
  document.getElementById("reservationFloorplanCanvas")?.addEventListener("click", (event) => {
    if (event.target.closest(".floorplan-device, button, a")) return;
    clearGanttFloorplanFilter();
  });

  document.getElementById("requesterForm").addEventListener("submit", submitRequester);
  document.getElementById("requesterForm").addEventListener("input", markRequesterFormDirty);
  document.getElementById("requesterCancelBtn").addEventListener("click", cancelRequesterEdit);
  document.getElementById("requesterResetBtn").addEventListener("click", resetRequesterForm);
  document.querySelector("#requesterForm input[name='name']").addEventListener("input", syncRequesterEmailSuggestion);
  document.querySelector("#requesterForm input[name='email']").addEventListener("input", markRequesterEmailManual);

  document.querySelector("#reservationForm input[name='requester_name']").addEventListener("input", handleRequesterLookup);
  document.querySelector("#reservationForm input[name='requester_name']").addEventListener("change", syncRequesterFields);
  document.querySelector("#reservationForm input[name='requester_email']").addEventListener("input", handleRequesterLookup);
  document.querySelector("#reservationForm input[name='requester_email']").addEventListener("change", syncRequesterFields);
  document.querySelector("#reservationForm input[name='requester_email']").addEventListener("input", renderReservationRequesterCategory);
  document.querySelector("#reservationForm input[name='department']").addEventListener("input", renderReservationRequesterCategory);

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.viewTarget));
  });

  // Analytics event bindings
  document.querySelectorAll(".analytics-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".analytics-preset-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const preset = btn.dataset.preset;
      state.analyticsPreset = preset;
      const range = getPresetDateRange(preset);
      const startInput = document.getElementById("analyticsStartDate");
      const endInput = document.getElementById("analyticsEndDate");
      if (startInput) startInput.value = range.start;
      if (endInput) endInput.value = range.end;
      renderUtilizationAnalytics();
    });
  });
  document.getElementById("analyticsStartDate")?.addEventListener("change", () => {
    document.querySelectorAll(".analytics-preset-btn").forEach((b) => b.classList.remove("active"));
    renderUtilizationAnalytics();
  });
  document.getElementById("analyticsEndDate")?.addEventListener("change", () => {
    document.querySelectorAll(".analytics-preset-btn").forEach((b) => b.classList.remove("active"));
    renderUtilizationAnalytics();
  });
  document.getElementById("analyticsEquipmentSelect")?.addEventListener("change", renderUtilizationAnalytics);
  document.getElementById("analyticsCalculateBtn")?.addEventListener("click", renderUtilizationAnalytics);
  document.getElementById("analyticsExportBtn")?.addEventListener("click", exportUtilizationToExcel);

  document.getElementById("reservationOpenTab").addEventListener("click", () => setReservationListStatus("open"));
  document.getElementById("reservationClosedTab").addEventListener("click", () => setReservationListStatus("closed"));
  document.getElementById("reservationPrevPage").addEventListener("click", () => moveReservationListPage(-1));
  document.getElementById("reservationNextPage").addEventListener("click", () => moveReservationListPage(1));
  document.addEventListener("pointermove", handleFloorplanPointerMove);
  document.addEventListener("pointermove", handleEquipmentDraftPointerMove);
  document.addEventListener("pointerup", stopFloorplanPointer);
  document.addEventListener("pointerup", stopEquipmentDraftPointer);
  document.addEventListener("pointercancel", stopFloorplanPointer);
  document.addEventListener("pointercancel", stopEquipmentDraftPointer);
}

function hydrateViewFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get("view");
  if (requestedView && ["reservation", "equipment", "requester", "bulletin"].includes(requestedView)) {
    state.activeView = requestedView;
  }
}

function initializeBulletinControls() {
  const intervalInput = document.getElementById("bulletinScrollInterval");
  const durationInput = document.getElementById("bulletinScrollDuration");
  intervalInput.value = String(state.bulletinScroll.intervalSeconds);
  durationInput.value = String(state.bulletinScroll.durationSeconds);
}

function initializeSupabase() {
  state.config = normalizeSupabaseConfig({
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  });
  state.client = buildClient(state.config);
  renderConnectionState();
}

function normalizeSupabaseConfig(config) {
  const url = String(config?.url || "").trim().replace(/\/+$/, "");
  const anonKey = String(config?.anonKey || "").trim();
  if (!url.startsWith("https://")) {
    throw new Error("Supabase URL 必須是 https:// 開頭。");
  }
  if (!anonKey) {
    throw new Error("請提供 Supabase anon key。");
  }
  return { url, anonKey };
}

function buildClient(config) {
  if (!window.supabase?.createClient) {
    throw new Error("Supabase SDK 尚未載入。");
  }

  return window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

async function connectAndLoad(forceRefresh = false) {
  if (!state.client) {
    renderConnectionState("disconnected");
    renderNotice("Supabase 尚未初始化。", "error");
    renderAll();
    return;
  }

  renderConnectionState("connecting");
  if (forceRefresh) {
    renderNotice("正在重新讀取雲端資料...", "info");
  }

  try {
    await loadAll();
    renderConnectionState("connected");
    renderNotice("已連線 Supabase，資料同步完成。", "success");
  } catch (error) {
    console.error(error);
    renderConnectionState("disconnected");
    renderNotice(error.message, "error");
  } finally {
    renderAll();
  }
}

async function loadAll() {
  await loadRequesterDirectory();
  await loadEquipment();
  await loadFloorplanPlacements();
  await loadReservations();
}

async function loadRequesterDirectory() {
  const { data, error } = await state.client
    .from("requester_directory")
    .select("id, name, email, department, sort_order, is_active")
    .order("is_active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.warn("Requester directory unavailable", error.message);
    state.requesters = [];
    return;
  }

  state.requesters = data || [];
}

async function loadEquipment() {
  const baseEquipmentFields = [
    "id",
    "name",
    "category",
    "location",
    "status",
    "capacity",
    "is_active",
    "requires_test_condition",
  ];
  let data = null;
  let error = null;
  state.equipmentLabelSupported = true;
  state.equipmentSpecSupported = true;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const selectedFields = [...baseEquipmentFields];
    if (state.equipmentLabelSupported) selectedFields.push("label_name");
    if (state.equipmentSpecSupported) selectedFields.push("equipment_spec");

    ({ data, error } = await state.client
      .from("equipment")
      .select(selectedFields.join(", "))
      .order("is_active", { ascending: false })
      .order("category", { ascending: true })
      .order("name", { ascending: true }));

    if (!error) break;

    if (state.equipmentLabelSupported && isMissingColumnError(error, "label_name")) {
      state.equipmentLabelSupported = false;
      continue;
    }
    if (state.equipmentSpecSupported && isMissingColumnError(error, "equipment_spec")) {
      state.equipmentSpecSupported = false;
      continue;
    }
    break;
  }

  assertNoError(error, "讀取設備資料失敗");
  state.equipment = (data || []).map((item) => ({
    ...item,
    label_name: item.label_name || "",
    equipment_spec: item.equipment_spec || "",
  }));
}

async function loadFloorplanPlacements() {
  if (!state.client) {
    persistSeedFloorplanPlacements();
    return;
  }

  try {
    const { data, error } = await state.client
      .from("equipment_floorplan_placements")
      .select("equipment_id, x_percent, y_percent, width_percent, height_percent, location_state")
      .order("equipment_id", { ascending: true });

    if (error) {
      if (isFloorplanTableUnavailable(error)) {
        persistSeedFloorplanPlacements();
        return;
      }
      throw error;
    }

    const placements = (data || []).map((item, index) => normalizeFloorplanPlacement(item, index));
    if (placements.length) {
      state.floorplanPlacements = placements;
      state.savedFloorplanPlacements = clonePlacements(placements);
      state.floorplanStorageMode = "supabase";
      writeFloorplanPlacementsToLocalStorage(placements);
      return;
    }
  } catch (error) {
    console.warn("Floorplan placement load failed", error.message);
  }

  persistSeedFloorplanPlacements();
}

function normalizeFloorplanPlacement(item, index) {
  const fallback = getDefaultFloorplanPlacement({ id: item?.equipment_id || index + 1 }, index);
  return {
    equipment_id: Number(item?.equipment_id ?? fallback.equipment_id),
    x_percent: clampNumber(Number(item?.x_percent ?? fallback.x_percent), 0, 100 - fallback.width_percent, fallback.x_percent),
    y_percent: clampNumber(Number(item?.y_percent ?? fallback.y_percent), 0, 100 - fallback.height_percent, fallback.y_percent),
    width_percent: clampNumber(Number(item?.width_percent ?? fallback.width_percent), 3, 100, fallback.width_percent),
    height_percent: clampNumber(Number(item?.height_percent ?? fallback.height_percent), 3, 100, fallback.height_percent),
    location_state: item?.location_state || fallback.location_state,
  };
}

function getSeedFloorplanPlacements() {
  return FLOORPLAN_SEED_PLACEMENTS.map((item, index) => normalizeFloorplanPlacement(item, index));
}

function readFloorplanPlacementsFromLocalStorage() {
  try {
    const raw = window.localStorage?.getItem(FLOORPLAN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, index) => normalizeFloorplanPlacement(item, index));
  } catch (error) {
    console.warn("Floorplan localStorage parse failed", error);
    return [];
  }
}

function writeFloorplanPlacementsToLocalStorage(placements) {
  try {
    window.localStorage?.setItem(FLOORPLAN_STORAGE_KEY, JSON.stringify(placements));
  } catch (error) {
    console.warn("Floorplan localStorage write failed", error);
  }
}

function persistSeedFloorplanPlacements() {
  const localPlacements = readFloorplanPlacementsFromLocalStorage();
  const placements = localPlacements.length ? localPlacements : getSeedFloorplanPlacements();
  state.floorplanPlacements = clonePlacements(placements);
  state.savedFloorplanPlacements = clonePlacements(placements);
  state.floorplanStorageMode = localPlacements.length ? "localStorage" : "seed";
}

function hydrateFloorplanPlacementsFromFallback() {
  persistSeedFloorplanPlacements();
}

function isFloorplanTableUnavailable(error) {
  const message = String(error?.message || "");
  return /equipment_floorplan_placements/i.test(message)
    && /(does not exist|Could not find|relation .* does not exist|schema cache)/i.test(message);
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "");
  const escapedColumn = columnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(${escapedColumn}.*(does not exist|Could not find|schema cache)|Could not find.*${escapedColumn})`, "i").test(message);
}

async function loadReservations() {
  const { data, error } = await state.client
    .from("reservations")
    .select(`
      id,
      equipment_id,
      requester_name,
      requester_email,
      department,
      project_name,
      purpose,
      test_condition,
      start_time,
      end_time,
      status,
      approval_status,
      notes,
      cancel_reason,
      checked_in_at,
      checked_out_at,
      created_at,
      updated_at
    `)
    .order("start_time", { ascending: true });

  assertNoError(error, "讀取預約資料失敗");

  const equipmentById = new Map(state.equipment.map((item) => [Number(item.id), item]));
  state.reservations = (data || []).map((item) => {
    const equipment = equipmentById.get(Number(item.equipment_id));
    return {
      ...item,
      equipment_name: equipment?.name || `設備 #${item.equipment_id}`,
      equipment_category: equipment?.category || "",
    };
  });
}

function renderAll() {
  renderDashboardMetrics();
  renderEquipmentOptions();
  renderRequesterOptions();
  renderAnalyticsEquipmentOptions();
  renderRequesterSummary();
  renderEquipmentSummary();
  renderEquipmentFloorplan();
  renderReservationFloorplan();
  renderDisabledEquipmentList();
  renderViewState();
  renderGantt();
  renderBulletinBoard();
  renderReservationRows();
  renderConnectionState();
  if (state.activeView === "analytics") {
    renderUtilizationAnalytics();
  }
  syncEquipmentForm();
  if (state.equipmentDialogOpen) {
    renderEquipmentEditorFloorplan();
  }
  syncRequesterForm();
}

function markEquipmentFormDirty() {
  state.equipmentFormDirty = true;
  if (state.equipmentDialogOpen) {
    syncEquipmentEditorDraftForm();
    renderEquipmentEditorFloorplan();
  }
}

function markRequesterFormDirty() {
  state.requesterFormDirty = true;
}

function initializeReservationCreateDialog() {
  const dialog = document.getElementById("reservationCreateDialog");
  const panel = document.querySelector(".reservation-panel");
  if (!dialog || !panel || dialog.contains(panel)) return;
  dialog.appendChild(panel);
}

function openReservationCreateDialog(options = {}) {
  const dialog = document.getElementById("reservationCreateDialog");
  if (!dialog) return;
  const form = document.getElementById("reservationForm");
  form.reset();
  setDefaultTimes(options);
  document.getElementById("formMessage").textContent = "";
  if (!dialog.open) dialog.showModal();
}

function closeReservationCreateDialog() {
  document.getElementById("reservationCreateDialog")?.close();
}

function openReservationFromGanttCell(equipment, date) {
  if (!isEquipmentBookable(equipment)) {
    renderNotice("此設備目前不可預約（僅維修中與停用設備無法預約）。", "error");
    return;
  }
  openReservationCreateDialog({
    equipmentId: equipment.id,
    startDate: date,
  });
}

function suggestRequesterEmail(name) {
  const normalizedName = String(name || "").trim();
  const accountName = normalizedName.split(/[（(]/, 1)[0].trim();
  return accountName ? `${accountName}@senao.com` : "";
}

function syncRequesterEmailSuggestion() {
  const form = document.getElementById("requesterForm");
  const nameInput = form.elements.name;
  const emailInput = form.elements.email;
  const suggestedEmail = suggestRequesterEmail(nameInput.value);
  const currentEmail = String(emailInput.value || "").trim();

  if (!currentEmail || currentEmail === state.requesterEmailAutofillValue) {
    emailInput.value = suggestedEmail;
    state.requesterEmailAutofillValue = suggestedEmail;
  }
}

function markRequesterEmailManual(event) {
  const currentEmail = String(event.currentTarget.value || "").trim();
  if (currentEmail !== state.requesterEmailAutofillValue) {
    state.requesterEmailAutofillValue = "";
  }
}

function renderRequesterOptions() {
  const nameList = document.getElementById("requesterNameOptions");
  const emailList = document.getElementById("requesterEmailOptions");
  nameList.innerHTML = state.requesters
    .filter((item) => item.is_active)
    .map((item) => `<option value="${escapeHtml(item.name)}"></option>`)
    .join("");
  emailList.innerHTML = state.requesters
    .filter((item) => item.is_active)
    .map((item) => `<option value="${escapeHtml(item.email)}"></option>`)
    .join("");
}

function renderConnectionState(forcedState = null) {
  const badge = document.getElementById("connectionBadge");
  const mode = forcedState || (state.client ? "connected" : "disconnected");
  badge.className = `status-pill ${mode}`;
  if (mode === "connecting") {
    badge.textContent = "連線中";
  } else if (mode === "connected") {
    badge.textContent = "已連線";
  } else {
    badge.textContent = "未連線";
  }
}

function renderNotice(message, level = "info") {
  const notice = document.getElementById("runtimeNotice");
  notice.className = `notice ${level}`;
  notice.textContent = message;
}

function setActiveView(viewName) {
  state.activeView = viewName;
  const url = new URL(window.location.href);
  url.searchParams.set("view", viewName);
  window.history.replaceState({}, "", url);
  renderViewState();
  if (viewName === "reservation") {
    renderGantt({ scrollDate: state.scheduleFocusDate || state.scheduleStart });
  } else if (viewName === "bulletin") {
    renderBulletinBoard();
  } else if (viewName === "analytics") {
    renderUtilizationAnalytics();
  }
}

function renderViewState() {
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    const isActive = button.dataset.viewTarget === state.activeView;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  document.querySelectorAll("[data-view]").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === state.activeView);
  });
}

function renderDashboardMetrics() {
  const root = document.getElementById("dashboardMetrics");
  const activeReservations = getReservationsWithinWeek().filter((item) => {
    const effectiveStatus = getEffectiveReservationStatus(item);
    return effectiveStatus !== "cancelled" && effectiveStatus !== "checked_out";
  });
  const available = state.equipment.filter((item) => item.status === "available" && !isEquipmentDisabled(item)).length;
  const validation = state.equipment.filter((item) => item.status === "validation" && !isEquipmentDisabled(item)).length;
  const maintenance = state.equipment.filter((item) => item.status === "maintenance" && !isEquipmentDisabled(item)).length;
  const offline = state.equipment.filter((item) => isEquipmentDisabled(item)).length;
  const bookable = state.equipment.filter((item) => isEquipmentBookable(item)).length;
  const reservedHours = activeReservations.reduce((total, reservation) => {
    return total + getReservationHoursWithinWeek(reservation);
  }, 0);

  const metrics = [
    { label: "設備總數", value: state.equipment.length, hint: `可預約 ${bookable} 台` },
    { label: "本週預約", value: activeReservations.length, hint: `${reservedHours.toFixed(1)} 小時` },
    { label: "驗證中", value: validation, hint: "可預約" },
    { label: "維修中", value: maintenance, hint: "不可預約" },
    { label: "停用 / 離線", value: offline, hint: "不可預約" },
  ];

  root.innerHTML = metrics.map((item) => `
    <article class="metric-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <em>${escapeHtml(item.hint)}</em>
    </article>
  `).join("");
}

function getReservationHoursWithinWeek(reservation) {
  const weekStart = state.weekStart.getTime();
  const weekEnd = addDays(state.weekStart, 7).getTime();
  const reservationStart = new Date(reservation.start_time).getTime();
  const reservationEnd = new Date(reservation.end_time).getTime();
  if (!Number.isFinite(reservationStart) || !Number.isFinite(reservationEnd)) return 0;

  const clippedStart = Math.max(reservationStart, weekStart);
  const clippedEnd = Math.min(reservationEnd, weekEnd);
  return Math.max(clippedEnd - clippedStart, 0) / 36e5;
}

function getReservationsWithinWeek() {
  const weekRange = getWeekRange();
  return getReservationsWithinRange(weekRange.start, weekRange.end);
}

function getWeekRange() {
  return {
    start: startOfDay(state.weekStart),
    end: addDays(startOfDay(state.weekStart), 7),
    dayCount: 7,
  };
}

function getFixedGanttDisplayRange(startDate = new Date()) {
  const start = startOfDay(startDate);
  const end = addDays(start, GANTT_DISPLAY_DAYS);
  return {
    start,
    end,
    dayCount: GANTT_DISPLAY_DAYS,
  };
}

function getMonthlyScheduleRange(startDate = new Date()) {
  return getFixedGanttDisplayRange(startDate);
}

function getMainScheduleRange() {
  if (!(state.scheduleRangeStart instanceof Date) || !Number.isFinite(state.scheduleRangeStart.getTime())) {
    state.scheduleRangeStart = addMonths(startOfDay(state.scheduleStart || new Date()), -SCHEDULE_EXTENSION_MONTHS);
  }
  if (!(state.scheduleRangeEnd instanceof Date) || !Number.isFinite(state.scheduleRangeEnd.getTime())) {
    state.scheduleRangeEnd = addMonths(addMonths(startOfDay(state.scheduleFocusDate || new Date()), 1), SCHEDULE_EXTENSION_MONTHS);
  }
  if (state.scheduleRangeEnd <= state.scheduleRangeStart) {
    state.scheduleRangeEnd = addMonths(state.scheduleRangeStart, SCHEDULE_EXTENSION_MONTHS + 1);
  }
  return {
    start: startOfDay(state.scheduleRangeStart),
    end: new Date(state.scheduleRangeEnd),
    dayCount: Math.max(Math.round((state.scheduleRangeEnd.getTime() - state.scheduleRangeStart.getTime()) / 86400000), 1),
  };
}

function getMainScheduleLabelRange() {
  const range = getMainScheduleRange();
  const latestStart = addDays(range.end, -1);
  const focus = new Date(state.scheduleFocusDate || range.start);
  const start = focus < range.start ? range.start : focus > latestStart ? latestStart : startOfDay(focus);
  return getFixedGanttDisplayRange(start);
}

function updateMainScheduleLabel() {
  const label = document.getElementById("scheduleRangeLabel");
  if (!label) return;
  const range = getMainScheduleLabelRange();
  label.textContent = `${formatDate(range.start)} - ${formatDate(addDays(range.end, -1))}`;
}

function getMainScheduleDayWidth() {
  const wrap = document.querySelector(".gantt-schedule-wrap");
  return getGanttDisplayDayWidth(wrap);
}

function getMainGanttViewportBounds(wrap = document.querySelector(".gantt-schedule-wrap")) {
  const wrapRect = wrap?.getBoundingClientRect?.() || { left: 0 };
  const firstLabel = document.querySelector("#ganttChart .gantt-equipment-label");
  const scaleSpacer = document.querySelector("#ganttScale .gantt-equipment-spacer");
  const labelRect = (firstLabel || scaleSpacer)?.getBoundingClientRect?.();
  const wrapLeft = Number(wrapRect.left) || 0;
  const contentLeft = wrapLeft + Math.max(Number(wrap?.clientLeft) || 0, 0);
  const leftBoundary = Number.isFinite(labelRect?.right) ? labelRect.right : contentLeft + 220;
  const rightBoundary = contentLeft + Math.max(Number(wrap?.clientWidth) || 0, 0);
  return {
    wrapLeft,
    leftBoundary,
    rightBoundary,
  };
}

function getMainGanttViewportDateRange(
  wrap = document.querySelector(".gantt-schedule-wrap"),
  scheduleRange = getMainScheduleRange(),
) {
  const dayWidth = getMainScheduleDayWidth();
  const scheduleStart = startOfDay(scheduleRange.start);
  const dayCount = Math.max(Number(scheduleRange.dayCount) || 1, 1);
  const { wrapLeft, leftBoundary, rightBoundary } = getMainGanttViewportBounds(wrap);
  const timelineOrigin = leftBoundary - wrapLeft;
  const scrollLeft = Math.max(Number(wrap?.scrollLeft) || 0, 0);
  const leftPixel = scrollLeft + leftBoundary - wrapLeft;
  const rightPixel = scrollLeft + rightBoundary - wrapLeft;
  const firstDay = Math.min(
    Math.max(Math.floor((leftPixel - timelineOrigin) / dayWidth), 0),
    dayCount - 1,
  );
  const lastDayExclusive = Math.min(
    Math.max(Math.ceil((rightPixel - timelineOrigin) / dayWidth), firstDay + 1),
    dayCount,
  );
  return {
    start: addDays(scheduleStart, firstDay),
    end: addDays(scheduleStart, lastDayExclusive),
    dayCount: lastDayExclusive - firstDay,
  };
}

function getMainGanttViewportKey(wrap = document.querySelector(".gantt-schedule-wrap")) {
  const range = getMainGanttViewportDateRange(wrap, getMainScheduleRange());
  return `${range.start.getTime()}:${range.end.getTime()}`;
}

function scheduleMainGanttViewportRelayout(
  wrap = document.querySelector(".gantt-schedule-wrap"),
  { immediate = false } = {},
) {
  if (!wrap || state.isExtendingSchedule) return;
  if (state.mainGanttViewport.timerId !== null) {
    window.clearTimeout(state.mainGanttViewport.timerId);
    state.mainGanttViewport.timerId = null;
  }

  const run = () => {
    state.mainGanttViewport.timerId = null;
    const currentWrap = document.querySelector(".gantt-schedule-wrap");
    if (!currentWrap || !document.querySelector("#ganttChart .gantt-row")) return;
    const currentKey = getMainGanttViewportKey(currentWrap);
    const shouldRelayout = currentKey !== state.mainGanttViewport.key;
    if (shouldRelayout) {
      const scrollLeft = currentWrap.scrollLeft;
      const scrollTop = currentWrap.scrollTop;
      renderGanttSurface({
        scaleId: "ganttScale",
        chartId: "ganttChart",
        labelId: "scheduleRangeLabel",
        variant: "default",
        range: getMainScheduleRange(),
      });
      currentWrap.scrollLeft = scrollLeft;
      currentWrap.scrollTop = scrollTop;
      state.mainGanttViewport.key = currentKey;
      updateMainScheduleLabel();
    }
    syncMainGanttBarInfo();
  };

  if (immediate) {
    run();
    return;
  }
  state.mainGanttViewport.timerId = window.setTimeout(run, GANTT_VIEWPORT_RELAYOUT_DEBOUNCE_MS);
}

function getGanttDisplayDayWidth(wrap) {
  const availableWidth = Math.max((wrap?.clientWidth || 1280) - 220, 760);
  return Math.max(Math.floor(availableWidth / GANTT_DISPLAY_DAYS), 24);
}

function getDateAtMainScheduleScroll(wrap = document.querySelector(".gantt-schedule-wrap")) {
  const range = getMainScheduleRange();
  const dayWidth = getMainScheduleDayWidth();
  const dayOffset = Math.min(Math.max(Math.floor((wrap?.scrollLeft || 0) / dayWidth), 0), range.dayCount - 1);
  return addDays(range.start, dayOffset);
}

function scrollMainScheduleToDate(date) {
  const wrap = document.querySelector(".gantt-schedule-wrap");
  if (!wrap) return;
  const targetDate = startOfDay(date || state.scheduleFocusDate || state.scheduleStart || new Date());
  ensureMainScheduleRangeForDate(targetDate);
  const range = getMainScheduleRange();
  const dayWidth = getMainScheduleDayWidth();
  const dayOffset = Math.max(Math.round((targetDate.getTime() - range.start.getTime()) / 86400000), 0);
  wrap.scrollLeft = dayOffset * dayWidth;
  state.scheduleFocusDate = targetDate;
  updateMainScheduleLabel();
  syncMainGanttBarInfo();
  scheduleMainGanttViewportRelayout(wrap, { immediate: true });
}

function ensureMainScheduleRangeForDate(date) {
  const targetDate = startOfDay(date);
  let changed = false;
  while (targetDate < state.scheduleRangeStart) {
    state.scheduleRangeStart = addMonths(state.scheduleRangeStart, -SCHEDULE_EXTENSION_MONTHS);
    changed = true;
  }
  while (addDays(targetDate, GANTT_DISPLAY_DAYS) > state.scheduleRangeEnd) {
    state.scheduleRangeEnd = addMonths(state.scheduleRangeEnd, SCHEDULE_EXTENSION_MONTHS);
    changed = true;
  }
  return changed;
}

function moveMainScheduleMonth(direction) {
  const nextFocus = addMonths(state.scheduleFocusDate || state.scheduleStart || new Date(), direction);
  state.scheduleFocusDate = startOfDay(nextFocus);
  ensureMainScheduleRangeForDate(state.scheduleFocusDate);
  renderGantt({ scrollDate: state.scheduleFocusDate });
}

function extendMainScheduleRange(direction, anchorDate = null) {
  const now = Date.now();
  if (state.isExtendingSchedule || now - state.lastScheduleExtensionAt < SCHEDULE_EXTENSION_COOLDOWN_MS) return;
  state.lastScheduleExtensionAt = now;

  const wrap = document.querySelector(".gantt-schedule-wrap");
  const scrollAnchor = anchorDate || getDateAtMainScheduleScroll(wrap);
  if (direction < 0) {
    state.scheduleRangeStart = addMonths(state.scheduleRangeStart, -SCHEDULE_EXTENSION_MONTHS);
  } else {
    state.scheduleRangeEnd = addMonths(state.scheduleRangeEnd, SCHEDULE_EXTENSION_MONTHS);
  }
  state.isExtendingSchedule = true;
  renderGantt({ scrollDate: scrollAnchor });
  window.requestAnimationFrame(() => {
    scrollMainScheduleToDate(scrollAnchor);
    state.isExtendingSchedule = false;
    scheduleMainGanttViewportRelayout(wrap, { immediate: true });
  });
}

function handleMainGanttScroll(event) {
  if (state.isExtendingSchedule) return;
  const wrap = event.currentTarget;
  const dayWidth = getMainScheduleDayWidth();
  const edgeThreshold = dayWidth * 14;
  if (wrap.scrollLeft < edgeThreshold) {
    extendMainScheduleRange(-1, getDateAtMainScheduleScroll(wrap));
    return;
  }
  if (wrap.scrollLeft + wrap.clientWidth > wrap.scrollWidth - edgeThreshold) {
    extendMainScheduleRange(1, getDateAtMainScheduleScroll(wrap));
    return;
  }
  state.scheduleFocusDate = getDateAtMainScheduleScroll(wrap);
  updateMainScheduleLabel();
  scheduleMainGanttViewportRelayout(wrap);
}

function handleMainGanttResize() {
  const wrap = document.querySelector(".gantt-schedule-wrap");
  if (!wrap || !document.querySelector("#ganttChart .gantt-row")) return;
  renderGantt({ scrollDate: state.scheduleFocusDate || state.scheduleStart });
}

function syncMainGanttBarInfo() {
  const wrap = document.querySelector(".gantt-schedule-wrap");
  const firstLabel = document.querySelector("#ganttChart .gantt-equipment-label");
  if (!wrap || !firstLabel) return;

  const { leftBoundary: ganttLeft, rightBoundary: ganttRight } = getMainGanttViewportBounds(wrap);
  const edgeInset = 6;

  document.querySelectorAll("#ganttChart .gantt-bar-info").forEach((info) => {
    info.style.removeProperty("transform");
    info.style.removeProperty("width");
    info.style.removeProperty("max-width");
    info.style.removeProperty("overflow");
    const bar = info.closest(".gantt-bar");
    if (!bar) return;
    const barRect = bar.getBoundingClientRect();
    const crossesLeftEdge = barRect.left < ganttLeft && barRect.right > ganttLeft;
    const crossesRightEdge = barRect.left < ganttRight && barRect.right > ganttRight;
    if (!crossesLeftEdge && !crossesRightEdge) return;

    const visibleLeft = Math.max(barRect.left, ganttLeft);
    const visibleRight = Math.min(barRect.right, ganttRight);
    const visibleWidth = Math.max(visibleRight - visibleLeft, 0);
    const inset = Math.min(edgeInset, visibleWidth / 2);
    const constrainedWidth = Math.max(visibleWidth - inset * 2, 0);
    info.style.width = `${constrainedWidth.toFixed(2)}px`;
    info.style.maxWidth = `${constrainedWidth.toFixed(2)}px`;
    info.style.overflow = "hidden";

    const infoRect = info.getBoundingClientRect();
    const minLeft = visibleLeft + inset;
    const maxLeft = visibleRight - inset - infoRect.width;
    const targetLeft = Math.min(Math.max(infoRect.left, minLeft), Math.max(minLeft, maxLeft));
    const offset = targetLeft - infoRect.left;
    if (Math.abs(offset) > 0.01) {
      info.style.transform = `translateX(${offset.toFixed(2)}px)`;
    }
  });
}

function bindGanttDrag(wrap) {
  if (!wrap) return;
  wrap.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (target?.closest("button, input, select, textarea, a, .dialog")) return;
    state.ganttDrag = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: wrap.scrollLeft,
      scrollTop: wrap.scrollTop,
      dragging: false,
    };
  });
  wrap.addEventListener("pointermove", (event) => {
    if (!state.ganttDrag || state.ganttDrag.pointerId !== event.pointerId) return;
    if (state.ganttDrag.pointerType === "touch") return;
    const deltaX = event.clientX - state.ganttDrag.startX;
    const deltaY = event.clientY - state.ganttDrag.startY;
    if (!state.ganttDrag.dragging && Math.hypot(deltaX, deltaY) < GANTT_DRAG_THRESHOLD_PX) return;
    if (!state.ganttDrag.dragging) {
      state.ganttDrag.dragging = true;
      wrap.classList.add("is-dragging");
      wrap.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    wrap.scrollLeft = state.ganttDrag.scrollLeft - deltaX;
    wrap.scrollTop = state.ganttDrag.scrollTop - deltaY;
  });
  const stopDrag = (event) => {
    if (!state.ganttDrag || state.ganttDrag.pointerId !== event.pointerId) return;
    const wasDragging = state.ganttDrag.dragging;
    state.ganttDrag = null;
    if (wasDragging) wrap.classList.remove("is-dragging");
    if (wrap.hasPointerCapture?.(event.pointerId)) {
      wrap.releasePointerCapture(event.pointerId);
    }
  };
  wrap.addEventListener("pointerup", stopDrag);
  wrap.addEventListener("pointercancel", stopDrag);
}

function getReservationsWithinRange(startDate, endDate) {
  const rangeStart = new Date(startDate).getTime();
  const rangeEnd = new Date(endDate).getTime();
  return state.reservations.filter((reservation) => {
    const reservationStart = new Date(reservation.start_time).getTime();
    const reservationEnd = new Date(reservation.end_time).getTime();
    return Number.isFinite(reservationStart)
      && Number.isFinite(reservationEnd)
      && reservationStart < rangeEnd
      && reservationEnd > rangeStart;
  });
}

function renderEquipmentOptions() {
  const select = document.querySelector("#reservationForm select[name='equipment_id']");
  const previousValue = select.value;
  select.innerHTML = "";

  state.equipment
    .filter((item) => isEquipmentBookable(item))
    .forEach((item) => {
      const view = getEquipmentViewModel(item);
      const option = document.createElement("option");
      option.value = view.id;
      option.textContent = item.status === "validation" ? `${view.optionText} [驗證中]` : view.optionText;
      select.appendChild(option);
    });

  if (!select.options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "目前沒有可預約設備";
    select.appendChild(option);
  }

  if (previousValue && Array.from(select.options).some((option) => option.value === previousValue)) {
    select.value = previousValue;
  }

  syncReservationEquipmentState();
}

function getEquipmentViewModel(equipment) {
  const status = equipment.status || "offline";
  const statusLabel = statusText[status] || status;
  const isActive = isTruthyFlag(equipment.is_active);
  const isBookable = isEquipmentBookable(equipment);
  return {
    id: equipment.id,
    name: equipment.name || "-",
    labelName: equipment.label_name || "",
    category: equipment.category || "-",
    location: equipment.location || "-",
    capacity: equipment.capacity || "-",
    equipmentSpec: equipment.equipment_spec || "未設定",
    status,
    statusLabel,
    isActive,
    isBookable,
    isDisabled: isEquipmentDisabled(equipment),
    requiresTestCondition: isTruthyFlag(equipment.requires_test_condition),
    requiresTestConditionLabel: isTruthyFlag(equipment.requires_test_condition) ? "必填" : "非必填",
    labelText: `${equipment.category || "-"} / ${statusLabel}`,
    optionText: `${equipment.name || "-"} (${equipment.category || "-"})`,
  };
}

function renderEquipmentSummary() {
  const root = document.getElementById("equipmentSummary");
  root.innerHTML = "";

  if (!state.equipment.length) {
    root.innerHTML = '<article class="empty-card">目前尚無設備資料。</article>';
    return;
  }

  state.equipment.forEach((item) => {
    const view = getEquipmentViewModel(item);
    const card = document.createElement("article");
    card.className = "equipment-card";
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(view.name)}</h3>
        <div class="equipment-state">
          <span class="badge ${escapeHtml(view.status)}">${escapeHtml(view.statusLabel)}</span>
          ${view.isActive ? "" : '<span class="badge inactive">停用</span>'}
        </div>
        <div class="equipment-card-meta">
          <span>類別：${escapeHtml(view.category)}</span>
          <span>位置：${escapeHtml(view.location)}</span>
          <span>可重疊預約量：${escapeHtml(view.capacity)}</span>
          <span>設備規格：${escapeHtml(view.equipmentSpec)}</span>
          <span>測試條件：${escapeHtml(view.requiresTestConditionLabel)}</span>
        </div>
      </div>
      <div class="equipment-card-actions">
        <button type="button" class="secondary equipment-edit-btn" data-edit-equipment="${view.id}">編輯</button>
      </div>
    `;

    card.querySelector("[data-edit-equipment]").addEventListener("click", () => startEditEquipment(item.id));
    root.appendChild(card);
  });
}

function startEditEquipment(equipmentId, options = {}) {
  const isReadOnly = Boolean(options?.readOnly);
  state.equipmentDialogReadOnly = isReadOnly;
  const dialog = document.getElementById("equipmentEditorDialog");
  const normalizedEquipmentId = equipmentId == null ? null : Number(equipmentId);
  const equipment = state.equipment.find((item) => Number(item.id) === normalizedEquipmentId) || null;

  if (!isReadOnly && equipment && equipment.status === "maintenance" && isMaintenanceExpired(equipment)) {
    promptMaintenanceExtensionDialog(equipment);
    return;
  }
  const draftEquipmentId = equipment ? Number(equipment.id) : EQUIPMENT_DRAFT_ID;
  const existingPlacement = equipment
    ? getAllFloorplanPlacementsForRender().find((item) => Number(item.equipment_id) === Number(equipment.id))
    : null;
  const fallbackIndex = equipment
    ? Math.max(state.equipment.findIndex((item) => Number(item.id) === Number(equipment.id)), 0)
    : state.equipment.length;
  const basePlacements = clonePlacements(getAllFloorplanPlacementsForRender());
  const draftPlacement = normalizeFloorplanPlacement(
    existingPlacement
      ? { ...existingPlacement, equipment_id: draftEquipmentId }
      : getDefaultFloorplanPlacement({ id: draftEquipmentId }, fallbackIndex),
    fallbackIndex,
  );

  state.editingEquipmentId = normalizedEquipmentId;
  state.equipmentDialogOpen = true;
  state.equipmentDialogSaved = false;
  state.equipmentDraftEquipmentId = draftEquipmentId;
  state.equipmentDraftPlacements = clonePlacements([
    ...basePlacements.filter((item) => Number(item.equipment_id) !== draftEquipmentId),
    draftPlacement,
  ]).sort((left, right) => Number(left.equipment_id) - Number(right.equipment_id));
  state.equipmentDraftPointer = null;
  state.equipmentFormDirty = false;
  syncEquipmentForm();
  renderEquipmentEditorFloorplan();
  if (!isReadOnly) {
    setActiveView("equipment");
  }
  if (dialog?.open) return;
  dialog?.showModal();
}

function syncEquipmentForm() {
  const form = document.getElementById("equipmentForm");
  const title = document.getElementById("equipmentFormTitle");
  const submitButton = document.getElementById("equipmentSubmitBtn");
  const cancelButton = document.getElementById("equipmentCancelBtn");
  const resetButton = document.getElementById("equipmentResetBtn");
  const message = document.getElementById("equipmentMessage");
  const equipment = state.equipment.find((item) => Number(item.id) === state.editingEquipmentId);
  const draftSubmitBtn = document.getElementById("equipmentEditorDraftSubmitBtn");
  const draftResetBtn = document.getElementById("equipmentEditorDraftResetBtn");
  const draftCancelBtn = document.getElementById("equipmentEditorDraftCancelBtn");
  const draftSectionP = document.querySelector(".equipment-editor-map .section-title p");

  if (state.equipmentFormDirty && !state.equipmentDialogReadOnly) return;

  const isReadOnly = state.equipmentDialogReadOnly;

  const formElements = form?.elements ? Array.from(form.elements) : [];
  const draftForm = document.getElementById("equipmentEditorDraftForm");
  const draftElements = draftForm ? Array.from(draftForm.querySelectorAll("input, select, textarea")) : [];
  [...formElements, ...draftElements].forEach((el) => {
    if (el.tagName === "BUTTON") return;
    el.disabled = isReadOnly;
  });

  if (isReadOnly) {
    if (draftSubmitBtn) draftSubmitBtn.style.display = "none";
    if (draftResetBtn) draftResetBtn.style.display = "none";
    if (draftCancelBtn) draftCancelBtn.textContent = "關閉";
    if (draftSectionP) draftSectionP.textContent = "設備位置配置（唯讀預覽）。";
    if (submitButton) submitButton.hidden = true;
    if (resetButton) resetButton.hidden = true;
    if (cancelButton) {
      cancelButton.textContent = "關閉";
      cancelButton.hidden = false;
    }
  } else {
    if (draftSubmitBtn) draftSubmitBtn.style.display = "";
    if (draftResetBtn) draftResetBtn.style.display = "";
    if (draftCancelBtn) draftCancelBtn.textContent = "關閉";
    if (draftSectionP) draftSectionP.textContent = "拖曳或調整角落控制點；按下送出才會寫回主平面圖。";
    if (submitButton) submitButton.hidden = false;
    if (resetButton) resetButton.hidden = false;
    if (cancelButton) cancelButton.textContent = "取消";
  }

  if (!equipment) {
    title.textContent = "新增/編輯設備資訊";
    const draftTitle = document.getElementById("equipmentEditorDraftTitle");
    const draftSubtitle = document.getElementById("equipmentEditorSubtitle");
    if (draftTitle) draftTitle.textContent = "新增設備";
    if (draftSubtitle) draftSubtitle.textContent = "填寫設備資料並完成平面圖草稿定位後送出。";
    if (submitButton) submitButton.textContent = "新增設備";
    if (cancelButton) cancelButton.hidden = true;
    if (resetButton) resetButton.textContent = "清空";
    form.elements.equipment_id.value = "";
    form.elements.name.value = "";
    if (form.elements.label_name) form.elements.label_name.value = "";
    form.elements.category.value = "";
    form.elements.location.value = "";
    form.elements.capacity.value = "";
    form.elements.equipment_spec.value = "";
    form.elements.requires_test_condition.value = "0";
    form.elements.status.value = "available";
    if (!message.dataset.preserve) {
      message.textContent = "";
    }
    syncEquipmentEditorDraftForm();
    state.equipmentFormDirty = false;
    return;
  }

  title.textContent = isReadOnly ? `設備詳細資訊：${equipment.name} (唯讀)` : `編輯設備資訊：${equipment.name}`;
  const draftTitle = document.getElementById("equipmentEditorDraftTitle");
  const draftSubtitle = document.getElementById("equipmentEditorSubtitle");
  if (draftTitle) draftTitle.textContent = isReadOnly ? `設備詳細資訊：${equipment.name}` : `編輯設備：${equipment.name}`;
  if (draftSubtitle) draftSubtitle.textContent = isReadOnly ? "此視窗為唯讀瀏覽模式，僅供查看設備規格、狀態與位置配置。" : "調整設備資料或平面圖草稿定位後送出。";
  if (submitButton) submitButton.textContent = "儲存變更";
  if (cancelButton) cancelButton.hidden = false;
  if (resetButton) resetButton.textContent = "回復原值";
  form.elements.equipment_id.value = String(equipment.id);
  form.elements.name.value = equipment.name;
  if (form.elements.label_name) form.elements.label_name.value = equipment.label_name || "";
  form.elements.category.value = equipment.category;
  form.elements.location.value = equipment.location || "";
  form.elements.capacity.value = String(equipment.capacity || "");
  form.elements.equipment_spec.value = equipment.equipment_spec || "";
  form.elements.requires_test_condition.value = isTruthyFlag(equipment.requires_test_condition) ? "1" : "0";
  form.elements.status.value = equipment.status;
  message.textContent = "";
  syncEquipmentEditorDraftForm();
  state.equipmentFormDirty = false;
}

function syncEquipmentEditorDraftForm() {
  const form = document.getElementById("equipmentForm");
  const draft = document.getElementById("equipmentEditorDraftForm");
  if (!form || !draft) return;
  ["equipment_id", "name", "category", "location", "capacity", "equipment_spec", "requires_test_condition", "status"]
    .forEach((name) => {
      const source = form.elements[name];
      const target = draft.querySelector(`[name="${name}"]`);
      if (source && target) target.value = source.value;
    });
}

function handleEquipmentEditorDraftInput(event) {
  if (state.equipmentDialogReadOnly) return;
  const field = event.target;
  if (!field || !field.name) return;
  const name = field.name;
  const form = document.getElementById("equipmentForm");
  const source = form?.elements?.[name];
  if (!source) return;
  source.value = field.value;
  markEquipmentFormDirty();
}

function resetEquipmentForm() {
  if (state.equipmentDialogReadOnly) return;
  state.equipmentFormDirty = false;
  syncEquipmentForm();
  if (state.equipmentDialogOpen) {
    renderEquipmentEditorFloorplan();
  }
}

function cancelEquipmentEdit() {
  const dialog = document.getElementById("equipmentEditorDialog");
  if (dialog?.open) {
    state.equipmentDialogSaved = false;
    state.equipmentDialogReadOnly = false;
    dialog.close();
    return;
  }
  state.editingEquipmentId = null;
  state.equipmentFormDirty = false;
  state.equipmentDialogReadOnly = false;
  state.equipmentDraftEquipmentId = null;
  state.equipmentDraftPlacements = [];
  state.equipmentDraftPointer = null;
  const message = document.getElementById("equipmentMessage");
  if (message) {
    message.dataset.preserve = "";
    message.textContent = "已取消編輯。";
  }
  syncEquipmentForm();
  renderEquipmentFloorplan();
  renderDisabledEquipmentList();
}

function renderGantt(options = {}) {
  syncGanttFloorplanFilterNotice();
  const scheduleRange = getMainScheduleRange();
  const scrollDate = options.scrollDate || state.scheduleFocusDate || scheduleRange.start;
  renderGanttSurface({
    scaleId: "ganttScale",
    chartId: "ganttChart",
    labelId: "scheduleRangeLabel",
    variant: "default",
    range: scheduleRange,
  });
  updateMainScheduleLabel();
  window.requestAnimationFrame(() => {
    scrollMainScheduleToDate(scrollDate);
    syncMainGanttBarInfo();
  });
}

function renderBulletinBoard() {
  const bulletinRange = getMonthlyScheduleRange(state.bulletinMonthStart);
  renderGanttSurface({
    scaleId: "bulletinScale",
    chartId: "bulletinChart",
    labelId: "bulletinMonthLabel",
    variant: "bulletin",
    range: bulletinRange,
  });
  const stamp = document.getElementById("bulletinTimestamp");
  stamp.textContent = `更新時間 ${new Date().toLocaleString("zh-TW")}`;
  scheduleBulletinAutoScroll();
}

function renderGanttSurface({ scaleId, chartId, labelId, variant, range = getWeekRange() }) {
  const scale = document.getElementById(scaleId);
  const chart = document.getElementById(chartId);
  const labelNode = document.getElementById(labelId);
  if (labelNode) {
    const labelRange = variant === "default" ? getMainScheduleLabelRange() : range;
    labelNode.textContent = `${formatDate(labelRange.start)} - ${formatDate(addDays(labelRange.end, -1))}`;
  }

  if (!scale || !chart) return;
  const dayWidth = variant === "default"
    ? getMainScheduleDayWidth()
    : getGanttDisplayDayWidth(document.querySelector(".bulletin-wrap"));
  const minWidth = 220 + range.dayCount * dayWidth;
  scale.style.gridTemplateColumns = `220px repeat(${range.dayCount}, ${dayWidth}px)`;
  scale.style.width = `${minWidth}px`;
  scale.style.minWidth = `${minWidth}px`;
  scale.style.setProperty("--gantt-year-label-left", "calc(220px + 8px)");
  scale.style.setProperty("--gantt-year-label-right", "8px");
  chart.style.width = `${minWidth}px`;
  chart.style.minWidth = `${minWidth}px`;
  scale.innerHTML = "";
  appendGanttYearHeader(scale, range, variant);
  const equipmentSpacer = document.createElement("div");
  equipmentSpacer.className = `gantt-equipment-spacer ${variant === "bulletin" ? "bulletin-cell" : ""}`;
  equipmentSpacer.textContent = "設備";
  scale.appendChild(equipmentSpacer);
  chart.innerHTML = "";

  for (let offset = 0; offset < range.dayCount; offset += 1) {
    const date = addDays(range.start, offset);
    const tick = document.createElement("div");
    tick.className = `gantt-day${variant === "bulletin" ? " bulletin-cell" : ""}`;
    tick.textContent = `${dayNames[date.getDay()]} ${formatDate(date)}`;
    scale.appendChild(tick);
  }

  if (!state.equipment.length) {
    chart.innerHTML = '<div class="gantt-placeholder">目前尚無設備資料。</div>';
    return;
  }

  const visibleEquipment = state.equipment.filter((equipment) => !isEquipmentDisabled(equipment));
  const ganttEquipment = state.selectedGanttEquipmentId == null
    ? visibleEquipment
    : visibleEquipment.filter((equipment) => Number(equipment.id) === Number(state.selectedGanttEquipmentId));
  ganttEquipment.forEach((equipment) => {
    const equipmentView = getEquipmentViewModel(equipment);
    const row = document.createElement("div");
    row.className = `gantt-row${variant === "bulletin" ? " bulletin-row" : ""}`;

    const label = document.createElement("div");
    label.className = `gantt-equipment-label${variant === "bulletin" ? " bulletin-cell" : ""}`;
    label.innerHTML = `
      <button type="button" class="equipment-zoom-btn" title="查看設備詳細資訊">${escapeHtml(equipmentView.name)}</button>
      <span>${escapeHtml(equipmentView.labelText)}</span>
    `;
    label.querySelector(".equipment-zoom-btn").addEventListener("click", () => startEditEquipment(equipment.id, { readOnly: true }));

    const lane = document.createElement("div");
    lane.className = `gantt-lane${variant === "bulletin" ? " bulletin-lane" : ""}`;
    lane.style.setProperty("--gantt-day-count", String(range.dayCount));
    if (equipment.status !== "available" || !equipment.is_active) {
      lane.classList.add("is-limited");
    }

    const reservations = getReservationsWithinRange(range.start, range.end).filter((reservation) =>
      Number(reservation.equipment_id) === Number(equipment.id) &&
      reservation.status !== "cancelled"
    );

    const stackedReservations = layoutStackedReservations(reservations, range);
    const viewportRange = variant === "default"
      ? getMainGanttViewportDateRange(document.querySelector(".gantt-schedule-wrap"), range)
      : null;
    const viewportStackedReservations = variant === "default"
      ? layoutStackedReservations(
        getReservationsIntersectingRange(reservations, viewportRange),
        viewportRange,
      )
      : [];
    const viewportReservationLayouts = new Map(
      viewportStackedReservations.map((item) => [item.reservation, item]),
    );
    stackedReservations.forEach((item) => {
      const viewportItem = viewportReservationLayouts.get(item.reservation);
      if (!viewportItem) return;
      item.renderLevel = viewportItem.level;
    });
    const visibleStackedReservations = getVisibleStackedReservations(stackedReservations, variant);
    const laneSummary = getGanttLaneSummary(stackedReservations, visibleStackedReservations);
    const viewportStackCount = Math.max(
      viewportStackedReservations.reduce((max, item) => Math.max(max, item.level + 1), 1),
      1,
    );
    const ganttMetrics = variant === "default"
      ? getDefaultGanttMetrics(viewportStackCount)
      : variant === "bulletin"
        ? getBulletinGanttMetrics(Math.max(stackedReservations[0]?.stackCount || 1, 1))
        : null;

    if (ganttMetrics && variant === "default") {
      row.style.minHeight = `${ganttMetrics.rowHeight}px`;
      row.style.height = `${ganttMetrics.rowHeight}px`;
      lane.style.minHeight = `${ganttMetrics.rowHeight}px`;
      lane.style.height = `${ganttMetrics.rowHeight}px`;
    } else if (ganttMetrics) {
      lane.style.minHeight = `${ganttMetrics.rowHeight}px`;
      lane.style.height = `${ganttMetrics.rowHeight}px`;
    }

    visibleStackedReservations.forEach((stacked) => {
      const { reservation } = stacked;
      const view = getReservationViewModel(reservation);
      const requesterCategory = getRequesterCategory(reservation);
      const purposeClass = String(reservation.purpose || "").trim() === "校驗"
        ? "purpose-calibration"
        : "";
      const bar = document.createElement("button");
      bar.type = "button";
      const textMode = variant === "default"
        ? (ganttMetrics?.textMode || "project")
        : "full";
      bar.className = [
        "gantt-bar",
        `requester-category-${requesterCategory.key}`,
        purposeClass,
        variant === "bulletin" ? "bulletin-bar" : "",
        variant === "default" && textMode === "full" ? "full-text" : "",
        variant === "default" && textMode === "project" ? "project-only" : "",
        variant === "default" && textMode === "project-requester" ? "project-requester" : "",
        getEffectiveReservationStatus(reservation) === "checked_out" ? "is-complete" : "",
      ].filter(Boolean).join(" ");
      bar.style.cssText = ganttMetrics
        ? `${getGanttBarStyle(stacked.reservation, { gapPx: stacked.fillsToDayEnd ? 0 : 3, visualEndTime: stacked.fillsToDayEnd ? stacked.visualEndTime : null, range })} top: ${ganttMetrics.top + (stacked.renderLevel ?? stacked.level) * (ganttMetrics.barHeight + ganttMetrics.gap)}px; height: ${ganttMetrics.barHeight}px;`
        : getStackedGanttBarStyle(stacked, { variant, compact: true, range });
      bar.title = view.titleText;
      bar.innerHTML = `
        <strong>${escapeHtml(view.projectName)}</strong>
      `;
      if (variant === "default") {
        bar.innerHTML = getMainGanttBarMarkup(reservation, textMode);
      } else if (variant === "bulletin") {
        bar.innerHTML = getBulletinGanttBarMarkup(reservation);
      }
      bar.addEventListener("click", (event) => {
        event.stopPropagation();
        openReservationDetail(reservation);
      });
      lane.appendChild(bar);
    });

    if (variant === "default") {
      lane.addEventListener("dblclick", (event) => handleMainGanttLaneDoubleClick(event, equipment, range, lane));
    }

    if (laneSummary.hiddenCount > 0) {
      const overflow = document.createElement("button");
      overflow.type = "button";
      overflow.className = "gantt-overflow-chip";
      overflow.textContent = `+${laneSummary.hiddenCount}`;
      overflow.title = "開啟設備預約放大檢視";
      overflow.addEventListener("click", () => openEquipmentSchedule(equipment));
      lane.appendChild(overflow);
    }

    if (reservations.length === 0) {
      const empty = document.createElement("span");
      empty.className = "gantt-empty";
      empty.textContent = "此期間沒有預約";
      lane.appendChild(empty);
    }

    row.appendChild(label);
    row.appendChild(lane);
    chart.appendChild(row);
  });
}

function handleMainGanttLaneDoubleClick(event, equipment, range, lane) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(".gantt-bar, .gantt-overflow-chip")) return;

  const rect = lane.getBoundingClientRect();
  if (!rect.width) return;
  const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 0.999999);
  const dayOffset = Math.floor(ratio * range.dayCount);
  openReservationFromGanttCell(equipment, addDays(range.start, dayOffset));
}

function layoutStackedReservations(reservations, range = getWeekRange()) {
  const sorted = [...reservations].sort((a, b) => {
    const startDiff = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    if (startDiff !== 0) return startDiff;
    return new Date(a.end_time).getTime() - new Date(b.end_time).getTime();
  });
  const levelEndTimes = [];
  const laidOut = sorted.map((reservation) => {
    const start = new Date(reservation.start_time).getTime();
    const end = new Date(reservation.end_time).getTime();
    let level = levelEndTimes.findIndex((levelEnd) => start >= levelEnd);
    if (level === -1) {
      level = levelEndTimes.length;
      levelEndTimes.push(end);
    } else {
      levelEndTimes[level] = end;
    }
    return { reservation, level, stackCount: 1 };
  });
  const stackCount = Math.max(levelEndTimes.length, 1);
  laidOut.forEach((item) => {
    item.stackCount = stackCount;
  });
  applyRightEdgeFill(laidOut, range);
  return laidOut;
}

function applyRightEdgeFill(stackedReservations, range = getWeekRange()) {
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();
  const groups = new Map();

  stackedReservations.forEach((item) => {
    const start = Math.max(new Date(item.reservation.start_time).getTime(), rangeStart);
    const end = Math.min(new Date(item.reservation.end_time).getTime(), rangeEnd);
    const dayIndex = Math.min(Math.max(Math.floor((start - rangeStart) / 86400000), 0), range.dayCount - 1);
    const key = `${item.level}:${dayIndex}`;
    item.visualEndTime = end;
    item.fillsToDayEnd = false;
    if (!isSingleDayReservation(item.reservation)) {
      return;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ item, end, dayIndex });
  });

  groups.forEach((group) => {
    const rightMostEnd = Math.max(...group.map((entry) => entry.end));
    const dayEnd = Math.min(rangeStart + (group[0].dayIndex + 1) * 86400000, rangeEnd);
    group
      .filter((entry) => entry.end === rightMostEnd)
      .forEach((entry) => {
        entry.item.visualEndTime = dayEnd;
        entry.item.fillsToDayEnd = true;
      });
  });
}

function isSingleDayReservation(reservation) {
  const start = new Date(reservation.start_time);
  const end = new Date(reservation.end_time);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  return start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
}

function getVisibleStackedReservations(stackedReservations, variant = "default") {
  const maxVisibleLevels = variant === "bulletin" ? Number.POSITIVE_INFINITY : 5;
  return stackedReservations.filter((item) => (item.renderLevel ?? item.level) < maxVisibleLevels);
}

function getReservationsIntersectingRange(reservations, range) {
  const rangeStart = new Date(range.start).getTime();
  const rangeEnd = new Date(range.end).getTime();
  return reservations.filter((reservation) => {
    const reservationStart = new Date(reservation.start_time).getTime();
    const reservationEnd = new Date(reservation.end_time).getTime();
    return Number.isFinite(reservationStart)
      && Number.isFinite(reservationEnd)
      && reservationStart < rangeEnd
      && reservationEnd > rangeStart;
  });
}

function getDefaultGanttMetrics(stackCount = 1) {
  const clampedStackCount = Math.min(Math.max(Number(stackCount) || 1, 1), 5);
  const gap = 3;
  const verticalPadding = clampedStackCount === 1 ? 14 : 2;
  const rowHeight = clampedStackCount === 1 ? 76 : 90;
  const availableHeight = rowHeight - verticalPadding * 2;
  const preferredHeight = 48;
  const preferredTotalHeight = preferredHeight * clampedStackCount + gap * (clampedStackCount - 1);
  const barHeight = clampedStackCount === 1
    ? preferredHeight
    : preferredTotalHeight <= availableHeight
      ? preferredHeight
      : Math.max(12, Math.floor((availableHeight - gap * (clampedStackCount - 1)) / clampedStackCount));
  const top = verticalPadding;
  let textMode = "full";
  if (barHeight < 28) {
    textMode = "project";
  } else if (barHeight < 38) {
    textMode = "project-requester";
  }
  return {
    rowHeight,
    barHeight,
    gap,
    top,
    textMode,
  };
}

function getBulletinGanttMetrics(stackCount = 1) {
  const levels = Math.max(Number(stackCount) || 1, 1);
  const barHeight = 76;
  const gap = 10;
  const top = 14;
  return {
    rowHeight: top * 2 + barHeight * levels + gap * (levels - 1),
    barHeight,
    gap,
    top,
  };
}

function getGanttLaneSummary(stackedReservations, visibleStackedReservations) {
  return {
    hiddenCount: Math.max(stackedReservations.length - visibleStackedReservations.length, 0),
  };
}

function getGanttBarStyle(reservation, options = {}) {
  const { gapPx = 0, visualEndTime = null, range = getWeekRange() } = options;
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();
  const reservationStart = new Date(reservation.start_time).getTime();
  const reservationEnd = visualEndTime ? new Date(visualEndTime).getTime() : new Date(reservation.end_time).getTime();
  const clampedStart = Math.max(reservationStart, rangeStart);
  const clampedEnd = Math.min(reservationEnd, rangeEnd);
  const total = rangeEnd - rangeStart;
  const left = ((clampedStart - rangeStart) / total) * 100;
  const minimumWidth = 100 / Math.max(Number(range.dayCount) || 1, 1);
  const width = Math.max(((clampedEnd - clampedStart) / total) * 100, minimumWidth);
  if (gapPx > 0) {
    return `left: ${left.toFixed(3)}%; width: calc(${width.toFixed(3)}% - ${gapPx}px);`;
  }
  return `left: ${left.toFixed(3)}%; width: ${width.toFixed(3)}%;`;
}

function getStackedGanttBarStyle(stacked, options = {}) {
  const { variant = "default", zoom = false, compact = false, range = getWeekRange() } = options;
  const baseStyle = getGanttBarStyle(stacked.reservation, { visualEndTime: stacked.visualEndTime, range });
  if (compact) {
    const height = variant === "bulletin" ? 20 : 16;
    const gap = variant === "bulletin" ? 4 : 3;
    const top = variant === "bulletin" ? 10 + stacked.level * (height + gap) : 8 + stacked.level * (height + gap);
    return `${baseStyle} top: ${top}px; height: ${height}px;`;
  }

  const hasOverlap = stacked.stackCount > 1;
  const height = zoom ? 58 : variant === "bulletin" ? 70 : hasOverlap ? 40 : 56;
  const gap = zoom ? 8 : variant === "bulletin" ? 8 : hasOverlap ? 6 : 0;
  const top = zoom ? 12 + stacked.level * (height + gap) : variant === "bulletin" ? 14 + stacked.level * (height + gap) : 10 + stacked.level * (height + gap);
  return `${baseStyle} top: ${top}px; height: ${height}px;`;
}

function getMainGanttBarMarkup(reservation, textMode) {
  const view = getReservationViewModel(reservation);
  const projectName = escapeHtml(view.projectName);
  const requesterName = escapeHtml(view.requesterName);
  const timeRange = view.timeRange;

  if (textMode === "none") {
    return "";
  }

  if (textMode === "project") {
    return `<span class="gantt-bar-info"><strong>${projectName}</strong></span>`;
  }

  if (textMode === "project-requester") {
    return `
      <span class="gantt-bar-info">
        <strong>${projectName}</strong>
        <span>${requesterName}</span>
      </span>
    `;
  }

  return `
    <span class="gantt-bar-info">
      <strong>${projectName}</strong>
      <span>${requesterName}</span>
      <em>${timeRange}</em>
    </span>
  `;
}

function getBulletinGanttBarMarkup(reservation) {
  const view = getReservationViewModel(reservation);
  return `
    <strong>${escapeHtml(view.projectName)}</strong>
    <span>${escapeHtml(view.requesterName)}</span>
    <em>${escapeHtml(view.timeRange)}</em>
  `;
}

function getEffectiveReservationStatus(reservation, now = new Date()) {
  if (reservation.status === "cancelled") return "cancelled";
  if (reservation.status === "checked_out") return "checked_out";
  if (getReservationEquipmentConflict(reservation)) {
    return reservation.status || "reserved";
  }
  const end = new Date(reservation.end_time).getTime();
  if (Number.isFinite(end) && end <= now.getTime()) return "checked_out";
  return reservation.status || "reserved";
}

function canCompleteReservation(reservation, now = new Date()) {
  const effectiveStatus = getEffectiveReservationStatus(reservation, now);
  const start = new Date(reservation.start_time).getTime();
  return effectiveStatus !== "cancelled"
    && effectiveStatus !== "checked_out"
    && Number.isFinite(start)
    && now.getTime() >= start;
}

function getReservationViewModel(reservation) {
  const effectiveStatus = getEffectiveReservationStatus(reservation);
  const statusLabel = statusText[effectiveStatus] || effectiveStatus;
  const projectName = reservation.project_name || "未填專案";
  const requesterName = reservation.requester_name || "-";
  const equipmentName = reservation.equipment_name || "-";
  const equipmentCategory = reservation.equipment_category || "-";
  const startText = formatDateTime(reservation.start_time);
  const endText = formatDateTime(reservation.end_time);
  const timeRange = `${startText} - ${endText}`;
  const detailRows = [
    ["設備", equipmentName],
    ["設備類別", equipmentCategory],
    ["專案名稱", reservation.project_name],
    ["申請人", reservation.requester_name],
    ["Email", reservation.requester_email],
    ["部門", reservation.department],
    ["使用目的", reservation.purpose],
    ["測試條件", reservation.test_condition],
    ["開始時間", startText],
    ["結束時間", endText],
    ["狀態", statusLabel],
    ["備註", reservation.notes],
    ["取消原因", reservation.cancel_reason],
    ["預約編號", reservation.id],
  ];

  return {
    id: reservation.id,
    projectName,
    requesterName,
    equipmentName,
    equipmentCategory,
    department: reservation.department || "-",
    purpose: reservation.purpose || "-",
    effectiveStatus,
    statusLabel,
    startText,
    endText,
    timeRange,
    titleText: `${equipmentName} / ${projectName} / ${timeRange}`,
    subtitleText: `${equipmentName} / ${timeRange}`,
    detailRows,
  };
}

function openEquipmentSchedule(equipment) {
  const dialog = document.getElementById("equipmentScheduleDialog");
  if (!dialog) return;
  renderEquipmentScheduleDialog(equipment);
  dialog.showModal();
}

function getGanttYearSegments(range) {
  const start = new Date(range.start);
  start.setHours(0, 0, 0, 0);
  const dayCount = Math.max(Number(range.dayCount) || 0, 0);
  const segments = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = new Date(start);
    date.setDate(date.getDate() + offset);
    const year = date.getFullYear();
    const current = segments.at(-1);
    if (current && current.year === year) {
      current.span += 1;
    } else {
      segments.push({ year, span: 1 });
    }
  }
  return segments;
}

function appendGanttYearHeader(scale, range, variant = "default") {
  const spacer = document.createElement("div");
  spacer.className = `gantt-equipment-spacer gantt-year-spacer ${variant === "bulletin" ? "bulletin-cell" : ""}`;
  spacer.setAttribute("aria-hidden", "true");
  scale.appendChild(spacer);

  getGanttYearSegments(range).forEach((segment) => {
    const cell = document.createElement("div");
    cell.className = `gantt-year-cell${variant === "bulletin" ? " bulletin-cell" : ""}`;
    cell.style.gridColumn = `span ${segment.span}`;
    const label = document.createElement("span");
    label.className = "gantt-year-label";
    label.textContent = `${segment.year} 年`;
    cell.appendChild(label);
    scale.appendChild(cell);
  });
}

function renderEquipmentScheduleDialog(equipment) {
  const weekRange = getWeekRange();
  const equipmentView = getEquipmentViewModel(equipment);
  const title = document.getElementById("equipmentScheduleTitle");
  const subtitle = document.getElementById("equipmentScheduleSubtitle");
  const scale = document.getElementById("equipmentScheduleScale");
  const chart = document.getElementById("equipmentScheduleChart");
  const list = document.getElementById("equipmentScheduleList");
  if (!title || !subtitle || !scale || !chart || !list) return;

  const reservations = getReservationsWithinWeek().filter((reservation) =>
    Number(reservation.equipment_id) === Number(equipment.id) &&
    reservation.status !== "cancelled"
  );
  const stackedReservations = layoutStackedReservations(reservations, weekRange);
  title.textContent = equipmentView.name || "設備預約放大檢視";
  subtitle.textContent = `${equipmentView.category} / ${formatDate(weekRange.start)} - ${formatDate(addDays(weekRange.end, -1))}`;
  scale.innerHTML = "";
  scale.style.setProperty("--gantt-year-label-left", "8px");
  scale.style.setProperty("--gantt-year-label-right", "8px");
  chart.innerHTML = "";

  getGanttYearSegments(weekRange).forEach((segment) => {
    const cell = document.createElement("div");
    cell.className = "gantt-year-cell equipment-schedule-year-cell";
    cell.style.gridColumn = `span ${segment.span}`;
    const label = document.createElement("span");
    label.className = "gantt-year-label";
    label.textContent = `${segment.year} 年`;
    cell.appendChild(label);
    scale.appendChild(cell);
  });

  for (let offset = 0; offset < weekRange.dayCount; offset += 1) {
    const date = addDays(weekRange.start, offset);
    const tick = document.createElement("div");
    tick.className = "equipment-schedule-day";
    tick.textContent = `${dayNames[date.getDay()]} ${formatDate(date)}`;
    scale.appendChild(tick);
  }

  const lane = document.createElement("div");
  lane.className = "equipment-schedule-lane";
  lane.style.minHeight = `${Math.max(32 + Math.max(stackedReservations[0]?.stackCount || 1, 1) * 66, 128)}px`;

  stackedReservations.forEach((stacked) => {
    const reservation = stacked.reservation;
    const view = getReservationViewModel(reservation);
    const purposeClass = String(reservation.purpose || "").trim() === "校驗"
      ? "purpose-calibration"
      : "";
    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = [
      "gantt-bar",
      "equipment-schedule-bar",
      purposeClass,
      getEffectiveReservationStatus(reservation) === "checked_out" ? "is-complete" : "",
    ].filter(Boolean).join(" ");
    bar.style.cssText = getStackedGanttBarStyle(stacked, { zoom: true, range: weekRange });
    bar.title = view.titleText;
    bar.innerHTML = `
      <strong>${escapeHtml(view.projectName)}</strong>
      <span>${escapeHtml(view.requesterName)}</span>
      <em>${escapeHtml(view.timeRange)}</em>
    `;
    bar.addEventListener("click", () => openReservationDetail(reservation));
    lane.appendChild(bar);
  });

  if (!stackedReservations.length) {
    const empty = document.createElement("span");
    empty.className = "gantt-empty";
    empty.textContent = "此期間沒有預約";
    lane.appendChild(empty);
  }

  chart.appendChild(lane);
  list.innerHTML = reservations.length
    ? reservations.map((reservation) => {
      const view = getReservationViewModel(reservation);
      return `
      <button type="button" class="equipment-schedule-list-item" data-reservation-id="${escapeHtml(reservation.id)}">
        <strong>${escapeHtml(view.projectName)}</strong>
        <span>${escapeHtml(view.requesterName)} / ${escapeHtml(view.timeRange)}</span>
      </button>
    `;
    }).join("")
    : '<div class="empty-card">本週沒有預約</div>';
  list.querySelectorAll("[data-reservation-id]").forEach((button) => {
    const reservation = reservations.find((item) => String(item.id) === String(button.dataset.reservationId));
    if (reservation) {
      button.addEventListener("click", () => openReservationDetail(reservation));
    }
  });
}

function openReservationDetail(reservation) {
  const view = getReservationViewModel(reservation);
  const dialog = document.getElementById("reservationDetailDialog");
  const title = document.getElementById("reservationDetailTitle");
  const subtitle = document.getElementById("reservationDetailSubtitle");
  const body = document.getElementById("reservationDetailBody");
  const copyButton = document.getElementById("reservationDetailCopyBtn");
  const completeButton = document.getElementById("reservationDetailCompleteBtn");
  const cancelButton = document.getElementById("reservationDetailCancelBtn");
  const status = document.getElementById("reservationDetailCopyStatus");
  if (!dialog || !title || !subtitle || !body || !copyButton || !completeButton || !cancelButton || !status) return;

  title.textContent = view.projectName || "預約明細";
  subtitle.textContent = view.subtitleText;
  body.innerHTML = view.detailRows.map(([label, value]) => `
    <div class="detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `).join("");
  status.textContent = "";
  copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(getReservationDetailText(reservation));
      status.textContent = "已複製";
    } catch (error) {
      status.textContent = "複製失敗，請手動選取";
    }
  };
  completeButton.hidden = !canCompleteReservation(reservation);
  completeButton.onclick = () => completeProject(reservation);
  const isReadOnly = ["cancelled", "checked_out"].includes(getEffectiveReservationStatus(reservation));
  cancelButton.hidden = isReadOnly;
  cancelButton.onclick = () => cancelProject(reservation);
  configureReservationEdit(reservation);
  dialog.showModal();
}

function configureReservationEdit(reservation) {
  const panel = document.querySelector(".reservation-edit-panel");
  const emailInput = document.getElementById("reservationEditEmail");
  const unlockButton = document.getElementById("reservationEditUnlockBtn");
  const projectInput = document.getElementById("reservationEditProject");
  const startInput = document.getElementById("reservationEditStart");
  const endInput = document.getElementById("reservationEditEnd");
  const saveButton = document.getElementById("reservationEditSaveBtn");
  const message = document.getElementById("reservationEditMessage");
  if (!emailInput || !unlockButton || !projectInput || !startInput || !endInput || !saveButton || !message) return;

  const isReadOnly = ["cancelled", "checked_out"].includes(getEffectiveReservationStatus(reservation));
  if (panel) {
    panel.hidden = isReadOnly;
  }
  emailInput.value = "";
  projectInput.value = reservation.project_name || "";
  startInput.value = toDateTimeInput(new Date(reservation.start_time));
  endInput.value = toDateTimeInput(new Date(reservation.end_time));
  message.textContent = "";
  setReservationEditUnlocked(false);
  if (isReadOnly) {
    unlockButton.onclick = null;
    saveButton.onclick = null;
    return;
  }
  unlockButton.onclick = () => unlockReservationEdit(reservation);
  saveButton.onclick = () => saveReservationEdit(reservation);
}

function setReservationEditUnlocked(isUnlocked) {
  const projectInput = document.getElementById("reservationEditProject");
  const startInput = document.getElementById("reservationEditStart");
  const endInput = document.getElementById("reservationEditEnd");
  const saveButton = document.getElementById("reservationEditSaveBtn");
  [projectInput, startInput, endInput, saveButton].forEach((node) => {
    if (node) node.disabled = !isUnlocked;
  });
}

function unlockReservationEdit(reservation) {
  const emailInput = document.getElementById("reservationEditEmail");
  const message = document.getElementById("reservationEditMessage");
  if (!emailInput || !message) return;

  if (!emailMatchesReservation(emailInput.value, reservation)) {
    setReservationEditUnlocked(false);
    message.textContent = "Email 不符合此筆預約者，無法解鎖。";
    return;
  }

  setReservationEditUnlocked(true);
  message.textContent = "已解鎖，可修改專案名稱與縮短預約時間。";
}

function emailMatchesReservation(email, reservation) {
  return String(email || "").trim().toLowerCase() === String(reservation.requester_email || "").trim().toLowerCase();
}

function validateShortenedReservationWindow(reservation, startIso, endIso) {
  const originalStart = new Date(reservation.start_time).getTime();
  const originalEnd = new Date(reservation.end_time).getTime();
  const nextStart = new Date(startIso).getTime();
  const nextEnd = new Date(endIso).getTime();

  if (!Number.isFinite(nextStart) || !Number.isFinite(nextEnd)) {
    throw new Error("請輸入有效的開始與結束時間。");
  }
  if (nextEnd <= nextStart) {
    throw new Error("結束時間必須晚於開始時間。");
  }
  if (nextStart < originalStart || nextEnd > originalEnd) {
    throw new Error("預約時間只能縮短，不能早於原開始時間或晚於原結束時間。");
  }
}

async function saveReservationEdit(reservation) {
  assertClientReady();
  const projectInput = document.getElementById("reservationEditProject");
  const startInput = document.getElementById("reservationEditStart");
  const endInput = document.getElementById("reservationEditEnd");
  const message = document.getElementById("reservationEditMessage");
  const dialog = document.getElementById("reservationDetailDialog");
  if (!projectInput || !startInput || !endInput || !message) return;

  if (["cancelled", "checked_out"].includes(getEffectiveReservationStatus(reservation))) {
    message.textContent = "已完成或已取消的預約只能瀏覽，不能再修改。";
    return;
  }

  const projectName = String(projectInput.value || "").trim();
  if (!projectName) {
    message.textContent = "請輸入專案名稱。";
    return;
  }

  try {
    const startIso = localInputToIso(startInput.value);
    const endIso = localInputToIso(endInput.value);
    validateShortenedReservationWindow(reservation, startIso, endIso);

    const patch = {
      project_name: projectName,
      start_time: startIso,
      end_time: endIso,
    };

    const { data: updated, error: updateError } = await state.client
      .from("reservations")
      .update(patch)
      .eq("id", reservation.id)
      .select()
      .single();
    assertNoError(updateError, "更新預約失敗");

    const { error: historyError } = await state.client
      .from("reservation_history")
      .insert({
        reservation_id: reservation.id,
        action: "updated",
        old_value: reservation,
        new_value: updated,
        changed_by_name: reservation.requester_name,
      });
    assertNoError(historyError, "寫入預約歷程失敗");

    message.textContent = "預約已更新。";
    await loadReservations();
    renderAll();
    dialog?.close();
  } catch (error) {
    message.textContent = error.message;
  }
}

function getReservationDetailRows(reservation) {
  return getReservationViewModel(reservation).detailRows;
}

function getReservationDetailText(reservation) {
  return getReservationDetailRows(reservation)
    .map(([label, value]) => `${label}: ${value || "-"}`)
    .join("\n");
}

function renderReservationRows() {
  const rows = document.getElementById("reservationRows");
  const openTab = document.getElementById("reservationOpenTab");
  const closedTab = document.getElementById("reservationClosedTab");
  const previousPage = document.getElementById("reservationPrevPage");
  const nextPage = document.getElementById("reservationNextPage");
  const pageLabel = document.getElementById("reservationPageLabel");
  rows.innerHTML = "";

  const isClosedTab = state.reservationList.status === "closed";
  const filteredReservations = state.reservations.filter((reservation) => {
    const isClosed = ["cancelled", "checked_out"].includes(getEffectiveReservationStatus(reservation));
    return isClosedTab ? isClosed : !isClosed;
  });
  const totalPages = Math.max(Math.ceil(filteredReservations.length / state.reservationList.pageSize), 1);
  state.reservationList.page = Math.min(Math.max(state.reservationList.page, 1), totalPages);
  const pageStart = (state.reservationList.page - 1) * state.reservationList.pageSize;
  const pageReservations = filteredReservations.slice(pageStart, pageStart + state.reservationList.pageSize);

  openTab.classList.toggle("active", !isClosedTab);
  openTab.setAttribute("aria-selected", String(!isClosedTab));
  closedTab.classList.toggle("active", isClosedTab);
  closedTab.setAttribute("aria-selected", String(isClosedTab));
  previousPage.disabled = state.reservationList.page <= 1;
  nextPage.disabled = state.reservationList.page >= totalPages;
  pageLabel.textContent = `${isClosedTab ? "已結案" : "未結案"}｜第 ${state.reservationList.page} / ${totalPages} 頁，共 ${filteredReservations.length} 個專案`;

  if (!pageReservations.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="6" class="muted">本週尚無預約資料。</td>';
    rows.appendChild(tr);
    return;
  }

  pageReservations.forEach((reservation) => {
    const view = getReservationViewModel(reservation);
    const requesterCategory = getRequesterCategory(reservation);
    const effectiveStatus = getEffectiveReservationStatus(reservation);
    const conflict = getReservationEquipmentConflict(reservation);

    const conflictClass = conflict ? ` is-equipment-conflict is-${conflict.type}-conflict` : "";
    const completeClass = effectiveStatus === "checked_out" ? " is-complete" : "";

    const tr = document.createElement("tr");
    tr.className = `reservation-row requester-category-${requesterCategory.key}${conflictClass}${completeClass}`;

    const statusBadgeMarkup = conflict
      ? `<span class="badge badge-conflict-danger" title="${escapeHtml(conflict.reason)}：不可自動結案">⚠️ ${escapeHtml(conflict.reason)}</span>`
      : `<span class="badge ${escapeHtml(view.effectiveStatus)}">${escapeHtml(view.statusLabel)}</span>`;

    tr.innerHTML = `
      <td>${escapeHtml(view.equipmentName)}</td>
      <td>${escapeHtml(view.startText)}<br>${escapeHtml(view.endText)}</td>
      <td>
        ${escapeHtml(view.requesterName)}<br>
        <span class="muted">${escapeHtml(view.department)}</span>
        <em class="requester-category-badge requester-category-${escapeHtml(requesterCategory.key)}">${escapeHtml(requesterCategory.label)}</em>
      </td>
      <td>${escapeHtml(view.projectName)}<br><span class="muted">${escapeHtml(view.purpose)}</span></td>
      <td>${statusBadgeMarkup}</td>
      <td class="row-actions"></td>
    `;

    const actions = tr.querySelector(".row-actions");
    const edit = document.createElement("button");
    edit.className = "secondary small-action";
    edit.type = "button";
    edit.textContent = "編輯";
    edit.addEventListener("click", () => openReservationDetail(reservation));
    actions.appendChild(edit);

    rows.appendChild(tr);
  });
}

function setReservationListStatus(status) {
  if (!["open", "closed"].includes(status)) return;
  state.reservationList.status = status;
  state.reservationList.page = 1;
  renderReservationRows();
}

function moveReservationListPage(direction) {
  const isClosedTab = state.reservationList.status === "closed";
  const filteredReservations = state.reservations.filter((reservation) => {
    const isClosed = ["cancelled", "checked_out"].includes(getEffectiveReservationStatus(reservation));
    return isClosedTab ? isClosed : !isClosed;
  });
  const totalPages = Math.max(Math.ceil(filteredReservations.length / state.reservationList.pageSize), 1);
  state.reservationList.page = Math.min(
    Math.max(state.reservationList.page + direction, 1),
    totalPages,
  );
  renderReservationRows();
}

async function submitReservation(event) {
  event.preventDefault();
  assertClientReady();

  const form = event.currentTarget;
  const message = document.getElementById("formMessage");
  const payload = Object.fromEntries(new FormData(form).entries());
  const equipmentId = Number(payload.equipment_id);
  const startIso = localInputToIso(payload.start_time);
  const endIso = localInputToIso(payload.end_time);

  if (!equipmentId) {
    message.textContent = "請選擇設備。";
    return;
  }
  if (!payload.project_name?.trim()) {
    message.textContent = "請填寫專案名稱。";
    return;
  }
  if (new Date(endIso) <= new Date(startIso)) {
    message.textContent = "結束時間必須晚於開始時間。";
    return;
  }

  try {
    const equipment = state.equipment.find((item) => Number(item.id) === equipmentId);
    if (!equipment || !isEquipmentBookable(equipment)) {
      throw new Error("目前設備狀態不可預約（僅維修中與停用設備無法預約）。");
    }
    if (isTruthyFlag(equipment.requires_test_condition) && !String(payload.test_condition || "").trim()) {
      throw new Error("此設備預約時必須填寫測試條件。");
    }

    const { data: conflicts, error: conflictError } = await state.client
      .from("reservations")
      .select("id, requester_name, start_time, end_time")
      .eq("equipment_id", equipmentId)
      .neq("status", "cancelled")
      .neq("status", "checked_out")
      .lt("start_time", endIso)
      .gt("end_time", startIso);

    assertNoError(conflictError, "讀取預約衝突失敗");
    const capacityLimit = parseEquipmentCapacityLimit(equipment.capacity);
    if ((conflicts?.length || 0) >= capacityLimit) {
      throw new Error(`此設備於該時段的可重疊預約量已滿（上限 ${equipment.capacity || capacityLimit}）。`);
    }

    const reservationRow = {
      equipment_id: equipmentId,
      requester_name: payload.requester_name.trim(),
      requester_email: payload.requester_email.trim(),
      department: payload.department.trim(),
      project_name: payload.project_name.trim(),
      purpose: payload.purpose.trim(),
      test_condition: String(payload.test_condition || "").trim(),
      start_time: startIso,
      end_time: endIso,
      status: "reserved",
      approval_status: "not_required",
      notes: String(payload.notes || "").trim(),
    };

    const { data: inserted, error: insertError } = await state.client
      .from("reservations")
      .insert(reservationRow)
      .select()
      .single();

    assertNoError(insertError, "建立預約失敗");

    const { error: historyError } = await state.client
      .from("reservation_history")
      .insert({
        reservation_id: inserted.id,
        action: "created",
        new_value: reservationRow,
        changed_by_name: payload.requester_name.trim(),
      });

    assertNoError(historyError, "寫入預約歷程失敗");

    message.textContent = "預約已送出。";
    form.reset();
    setDefaultTimes();
    await loadReservations();
    renderAll();
    closeReservationCreateDialog();
  } catch (error) {
    message.textContent = error.message;
  }
}

async function submitEquipment(event) {
  event.preventDefault();
  assertClientReady();

  const form = event.currentTarget;
  const message = document.getElementById("equipmentMessage");
  const payload = Object.fromEntries(new FormData(form).entries());
  const equipmentId = payload.equipment_id ? Number(payload.equipment_id) : null;

  const status = String(payload.status || "available");
  const row = {
    name: String(payload.name || "").trim(),
    category: String(payload.category || "").trim(),
    location: String(payload.location || "").trim(),
    capacity: String(payload.capacity || "").trim(),
    equipment_spec: String(payload.equipment_spec || "").trim(),
    requires_test_condition: String(payload.requires_test_condition || "0") === "1",
    status,
    is_active: status !== "offline",
  };

  if (payload.label_name !== undefined && state.equipmentLabelSupported) {
    row.label_name = String(payload.label_name || "").trim();
  }
  if (!state.equipmentSpecSupported) {
    delete row.equipment_spec;
  }

  if (!row.name) {
    message.textContent = "請填寫設備名稱。";
    return;
  }
  if (!row.category) {
    message.textContent = "請填寫設備類別。";
    return;
  }
  try {
    let savedEquipmentId = equipmentId;
    if (equipmentId) {
      const { error } = await state.client
        .from("equipment")
        .update(row)
        .eq("id", equipmentId);
      assertNoError(error, "更新設備失敗");
      message.textContent = "設備資料已更新。";
    } else {
      const { data, error } = await state.client
        .from("equipment")
        .insert(row)
        .select()
        .single();
      assertNoError(error, "新增設備失敗");
      message.textContent = "設備已新增。";
      savedEquipmentId = Number(data.id);
    }

    await saveEquipmentDraftPlacement(savedEquipmentId);
    state.editingEquipmentId = Number(savedEquipmentId);
    state.selectedFloorplanEquipmentId = Number(savedEquipmentId);
    state.equipmentFormDirty = false;
    message.dataset.preserve = "true";
    await loadEquipment();
    renderAll();
    message.dataset.preserve = "";
    if (!state.equipmentSpecSupported && payload.equipment_spec) {
      message.textContent = "設備規格欄位尚未建立；請先執行 Supabase SQL，其他設備資料已更新。";
    }
    state.equipmentDialogSaved = true;
    document.getElementById("equipmentEditorDialog")?.close();
    if (!state.equipmentLabelSupported && payload.label_name) {
      message.textContent = "平面圖標籤名稱欄位尚未建立；請先執行 Supabase SQL，其他設備資料已更新。";
    }

    // Trigger Warning Dialog if status changed to offline or maintenance
    const updatedEq = state.equipment.find((e) => Number(e.id) === Number(savedEquipmentId));
    if (updatedEq && status === "offline") {
      const affected = state.reservations.filter((res) =>
        Number(res.equipment_id) === Number(updatedEq.id) &&
        res.status !== "cancelled" &&
        res.status !== "checked_out"
      );
      if (affected.length > 0) {
        showEquipmentConflictWarningDialog(updatedEq, affected, "offline");
      }
    } else if (updatedEq && status === "maintenance") {
      const existingMeta = getEquipmentMaintenanceMeta(updatedEq);
      saveMaintenanceMetadata(updatedEq.id, {
        started_at: existingMeta?.started_at || new Date().toISOString(),
        months: existingMeta?.months || 1,
      });
      const meta = getEquipmentMaintenanceMeta(updatedEq);
      const startDate = new Date(meta.started_at);
      const endDate = new Date(startDate.getTime());
      endDate.setMonth(endDate.getMonth() + meta.months);

      const affected = state.reservations.filter((res) => {
        if (Number(res.equipment_id) !== Number(updatedEq.id)) return false;
        if (res.status === "cancelled" || res.status === "checked_out") return false;
        const resStart = new Date(res.start_time).getTime();
        const resEnd = new Date(res.end_time).getTime();
        return resStart < endDate.getTime() && resEnd > startDate.getTime();
      });
      if (affected.length > 0) {
        showEquipmentConflictWarningDialog(updatedEq, affected, "maintenance");
      }
    }
  } catch (error) {
    if (isMissingColumnError(error, "label_name")) {
      state.equipmentLabelSupported = false;
      message.textContent = "平面圖標籤名稱欄位尚未建立；請先執行 Supabase SQL。";
      return;
    }
    message.textContent = error.message;
  }
}

async function submitRequester(event) {
  event.preventDefault();
  assertClientReady();

  const form = event.currentTarget;
  const message = document.getElementById("requesterMessage");
  const payload = Object.fromEntries(new FormData(form).entries());
  const requesterId = payload.requester_id ? Number(payload.requester_id) : null;
  const row = {
    name: String(payload.name || "").trim(),
    email: String(payload.email || "").trim(),
    department: String(payload.department || "PQE").trim() || "PQE",
    is_active: String(payload.is_active || "1") === "1",
  };

  if (!row.name) {
    message.textContent = "請填寫使用者名稱。";
    return;
  }
  if (!row.email) {
    message.textContent = "請填寫 Email。";
    return;
  }

  try {
    if (requesterId) {
      const { error } = await state.client
        .from("requester_directory")
        .update(row)
        .eq("id", requesterId);
      assertNoError(error, "更新使用者失敗");
      message.textContent = "使用者資料已更新。";
      state.editingRequesterId = requesterId;
    } else {
      const nextSort = (state.requesters.at(-1)?.sort_order || 0) + 10;
      const { error } = await state.client
        .from("requester_directory")
        .insert({
          ...row,
          sort_order: nextSort,
        });

      assertNoError(error, "新增使用者失敗");
      message.textContent = "使用者已新增。";
      state.editingRequesterId = null;
    }

    state.requesterFormDirty = false;
    message.dataset.preserve = "true";
    form.reset();
    form.elements.department.value = "PQE";
    form.elements.is_active.value = "1";
    await loadRequesterDirectory();
    renderAll();
    message.dataset.preserve = "";
  } catch (error) {
    message.textContent = error.message;
  }
}

function renderRequesterSummary() {
  const root = document.getElementById("requesterSummary");
  if (!state.requesters.length) {
    root.innerHTML = '<article class="empty-card">目前尚無使用者資料。</article>';
    return;
  }

  root.innerHTML = state.requesters.map((item) => {
    const category = getRequesterCategory(item);
    return `
    <article class="equipment-card requester-card requester-category-${escapeHtml(category.key)}">
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <div class="equipment-state">
          <span class="requester-category-badge requester-category-${escapeHtml(category.key)}">${escapeHtml(category.label)}</span>
          ${item.is_active ? "" : '<span class="badge inactive">停用</span>'}
        </div>
        <div class="equipment-card-meta">
          <span>Email：${escapeHtml(item.email)}</span>
          <span>部門：${escapeHtml(item.department || "PQE")}</span>
        </div>
      </div>
      <div class="equipment-card-actions">
        <button type="button" class="secondary requester-edit-btn" data-edit-requester="${item.id}">編輯</button>
        <button type="button" class="danger-link requester-delete-btn" data-delete-requester="${item.id}">刪除</button>
      </div>
    </article>
  `;
  }).join("");

  root.querySelectorAll("[data-edit-requester]").forEach((button) => {
    button.addEventListener("click", () => startEditRequester(Number(button.dataset.editRequester)));
  });
  root.querySelectorAll("[data-delete-requester]").forEach((button) => {
    button.addEventListener("click", () => deleteRequester(Number(button.dataset.deleteRequester)));
  });
}

function startEditRequester(requesterId) {
  state.editingRequesterId = Number(requesterId);
  state.requesterFormDirty = false;
  syncRequesterForm();
  setActiveView("requester");
}

function syncRequesterForm() {
  const form = document.getElementById("requesterForm");
  const title = document.getElementById("requesterFormTitle");
  const submitButton = document.getElementById("requesterSubmitBtn");
  const cancelButton = document.getElementById("requesterCancelBtn");
  const resetButton = document.getElementById("requesterResetBtn");
  const message = document.getElementById("requesterMessage");
  const requester = state.requesters.find((item) => Number(item.id) === state.editingRequesterId);

  if (state.requesterFormDirty) return;

  if (!requester) {
    title.textContent = "新增/編輯使用者";
    submitButton.textContent = "新增使用者";
    cancelButton.hidden = true;
    resetButton.textContent = "清空";
    form.elements.requester_id.value = "";
    form.elements.name.value = "";
    form.elements.email.value = "";
    state.requesterEmailAutofillValue = "";
    form.elements.department.value = "PQE";
    form.elements.is_active.value = "1";
    if (!message.dataset.preserve) {
      message.textContent = "";
    }
    state.requesterFormDirty = false;
    return;
  }

  title.textContent = `編輯使用者：${requester.name}`;
  submitButton.textContent = "儲存變更";
  cancelButton.hidden = false;
  resetButton.textContent = "回復原值";
  form.elements.requester_id.value = String(requester.id);
  form.elements.name.value = requester.name;
  form.elements.email.value = requester.email;
  const suggestedEmail = suggestRequesterEmail(requester.name);
  state.requesterEmailAutofillValue = requester.email === suggestedEmail ? requester.email : "";
  form.elements.department.value = requester.department || "PQE";
  form.elements.is_active.value = requester.is_active ? "1" : "0";
  message.textContent = "";
  state.requesterFormDirty = false;
}

function resetRequesterForm() {
  state.requesterFormDirty = false;
  syncRequesterForm();
}

function cancelRequesterEdit() {
  state.editingRequesterId = null;
  state.requesterFormDirty = false;
  const message = document.getElementById("requesterMessage");
  message.dataset.preserve = "";
  message.textContent = "已取消編輯。";
  syncRequesterForm();
}

async function deleteRequester(requesterId) {
  assertClientReady();

  const requester = state.requesters.find((item) => Number(item.id) === Number(requesterId));
  if (!requester) return;

  const confirmed = window.confirm(`確定要停用使用者 ${requester.name} 嗎？`);
  if (!confirmed) return;

  try {
    const { error } = await state.client
      .from("requester_directory")
      .update({ is_active: false })
      .eq("id", requesterId);

    assertNoError(error, "停用使用者失敗");

    if (state.editingRequesterId === Number(requesterId)) {
      state.editingRequesterId = null;
      state.requesterFormDirty = false;
    }

    document.getElementById("requesterMessage").textContent = "使用者已刪除。";
    await loadRequesterDirectory();
    renderAll();
  } catch (error) {
    document.getElementById("requesterMessage").textContent = error.message;
  }
}

function equipmentMatchesPayload(equipment, payload) {
  return String(equipment.name) === String(payload.name)
    && String(equipment.label_name || "") === String(payload.label_name || "")
    && String(equipment.category) === String(payload.category)
    && String(equipment.location || "") === String(payload.location || "")
    && String(equipment.capacity || "") === String(payload.capacity || "")
    && String(equipment.equipment_spec || "") === String(payload.equipment_spec || "")
    && String(equipment.status) === String(payload.status)
    && isTruthyFlag(equipment.is_active) === isTruthyFlag(payload.is_active)
    && isTruthyFlag(equipment.requires_test_condition) === isTruthyFlag(payload.requires_test_condition);
}

async function cancelProject(reservation) {
  assertClientReady();

  const reasonInput = window.prompt("請輸入專案取消原因", "行程異動");
  const reason = String(reasonInput || "").trim();
  if (!reason) return;

  try {
    const { data: current, error: loadError } = await state.client
      .from("reservations")
      .select("*")
      .eq("id", reservation.id)
      .single();
    assertNoError(loadError, "讀取預約失敗");

    const { data: updated, error: updateError } = await state.client
      .from("reservations")
      .update({ status: "cancelled", cancel_reason: reason })
      .eq("id", reservation.id)
      .select()
      .single();
    assertNoError(updateError, "取消專案失敗");

    const { error: historyError } = await state.client
      .from("reservation_history")
      .insert({
        reservation_id: reservation.id,
        action: "cancelled",
        old_value: current,
        new_value: updated,
        changed_by_name: reservation.requester_name,
      });
    assertNoError(historyError, "寫入預約歷程失敗");

    await loadReservations();
    renderAll();
    document.getElementById("reservationDetailDialog")?.close();
  } catch (error) {
    renderNotice(error.message, "error");
  }
}

function completeReservation(reservation) {
  return completeProject(reservation);
}

async function completeProject(reservation) {
  assertClientReady();

  if (!canCompleteReservation(reservation)) {
    renderNotice("此專案目前不能標記為完成。", "error");
    return;
  }

  const confirmed = window.confirm("確定要將此專案標記為「專案完成」嗎？完成後會釋放後續時段。");
  if (!confirmed) return;

  try {
    const nowIso = new Date().toISOString();
    const { data: current, error: loadError } = await state.client
      .from("reservations")
      .select("*")
      .eq("id", reservation.id)
      .single();
    assertNoError(loadError, "讀取預約失敗");

    const originalEnd = new Date(current.end_time).getTime();
    const now = new Date(nowIso).getTime();
    const patch = {
      status: "checked_out",
      checked_out_at: nowIso,
      end_time: now < originalEnd ? nowIso : current.end_time,
    };

    const { data: updated, error: updateError } = await state.client
      .from("reservations")
      .update(patch)
      .eq("id", reservation.id)
      .select()
      .single();
    assertNoError(updateError, "完成專案失敗");

    const { error: historyError } = await state.client
      .from("reservation_history")
      .insert({
        reservation_id: reservation.id,
        action: "completed",
        old_value: current,
        new_value: updated,
        changed_by_name: reservation.requester_name,
      });
    assertNoError(historyError, "寫入預約歷史失敗");

    document.getElementById("reservationDetailDialog")?.close();
    await loadReservations();
    renderAll();
  } catch (error) {
    renderNotice(error.message, "error");
  }
}

function assertClientReady() {
  if (!state.client) {
    throw new Error("Supabase 尚未連線。");
  }
}

function assertNoError(error, message) {
  if (!error) return;
  throw new Error(`${message}：${error.message}`);
}

function moveWeek(days) {
  state.weekStart = addDays(state.weekStart, days);
  if (!state.client) {
    renderAll();
    return;
  }
  connectAndLoad();
}

function moveBulletinMonth(direction) {
  state.bulletinMonthStart = startOfMonth(addMonths(state.bulletinMonthStart, direction));
  renderBulletinBoard();
}

function updateBulletinScrollSettings() {
  const intervalInput = document.getElementById("bulletinScrollInterval");
  const durationInput = document.getElementById("bulletinScrollDuration");
  state.bulletinScroll.intervalSeconds = clampNumber(intervalInput.value, 5, 300, 30);
  state.bulletinScroll.durationSeconds = clampNumber(durationInput.value, 1, 30, 1);
  intervalInput.value = String(state.bulletinScroll.intervalSeconds);
  durationInput.value = String(state.bulletinScroll.durationSeconds);
  scheduleBulletinAutoScroll();
}

function getRequesterCategory(requester) {
  const department = String(requester?.department || "").trim().toUpperCase();
  const email = String(requester?.email || requester?.requester_email || "").trim().toLowerCase();
  if (department === "PQE") {
    return { key: "pqe", label: "PQE" };
  }
  if (email.endsWith("@senao.com")) {
    return { key: "senao", label: "神準內部" };
  }
  return { key: "external", label: "外部" };
}

function renderReservationRequesterCategory() {
  const form = document.getElementById("reservationForm");
  const indicator = document.getElementById("reservationRequesterCategory");
  if (!form || !indicator) return;
  const category = getRequesterCategory({
    department: form.elements.department.value,
    email: form.elements.requester_email.value,
  });
  form.classList.remove("requester-category-pqe", "requester-category-senao", "requester-category-external");
  form.classList.add(`requester-category-${category.key}`);
  indicator.className = `requester-category-note requester-category-${category.key} wide`;
  indicator.textContent = `使用者分類：${category.label}`;
  indicator.hidden = false;
}

function handleBulletinViewportChange() {
  const previousScrollTop = document.querySelector(".bulletin-wrap")?.scrollTop || 0;
  renderBulletinBoard();
  const wrap = document.querySelector(".bulletin-wrap");
  if (document.fullscreenElement) {
    wrap.scrollTop = Math.min(previousScrollTop, Math.max(wrap.scrollHeight - wrap.clientHeight, 0));
    scheduleBulletinAutoScroll({ resetPosition: false });
  } else {
    stopBulletinAutoScroll();
  }
}

function handleBulletinFullscreenChange() {
  window.setTimeout(() => {
    if (document.fullscreenElement) {
      scheduleBulletinAutoScroll({ resetPosition: true });
    } else {
      stopBulletinAutoScroll({ resetPosition: true });
    }
  }, 0);
}

function scheduleBulletinAutoScroll() {
  return scheduleBulletinAutoScrollWithOptions();
}

function scheduleBulletinAutoScrollWithOptions(options = {}) {
  const resetPosition = options.resetPosition !== false;
  stopBulletinAutoScroll();

  const wrap = document.querySelector(".bulletin-wrap");
  if (!wrap) return;
  syncBulletinStickyOffset(wrap);
  if (!document.fullscreenElement) return;

  const overflow = wrap.scrollHeight - wrap.clientHeight;
  if (overflow <= 8) {
    wrap.scrollTo({ top: 0, behavior: "auto" });
    state.bulletinScroll.direction = "down";
    return;
  }

  if (resetPosition) {
    wrap.scrollTo({ top: 0, behavior: "auto" });
    state.bulletinScroll.direction = "down";
  } else {
    const maxTop = Math.max(wrap.scrollHeight - wrap.clientHeight, 0);
    state.bulletinScroll.direction = wrap.scrollTop >= maxTop - 8 ? "up" : "down";
  }
  state.bulletinScroll.timerId = window.setInterval(() => {
    stepBulletinAutoScroll();
  }, state.bulletinScroll.intervalSeconds * 1000);
}

function stopBulletinAutoScroll(options = {}) {
  const resetPosition = options.resetPosition === true;
  cancelBulletinScrollAnimation();
  if (state.bulletinScroll.timerId) {
    window.clearInterval(state.bulletinScroll.timerId);
    state.bulletinScroll.timerId = null;
  }

  if (resetPosition) {
    const wrap = document.querySelector(".bulletin-wrap");
    wrap?.scrollTo({ top: 0, behavior: "auto" });
  }
  state.bulletinScroll.direction = "down";
}

function cancelBulletinScrollAnimation() {
  if (state.bulletinScroll.animationFrameId === null) return;
  window.cancelAnimationFrame(state.bulletinScroll.animationFrameId);
  state.bulletinScroll.animationFrameId = null;
}

function animateBulletinScroll(wrap, targetTop) {
  cancelBulletinScrollAnimation();

  const startTop = wrap.scrollTop;
  const distance = targetTop - startTop;
  const durationMs = Math.max(state.bulletinScroll.durationSeconds * 1000, 1);
  if (Math.abs(distance) < 1) {
    wrap.scrollTop = targetTop;
    return;
  }

  const startedAt = window.performance.now();
  const tick = (timestamp) => {
    const progress = Math.min((timestamp - startedAt) / durationMs, 1);
    const easedProgress = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    wrap.scrollTop = startTop + distance * easedProgress;

    if (progress < 1) {
      state.bulletinScroll.animationFrameId = window.requestAnimationFrame(tick);
    } else {
      state.bulletinScroll.animationFrameId = null;
    }
  };

  state.bulletinScroll.animationFrameId = window.requestAnimationFrame(tick);
}

function getBulletinStickyOffset(wrap) {
  return wrap.querySelector(".bulletin-scale")?.getBoundingClientRect().height || 0;
}

function syncBulletinStickyOffset(wrap) {
  const stickyOffset = getBulletinStickyOffset(wrap);
  if (stickyOffset > 0) {
    wrap.style.scrollPaddingTop = `${stickyOffset}px`;
  }
  return stickyOffset;
}

function getBulletinBottomScrollTop(wrap) {
  const maxTop = Math.max(wrap.scrollHeight - wrap.clientHeight, 0);
  const wrapTop = wrap.getBoundingClientRect().top;
  const stickyOffset = syncBulletinStickyOffset(wrap);
  const rowStarts = Array.from(wrap.querySelectorAll(".bulletin-row"))
    .map((row) => row.getBoundingClientRect().top - wrapTop + wrap.scrollTop - stickyOffset)
    .filter((top) => top > 8 && top <= maxTop + 8);

  return rowStarts.at(-1) ?? maxTop;
}

function stepBulletinAutoScroll() {
  const wrap = document.querySelector(".bulletin-wrap");
  if (!wrap) return;
  if (state.bulletinScroll.animationFrameId !== null) return;

  const maxTop = Math.max(wrap.scrollHeight - wrap.clientHeight, 0);
  if (maxTop <= 8) {
    wrap.scrollTo({ top: 0, behavior: "auto" });
    state.bulletinScroll.direction = "down";
    return;
  }

  const targetTop = state.bulletinScroll.direction === "down"
    ? getBulletinBottomScrollTop(wrap)
    : 0;
  animateBulletinScroll(wrap, targetTop);
  state.bulletinScroll.direction = state.bulletinScroll.direction === "down" ? "up" : "down";
}

function openBulletinWindow() {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "bulletin");
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

async function openBulletinFullscreen() {
  const board = document.getElementById("bulletinBoard");
  if (!board) return;

  if (!document.fullscreenElement) {
    await board.requestFullscreen();
    return;
  }

  await document.exitFullscreen();
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function isTruthyFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
  }
  return false;
}

function parseEquipmentCapacityLimit(value) {
  const match = String(value || "").match(/\d+/);
  const parsed = match ? Number(match[0]) : 1;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function setDefaultTimes(options = {}) {
  const form = document.getElementById("reservationForm");
  if (!form) return;
  const selectedDate = options.startDate ? startOfDay(options.startDate) : new Date();
  const start = new Date(selectedDate);
  start.setHours(8, 30, 0, 0);
  form.elements.department.value = "PQE";
  if (options.equipmentId && Array.from(form.elements.equipment_id.options).some((option) => Number(option.value) === Number(options.equipmentId))) {
    form.elements.equipment_id.value = String(options.equipmentId);
  }
  form.elements.start_time.value = toDateTimeInput(start);
  form.elements.end_time.value = "";
  if (form.elements.test_condition) {
    form.elements.test_condition.value = "";
  }
  syncReservationEquipmentState();
  renderReservationRequesterCategory();
}

function syncReservationEquipmentState() {
  const form = document.getElementById("reservationForm");
  if (!form) return;
  const equipmentId = Number(form.elements.equipment_id.value || 0);
  const equipment = state.equipment.find((item) => Number(item.id) === equipmentId) || null;
  const field = document.getElementById("testConditionField");
  const input = form.elements.test_condition;
  if (!field || !input) return;

  const requiresTestCondition = isTruthyFlag(equipment?.requires_test_condition);
  field.hidden = !requiresTestCondition;
  input.required = requiresTestCondition;
  input.disabled = !requiresTestCondition;
  if (!requiresTestCondition) {
    input.value = "";
  }
}

function handleRequesterLookup(event) {
  const field = event.target.name;
  const query = String(event.target.value || "").trim().toLowerCase();
  const matches = !query
    ? []
    : state.requesters
      .filter((item) => {
        if (!item.is_active) return false;
        const haystack = `${item.name} ${item.email} ${item.department || ""}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 6);

  state.requesterSuggestions[field] = matches;
  renderRequesterLookup(field);
}

function renderRequesterLookup(field) {
  const menuId = field === "requester_name" ? "requesterNameMatches" : "requesterEmailMatches";
  const menu = document.getElementById(menuId);
  if (!menu) return;

  const matches = state.requesterSuggestions[field] || [];
  if (!matches.length) {
    menu.hidden = true;
    menu.innerHTML = "";
    return;
  }

  menu.hidden = false;
  menu.innerHTML = matches.map((item, index) => {
    const category = getRequesterCategory(item);
    return `
    <button
      type="button"
      class="typeahead-option requester-category-${escapeHtml(category.key)}"
      data-requester-field="${field}"
      data-requester-index="${index}">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.email)} / ${escapeHtml(item.department || "PQE")}</span>
      <em class="requester-category-badge requester-category-${escapeHtml(category.key)}">${escapeHtml(category.label)}</em>
    </button>
  `;
  }).join("");

  menu.querySelectorAll("[data-requester-index]").forEach((button) => {
    button.addEventListener("click", () => applyRequesterSuggestion(field, Number(button.dataset.requesterIndex)));
  });
}

function applyRequesterSuggestion(field, index) {
  const match = state.requesterSuggestions[field]?.[index];
  if (!match) return;

  const form = document.getElementById("reservationForm");
  form.elements.requester_name.value = match.name;
  form.elements.requester_email.value = match.email;
  form.elements.department.value = match.department || "PQE";
  state.requesterSuggestions.requester_name = [];
  state.requesterSuggestions.requester_email = [];
  renderRequesterLookup("requester_name");
  renderRequesterLookup("requester_email");
  renderReservationRequesterCategory();
}

function syncRequesterFields(event) {
  const form = document.getElementById("reservationForm");
  const nameInput = form.elements.requester_name;
  const emailInput = form.elements.requester_email;
  const departmentInput = form.elements.department;
  const enteredName = String(nameInput.value || "").trim();
  const enteredEmail = String(emailInput.value || "").trim().toLowerCase();

  let match = null;
  if (event?.target?.name === "requester_name") {
    match = state.requesters.find((item) => item.name === enteredName);
    if (match && !emailInput.value.trim()) {
      emailInput.value = match.email;
    }
    if (match && !departmentInput.value.trim()) {
      departmentInput.value = match.department || "PQE";
    }
    state.requesterSuggestions.requester_name = [];
    renderRequesterLookup("requester_name");
    renderReservationRequesterCategory();
    return;
  }

  if (event?.target?.name === "requester_email") {
    match = state.requesters.find((item) => item.email.toLowerCase() === enteredEmail);
    if (match && !nameInput.value.trim()) {
      nameInput.value = match.name;
    }
    if (match && !departmentInput.value.trim()) {
      departmentInput.value = match.department || "PQE";
    }
    state.requesterSuggestions.requester_email = [];
    renderRequesterLookup("requester_email");
    renderReservationRequesterCategory();
    return;
  }

  match = state.requesters.find((item) => item.name === enteredName || item.email.toLowerCase() === enteredEmail);
  if (match) {
    if (!nameInput.value.trim()) {
      nameInput.value = match.name;
    }
    if (!emailInput.value.trim()) {
      emailInput.value = match.email;
    }
    if (!departmentInput.value.trim()) {
      departmentInput.value = match.department || "PQE";
    }
  }
  renderReservationRequesterCategory();
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addHours(date, hours) {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

function formatDate(date) {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMonthLabel(date) {
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatTime(value) {
  const d = new Date(value);
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDateTime(value) {
  const d = new Date(value);
  const day = d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
  const time = d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${time}`;
}

function toDateTimeInput(date) {
  const d = new Date(date);
  const pad = (value) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value) {
  return new Date(value).toISOString();
}

function dateToIso(date) {
  return new Date(date).toISOString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* --------------------------------------------------------------------------
   Equipment floorplan
   -------------------------------------------------------------------------- */

function clonePlacements(placements) {
  return (placements || []).map((item, index) => normalizeFloorplanPlacement(item, index));
}

function getDefaultFloorplanPlacement(equipment, index) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    equipment_id: Number(equipment?.id || index + 1),
    x_percent: 6 + column * 22,
    y_percent: 8 + row * 18,
    width_percent: 12,
    height_percent: 8,
    location_state: "unplaced",
  };
}

function isEquipmentDisabled(equipment) {
  if (!equipment) return false;
  if (String(equipment.status || "available") === "offline") return true;
  const activeFlag = equipment.is_active ?? equipment.isActive;
  const hasActiveFlag = activeFlag !== undefined && activeFlag !== null && activeFlag !== "";
  return hasActiveFlag && !isTruthyFlag(activeFlag);
}

function isEquipmentBookable(equipment) {
  if (!equipment) return false;
  if (isEquipmentDisabled(equipment)) return false;
  if (equipment.status === "maintenance") return false;
  return equipment.status === "available" || equipment.status === "validation";
}

function getAllFloorplanPlacementsForRender() {
  const placementMap = new Map(
    clonePlacements(state.floorplanPlacements).map((item) => [Number(item.equipment_id), item]),
  );
  return state.equipment.map((equipment, index) =>
    placementMap.get(Number(equipment.id)) || getDefaultFloorplanPlacement(equipment, index),
  );
}

function getFloorplanPlacementsForRender() {
  return getAllFloorplanPlacementsForRender().filter((placement) => {
    const equipment = state.equipment.find((item) => Number(item.id) === Number(placement.equipment_id));
    return !isEquipmentDisabled(equipment);
  });
}

function getSelectedFloorplanEquipment() {
  return state.equipment.find((item) => Number(item.id) === Number(state.selectedFloorplanEquipmentId)) || null;
}

function getSelectedFloorplanPlacement() {
  return getFloorplanPlacementsForRender().find(
    (item) => Number(item.equipment_id) === Number(state.selectedFloorplanEquipmentId),
  ) || null;
}

function canEditFloorplanLayout() {
  return typeof isAdmin === "function" ? isAdmin() : true;
}

function setFloorplanPlacementsState(placements, mode) {
  const normalized = clonePlacements(placements);
  state.floorplanPlacements = normalized;
  state.savedFloorplanPlacements = clonePlacements(normalized);
  state.floorplanDirty = false;
  state.floorplanStorageMode = mode;
}

function getEquipmentActiveReservation(equipmentId, targetDate = new Date()) {
  const dayStart = startOfDay(targetDate).getTime();
  const dayEnd = addDays(startOfDay(targetDate), 1).getTime();
  return state.reservations.find((reservation) => {
    if (Number(reservation.equipment_id) !== Number(equipmentId)) return false;
    if (reservation.status === "cancelled") return false;
    const start = new Date(reservation.start_time).getTime();
    const end = new Date(reservation.end_time).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && start < dayEnd && end > dayStart;
  }) || null;
}

function getFloorplanDisplayName(equipment, fallback) {
  const labelName = String(equipment?.label_name || equipment?.labelName || "").trim();
  return labelName || String(equipment?.name || fallback || "").trim();
}

function getFloorplanDeviceClassName(equipment, { selected = false, editing = false } = {}) {
  const status = equipment?.status || "available";
  const classes = ["floorplan-device", `state-${status}`];
  if (selected) classes.push("active");
  if (editing) classes.push("editing");
  if (isEquipmentDisabled(equipment)) classes.push("is-disabled");
  return classes.join(" ");
}

function syncReservationFloorplanThumbnail() {
  const panel = document.querySelector(".reservation-floorplan-panel");
  const toggleBtn = document.getElementById("reservationFloorplanToggleBtn");
  if (!panel || !toggleBtn) return;

  const isThumbnail = !!state.reservationFloorplanThumbnail;
  panel.classList.toggle("is-thumbnail", isThumbnail);
  const icon = toggleBtn.querySelector(".toggle-icon");
  const text = toggleBtn.querySelector(".toggle-text");
  if (isThumbnail) {
    if (icon) icon.innerHTML = "&#x2922;";
    if (text) text.textContent = "展開全圖";
    toggleBtn.title = "展開全圖";
    toggleBtn.setAttribute("aria-label", "展開全圖");
  } else {
    if (icon) icon.innerHTML = "&#x2921;";
    if (text) text.textContent = "縮小為縮圖";
    toggleBtn.title = "縮小為縮圖";
    toggleBtn.setAttribute("aria-label", "縮小為縮圖");
  }
}

function toggleReservationFloorplanThumbnail() {
  state.reservationFloorplanThumbnail = !state.reservationFloorplanThumbnail;
  syncReservationFloorplanThumbnail();
}

function syncGanttFloorplanFilterNotice() {
  const notice = document.getElementById("ganttFilterNotice");
  const resetButton = document.getElementById("ganttFilterResetBtn");
  const nameNode = document.getElementById("ganttFilterEquipmentName");
  const equipment = state.equipment.find(
    (item) => Number(item.id) === Number(state.selectedGanttEquipmentId),
  );
  const isFiltered = !!equipment;
  if (notice) notice.hidden = !isFiltered;
  if (resetButton) resetButton.hidden = !isFiltered;
  if (nameNode) nameNode.textContent = equipment?.name || "";

  const ganttWrap = document.querySelector(".gantt-schedule-wrap");
  if (ganttWrap) {
    ganttWrap.classList.toggle("is-single-filtered", isFiltered);
  }
}

function clearGanttFloorplanFilter() {
  if (state.selectedGanttEquipmentId == null) return;
  state.selectedGanttEquipmentId = null;
  syncGanttFloorplanFilterNotice();
  renderGantt();
  renderReservationFloorplan();
}

function renderReservationFloorplan() {
  const overlay = document.getElementById("reservationFloorplanOverlay");
  const canvas = document.getElementById("reservationFloorplanCanvas");
  const label = document.getElementById("reservationFloorplanDateLabel");
  if (!overlay || !canvas) return;

  syncReservationFloorplanThumbnail();
  syncGanttFloorplanFilterNotice();
  const today = startOfDay(new Date());
  const todayText = `${today.getMonth() + 1}/${today.getDate()}`;
  if (label) {
    const selectedEquipment = state.equipment.find(
      (item) => Number(item.id) === Number(state.selectedGanttEquipmentId),
    );
    const selectedText = selectedEquipment ? `【已聚焦設備：${selectedEquipment.name}】` : "";
    label.textContent = `今日 (${todayText}) 設備使用狀況：點選設備方塊可篩選下方甘特圖，點擊空白處可解除篩選。${selectedText}`;
  }

  const selectedId = state.selectedGanttEquipmentId == null
    ? null
    : Number(state.selectedGanttEquipmentId);
  overlay.innerHTML = getFloorplanPlacementsForRender().map((placement) => {
    const equipment = state.equipment.find((item) => Number(item.id) === Number(placement.equipment_id));
    const isSelected = selectedId != null && Number(placement.equipment_id) === selectedId;
    const isDimmed = selectedId != null && !isSelected;
    const labelName = getFloorplanDisplayName(equipment, `Equipment #${placement.equipment_id}`);
    const fullName = equipment?.name || labelName;
    const activeReservation = getEquipmentActiveReservation(placement.equipment_id, today);
    const category = activeReservation ? getRequesterCategory(activeReservation) : null;
    const isCalibration = activeReservation
      && ["校正", "校驗"].includes(String(activeReservation.purpose || "").trim());
    const classes = [
      "floorplan-device",
      `state-${equipment?.status || "available"}`,
      activeReservation ? "is-booked" : "",
      activeReservation && category ? `requester-category-${category.key}` : "",
      isCalibration ? "purpose-calibration" : "",
      isSelected ? "selected active" : "",
      isDimmed ? "is-dimmed" : "",
      isEquipmentDisabled(equipment) ? "is-disabled" : "",
    ].filter(Boolean).join(" ");

    let tooltip = `${fullName}\n狀態: ${statusText[equipment?.status] || "可預約"}`;
    let bookingBadge = "";
    if (activeReservation) {
      const project = escapeHtml(activeReservation.project_name || category?.label || "預約中");
      const requester = escapeHtml(activeReservation.requester_name || "");
      tooltip = `${fullName}\n狀態: 【${category?.label || "預約中"}】\n專案: ${activeReservation.project_name || "未填"}\n申請人: ${requester}\n用途: ${activeReservation.purpose || "一般測試"}`;
      bookingBadge = `<span class="floorplan-booking-badge">${project}</span>`;
    }

    return `
      <button type="button" class="${escapeHtml(classes)}" data-equipment-id="${escapeHtml(placement.equipment_id)}"
        style="left:${escapeHtml(placement.x_percent)}%;top:${escapeHtml(placement.y_percent)}%;width:${escapeHtml(placement.width_percent)}%;height:${escapeHtml(placement.height_percent)}%;"
        aria-pressed="${escapeHtml(isSelected)}" title="${escapeHtml(tooltip)}">
        <span class="state-dot" aria-hidden="true"></span>
        <span class="floorplan-device-label">${escapeHtml(labelName)}</span>
        ${bookingBadge}
      </button>
    `;
  }).join("");

  overlay.querySelectorAll("[data-equipment-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const equipmentId = Number(button.dataset.equipmentId);
      state.selectedGanttEquipmentId = state.selectedGanttEquipmentId === equipmentId ? null : equipmentId;
      syncGanttFloorplanFilterNotice();
      renderGantt();
      renderReservationFloorplan();
    });
  });
}

function renderEquipmentFloorplan() {
  const overlay = document.getElementById("floorplanOverlay");
  const list = document.getElementById("floorplanDeviceList");
  const details = document.getElementById("floorplanSelectionDetails");
  const meta = document.getElementById("floorplanSelectionMeta");
  const message = document.getElementById("floorplanMessage");
  const layoutButton = document.getElementById("floorplanLayoutBtn");
  const saveButton = document.getElementById("floorplanSaveBtn");
  const resetButton = document.getElementById("floorplanResetBtn");
  const selectButton = document.getElementById("floorplanSelectBtn");
  if (!overlay || !list || !details || !meta || !layoutButton || !saveButton || !resetButton || !selectButton) return;

  const placements = getFloorplanPlacementsForRender();
  const canEditLayout = canEditFloorplanLayout();
  if (!getSelectedFloorplanEquipment() && state.equipment.length) {
    state.selectedFloorplanEquipmentId = Number(state.equipment[0].id);
  }
  const selectedEquipment = getSelectedFloorplanEquipment();
  const selectedPlacement = getSelectedFloorplanPlacement();
  layoutButton.hidden = !canEditLayout;
  saveButton.hidden = !canEditLayout;
  resetButton.hidden = !canEditLayout;
  layoutButton.setAttribute("aria-pressed", String(state.floorplanLayoutEnabled));
  layoutButton.textContent = state.floorplanLayoutEnabled ? "結束調整" : "調整位置";
  saveButton.disabled = !canEditLayout || !state.floorplanDirty;
  resetButton.disabled = !canEditLayout || (!state.floorplanDirty && state.savedFloorplanPlacements.length === 0);
  selectButton.hidden = true;
  selectButton.disabled = !selectedEquipment;

  if (message && !message.dataset.persistent) {
    const storageText = state.floorplanStorageMode === "supabase"
      ? "Supabase"
      : state.floorplanStorageMode === "localStorage"
        ? "localStorage"
        : "seed";
    message.textContent = state.floorplanDirty
      ? "尚有未儲存的定位變更。"
      : `目前定位來源: ${storageText}`;
  }

  overlay.innerHTML = placements.map((placement) => {
    const equipment = state.equipment.find((item) => Number(item.id) === Number(placement.equipment_id));
    const selected = Number(placement.equipment_id) === Number(state.selectedFloorplanEquipmentId);
    const labelName = getFloorplanDisplayName(equipment, `Equipment #${placement.equipment_id}`);
    const fullName = equipment?.name || labelName;
    const handles = canEditLayout && state.floorplanLayoutEnabled && selected
      ? ["nw", "ne", "sw", "se"].map((direction) => `<span class="floorplan-resize-handle" data-resize="${direction}"></span>`).join("")
      : "";
    return `
      <button type="button" class="${escapeHtml(getFloorplanDeviceClassName(equipment, { selected }))}"
        data-equipment-id="${escapeHtml(placement.equipment_id)}" data-location-state="${escapeHtml(placement.location_state)}"
        style="left:${escapeHtml(placement.x_percent)}%;top:${escapeHtml(placement.y_percent)}%;width:${escapeHtml(placement.width_percent)}%;height:${escapeHtml(placement.height_percent)}%;"
        aria-pressed="${escapeHtml(selected)}" aria-label="${escapeHtml(`${labelName} / ${fullName}`)}" title="${escapeHtml(fullName)}">
        <span class="state-dot" aria-hidden="true"></span>
        <span class="floorplan-device-label">${escapeHtml(labelName)}</span>
        ${handles}
      </button>
    `;
  }).join("");

  overlay.querySelectorAll("[data-equipment-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFloorplanEquipmentId = Number(button.dataset.equipmentId);
      if (state.floorplanLayoutEnabled) {
        renderEquipmentFloorplan();
        return;
      }
      startEditEquipment(Number(button.dataset.equipmentId));
    });
    button.addEventListener("pointerdown", startFloorplanPointer);
  });
  list.innerHTML = "";

  if (!selectedEquipment || !selectedPlacement) {
    meta.textContent = state.floorplanLayoutEnabled ? "調整位置模式已啟用。" : "點擊平面圖設備方塊即可直接開啟編輯視窗。";
    details.innerHTML = `
      <article class="floorplan-detail-row"><span>目前模式</span><strong>${escapeHtml(state.floorplanLayoutEnabled ? "調整位置" : "編輯設備")}</strong></article>
      <article class="floorplan-detail-row"><span>操作說明</span><strong>${escapeHtml(state.floorplanLayoutEnabled ? "拖曳或縮放方塊後，使用上方按鈕儲存定位。" : "設備資料與位置請在彈窗內調整。")}</strong></article>
    `;
    return;
  }

  meta.textContent = state.floorplanLayoutEnabled
    ? `${selectedEquipment.name} (${selectedEquipment.category || "-"})`
    : "點擊平面圖設備方塊即可直接開啟編輯視窗。";
  details.innerHTML = state.floorplanLayoutEnabled
    ? [
      ["設備", selectedEquipment.name || "-"],
      ["位置", selectedEquipment.location || "-"],
      ["座標", `${selectedPlacement.x_percent.toFixed(2)}%, ${selectedPlacement.y_percent.toFixed(2)}%`],
      ["尺寸", `${selectedPlacement.width_percent.toFixed(2)}% × ${selectedPlacement.height_percent.toFixed(2)}%`],
    ].map(([label, value]) => `<article class="floorplan-detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("")
    : `
      <article class="floorplan-detail-row"><span>目前模式</span><strong>編輯設備</strong></article>
      <article class="floorplan-detail-row"><span>可調整內容</span><strong>狀態、停用、規格、測試條件與定位</strong></article>
    `;
}

function renderDisabledEquipmentList() {
  const section = document.getElementById("disabledEquipmentSection");
  const root = document.getElementById("disabledEquipmentList");
  const count = document.getElementById("disabledEquipmentCount");
  if (!section || !root) return;

  const disabledEquipment = state.equipment.filter((item) => isEquipmentDisabled(item));
  section.hidden = disabledEquipment.length === 0;
  if (count) count.textContent = disabledEquipment.length ? `${disabledEquipment.length} 台` : "";
  if (!disabledEquipment.length) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = disabledEquipment.map((item) => {
    const view = getEquipmentViewModel(item);
    const labelName = getFloorplanDisplayName(item, view.name);
    return `
      <article class="disabled-equipment-row">
        <div class="disabled-equipment-copy"><strong>${escapeHtml(view.name)}</strong><span>${escapeHtml(labelName)} · ${escapeHtml(view.category)} · ${escapeHtml(view.statusLabel)}</span></div>
        <button type="button" class="secondary" data-edit-disabled-equipment="${escapeHtml(view.id)}">編輯</button>
      </article>
    `;
  }).join("");
  root.querySelectorAll("[data-edit-disabled-equipment]").forEach((button) => {
    button.addEventListener("click", () => startEditEquipment(Number(button.dataset.editDisabledEquipment)));
  });
}

function toggleFloorplanLayoutMode() {
  if (!canEditFloorplanLayout()) return;
  state.floorplanLayoutEnabled = !state.floorplanLayoutEnabled;
  renderEquipmentFloorplan();
}

function focusSelectedFloorplanDevice() {
  const selected = document.querySelector(`#floorplanOverlay [data-equipment-id="${state.selectedFloorplanEquipmentId}"]`);
  selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
  selected?.focus();
}

function resetFloorplanLayout() {
  state.floorplanPlacements = clonePlacements(state.savedFloorplanPlacements);
  state.floorplanDirty = false;
  const message = document.getElementById("floorplanMessage");
  if (message) {
    message.dataset.persistent = "";
    message.textContent = "";
  }
  renderEquipmentFloorplan();
}

function findFloorplanPlacementIndex(equipmentId) {
  return state.floorplanPlacements.findIndex((item) => Number(item.equipment_id) === Number(equipmentId));
}

function upsertFloorplanPlacement(nextPlacement) {
  const normalized = normalizeFloorplanPlacement(nextPlacement, findFloorplanPlacementIndex(nextPlacement.equipment_id));
  const index = findFloorplanPlacementIndex(normalized.equipment_id);
  if (index >= 0) {
    state.floorplanPlacements[index] = { ...state.floorplanPlacements[index], ...normalized };
  } else {
    state.floorplanPlacements.push(normalized);
  }
}

function startFloorplanPointer(event) {
  if (!canEditFloorplanLayout() || !state.floorplanLayoutEnabled) return;
  const device = event.currentTarget;
  const canvas = document.getElementById("floorplanCanvas");
  const equipmentId = Number(device.dataset.equipmentId);
  const placement = getFloorplanPlacementsForRender().find((item) => Number(item.equipment_id) === equipmentId);
  if (!placement || !canvas) return;
  const resizeDirection = event.target?.dataset?.resize || "";
  state.selectedFloorplanEquipmentId = equipmentId;
  state.floorplanPointer = {
    equipmentId,
    mode: resizeDirection ? "resize" : "drag",
    direction: resizeDirection,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    bounds: canvas.getBoundingClientRect(),
    placement: { ...placement },
  };
  event.preventDefault();
  renderEquipmentFloorplan();
}

function handleFloorplanPointerMove(event) {
  const pointer = state.floorplanPointer;
  if (!pointer || pointer.pointerId !== event.pointerId) return;
  const dxPercent = ((event.clientX - pointer.startX) / pointer.bounds.width) * 100;
  const dyPercent = ((event.clientY - pointer.startY) / pointer.bounds.height) * 100;
  const next = { ...pointer.placement };
  if (pointer.mode === "drag") {
    next.x_percent = clampNumber(pointer.placement.x_percent + dxPercent, 0, 100 - pointer.placement.width_percent, pointer.placement.x_percent);
    next.y_percent = clampNumber(pointer.placement.y_percent + dyPercent, 0, 100 - pointer.placement.height_percent, pointer.placement.y_percent);
  } else {
    applyFloorplanResize(next, pointer.direction, dxPercent, dyPercent);
  }
  next.location_state = "placed";
  upsertFloorplanPlacement(next);
  state.floorplanDirty = true;
  const message = document.getElementById("floorplanMessage");
  if (message) {
    message.dataset.persistent = "true";
    message.textContent = "尚有未儲存的定位變更。";
  }
  renderEquipmentFloorplan();
}

function applyFloorplanResize(placement, direction, dxPercent, dyPercent) {
  const minSize = 3;
  if (direction.includes("e")) placement.width_percent = clampNumber(placement.width_percent + dxPercent, minSize, 100 - placement.x_percent, placement.width_percent);
  if (direction.includes("s")) placement.height_percent = clampNumber(placement.height_percent + dyPercent, minSize, 100 - placement.y_percent, placement.height_percent);
  if (direction.includes("w")) {
    const nextX = clampNumber(placement.x_percent + dxPercent, 0, placement.x_percent + placement.width_percent - minSize, placement.x_percent);
    placement.width_percent += placement.x_percent - nextX;
    placement.x_percent = nextX;
  }
  if (direction.includes("n")) {
    const nextY = clampNumber(placement.y_percent + dyPercent, 0, placement.y_percent + placement.height_percent - minSize, placement.y_percent);
    placement.height_percent += placement.y_percent - nextY;
    placement.y_percent = nextY;
  }
}

function stopFloorplanPointer(event) {
  if (!state.floorplanPointer || state.floorplanPointer.pointerId !== event.pointerId) return;
  state.floorplanPointer = null;
}

async function saveFloorplanLayout() {
  if (!canEditFloorplanLayout()) return;
  const message = document.getElementById("floorplanMessage");
  const visiblePlacements = getFloorplanPlacementsForRender().map((item, index) => normalizeFloorplanPlacement({
    equipment_id: Number(item.equipment_id),
    x_percent: Number(item.x_percent.toFixed(2)),
    y_percent: Number(item.y_percent.toFixed(2)),
    width_percent: Number(item.width_percent.toFixed(2)),
    height_percent: Number(item.height_percent.toFixed(2)),
    location_state: item.location_state || "placed",
  }, index));
  const disabledIds = new Set(
    state.equipment.filter((item) => isEquipmentDisabled(item)).map((item) => Number(item.id)),
  );
  const preservedDisabledPlacements = clonePlacements(state.floorplanPlacements)
    .filter((item) => disabledIds.has(Number(item.equipment_id)));
  const placements = clonePlacements([...visiblePlacements, ...preservedDisabledPlacements])
    .sort((left, right) => Number(left.equipment_id) - Number(right.equipment_id));

  const persistLocal = (text) => {
    writeFloorplanPlacementsToLocalStorage(placements);
    setFloorplanPlacementsState(placements, "localStorage");
    if (message) {
      message.dataset.persistent = "true";
      message.textContent = text;
    }
    renderEquipmentFloorplan();
  };
  if (!state.client) {
    persistLocal(`已儲存 ${placements.length} 筆設備定位到 localStorage。`);
    return;
  }
  try {
    const { data, error } = await state.client
      .from("equipment_floorplan_placements")
      .upsert(placements, { onConflict: "equipment_id" })
      .select("equipment_id, x_percent, y_percent, width_percent, height_percent, location_state")
      .order("equipment_id", { ascending: true });
    if (error) throw error;
    const saved = (data || placements).map((item, index) => normalizeFloorplanPlacement(item, index));
    writeFloorplanPlacementsToLocalStorage(saved);
    setFloorplanPlacementsState(saved, "supabase");
    if (message) {
      message.dataset.persistent = "true";
      message.textContent = `已儲存 ${saved.length} 筆設備定位。`;
    }
    renderEquipmentFloorplan();
  } catch (error) {
    console.warn("Floorplan save failed, falling back to localStorage", error);
    persistLocal(`Supabase 儲存失敗，已改存 localStorage: ${error.message}`);
  }
}

function getEquipmentDraftPlacement() {
  const draftEquipmentId = Number(state.equipmentDraftEquipmentId);
  if (!Number.isFinite(draftEquipmentId)) return null;
  const placements = state.equipmentDraftPlacements.length
    ? state.equipmentDraftPlacements
    : getAllFloorplanPlacementsForRender();
  const existing = placements.find((item) => Number(item.equipment_id) === draftEquipmentId);
  if (existing) return normalizeFloorplanPlacement(existing, findFloorplanPlacementIndex(draftEquipmentId));
  const equipment = state.equipment.find((item) => Number(item.id) === Number(state.editingEquipmentId)) || { id: draftEquipmentId };
  const index = state.editingEquipmentId == null
    ? state.equipment.length
    : state.equipment.findIndex((item) => Number(item.id) === Number(state.editingEquipmentId));
  return getDefaultFloorplanPlacement(equipment, Math.max(index, 0));
}

function getEquipmentEditorDraftViewModel() {
  const form = document.getElementById("equipmentForm");
  const equipment = state.equipment.find((item) => Number(item.id) === Number(state.editingEquipmentId));
  const name = String(form?.elements?.name?.value || equipment?.name || "").trim();
  const labelName = String(form?.elements?.label_name?.value || equipment?.label_name || "").trim();
  const status = String(form?.elements?.status?.value || equipment?.status || "available");
  return {
    id: state.equipmentDraftEquipmentId,
    name: name || "New equipment",
    label_name: labelName,
    status,
    isActive: equipment ? isTruthyFlag(equipment.is_active) : true,
  };
}

function upsertEquipmentDraftPlacement(nextPlacement) {
  const normalized = normalizeFloorplanPlacement({
    ...nextPlacement,
    equipment_id: Number(state.equipmentDraftEquipmentId),
  }, 0);
  const retained = state.equipmentDraftPlacements.filter((item) => Number(item.equipment_id) !== Number(normalized.equipment_id));
  state.equipmentDraftPlacements = clonePlacements([...retained, normalized])
    .sort((left, right) => Number(left.equipment_id) - Number(right.equipment_id));
}

function getEquipmentEditorFloorplanPlacements() {
  const draftEquipmentId = Number(state.equipmentDraftEquipmentId);
  const draftPlacement = getEquipmentDraftPlacement();
  const basePlacements = state.equipmentDraftPlacements.length
    ? clonePlacements(state.equipmentDraftPlacements)
    : clonePlacements(getAllFloorplanPlacementsForRender());
  if (!draftPlacement || !Number.isFinite(draftEquipmentId)) return basePlacements;
  const withoutDraft = basePlacements.filter((item) => Number(item.equipment_id) !== draftEquipmentId);
  return clonePlacements([...withoutDraft, { ...draftPlacement, equipment_id: draftEquipmentId }])
    .sort((left, right) => Number(left.equipment_id) - Number(right.equipment_id));
}

function renderEquipmentEditorFloorplan() {
  const overlay = document.getElementById("equipmentDialogFloorplanOverlay");
  const meta = document.getElementById("equipmentDialogPlacementMeta");
  if (!overlay || !meta) return;
  const equipment = getEquipmentEditorDraftViewModel();
  const placement = getEquipmentDraftPlacement();
  const allPlacements = getEquipmentEditorFloorplanPlacements();
  const placements = allPlacements.filter((item) => {
    const isSelected = Number(item.equipment_id) === Number(state.equipmentDraftEquipmentId);
    const referenceEquipment = isSelected
      ? equipment
      : state.equipment.find((candidate) => Number(candidate.id) === Number(item.equipment_id));
    return !isEquipmentDisabled(referenceEquipment);
  });
  if (!state.equipmentDialogOpen || !equipment || !placement) {
    overlay.innerHTML = "";
    meta.textContent = "尚未選取設備草稿定位。";
    return;
  }
  overlay.innerHTML = placements.map((item) => {
    const isSelected = Number(item.equipment_id) === Number(state.equipmentDraftEquipmentId);
    const referenceEquipment = isSelected
      ? equipment
      : state.equipment.find((candidate) => Number(candidate.id) === Number(item.equipment_id)) || { id: item.equipment_id };
    const labelName = getFloorplanDisplayName(referenceEquipment, `Equipment #${item.equipment_id}`);
    const fullName = referenceEquipment.name || labelName;
    const isEditable = isSelected && !state.equipmentDialogReadOnly;
    const handles = isEditable
      ? ["nw", "ne", "sw", "se"].map((direction) => `<span class="floorplan-resize-handle" data-resize="${direction}"></span>`).join("")
      : "";
    const deviceClass = [
      getFloorplanDeviceClassName(referenceEquipment, { selected: isSelected, editing: isEditable }),
      isSelected ? "is-target-device active" : "is-locked is-dimmed-other",
    ].filter(Boolean).join(" ");
    return `
      <button type="button" class="${escapeHtml(deviceClass)}"
        data-equipment-id="${escapeHtml(item.equipment_id)}" data-location-state="${escapeHtml(item.location_state)}" data-editable="${escapeHtml(String(isEditable))}"
        style="left:${escapeHtml(item.x_percent)}%;top:${escapeHtml(item.y_percent)}%;width:${escapeHtml(item.width_percent)}%;height:${escapeHtml(item.height_percent)}%;"
        aria-pressed="${escapeHtml(String(isSelected))}" aria-disabled="${escapeHtml(String(!isEditable))}"
        aria-label="${escapeHtml(`${labelName} / ${fullName}`)}" title="${escapeHtml(fullName)}" tabindex="${escapeHtml(isSelected ? "0" : "-1")}">
        <span class="state-dot" aria-hidden="true"></span><span class="floorplan-device-label">${escapeHtml(labelName)}</span>${handles}
      </button>
    `;
  }).join("");
  meta.textContent = isEquipmentDisabled(equipment)
    ? `${equipment.name || "-"} 目前為停用，不顯示於平面圖；恢復狀態後會沿用此定位。`
    : `${equipment.name || "-"}: ${placement.x_percent.toFixed(2)}%, ${placement.y_percent.toFixed(2)}% / ${placement.width_percent.toFixed(2)}% × ${placement.height_percent.toFixed(2)}%`;
  if (!state.equipmentDialogReadOnly) {
    overlay.querySelector('[data-editable="true"]')?.addEventListener("pointerdown", startEquipmentDraftPointer);
  }
}

function startEquipmentDraftPointer(event) {
  if (!state.equipmentDialogOpen || state.equipmentDialogReadOnly || event.currentTarget?.dataset?.editable !== "true") return;
  const canvas = document.getElementById("equipmentDialogFloorplanCanvas");
  const placement = getEquipmentDraftPlacement();
  if (!canvas || !placement) return;
  const resizeDirection = event.target?.dataset?.resize || "";
  state.equipmentDraftPointer = {
    mode: resizeDirection ? "resize" : "drag",
    direction: resizeDirection,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    bounds: canvas.getBoundingClientRect(),
    placement: { ...placement },
  };
  event.preventDefault();
}

function handleEquipmentDraftPointerMove(event) {
  const pointer = state.equipmentDraftPointer;
  if (!pointer || pointer.pointerId !== event.pointerId) return;
  const dxPercent = ((event.clientX - pointer.startX) / pointer.bounds.width) * 100;
  const dyPercent = ((event.clientY - pointer.startY) / pointer.bounds.height) * 100;
  const next = { ...pointer.placement };
  if (pointer.mode === "drag") {
    next.x_percent = clampNumber(pointer.placement.x_percent + dxPercent, 0, 100 - pointer.placement.width_percent, pointer.placement.x_percent);
    next.y_percent = clampNumber(pointer.placement.y_percent + dyPercent, 0, 100 - pointer.placement.height_percent, pointer.placement.y_percent);
  } else {
    applyFloorplanResize(next, pointer.direction, dxPercent, dyPercent);
  }
  next.location_state = "placed";
  upsertEquipmentDraftPlacement(next);
  renderEquipmentEditorFloorplan();
}

function stopEquipmentDraftPointer(event) {
  if (!state.equipmentDraftPointer || state.equipmentDraftPointer.pointerId !== event.pointerId) return;
  state.equipmentDraftPointer = null;
}

function handleEquipmentDialogCancel(event) {
  event.preventDefault();
  cancelEquipmentEdit();
}

function handleEquipmentDialogClose() {
  state.equipmentDialogOpen = false;
  state.equipmentDialogSaved = false;
  state.equipmentDialogReadOnly = false;
  state.editingEquipmentId = null;
  state.equipmentFormDirty = false;
  state.equipmentDraftEquipmentId = null;
  state.equipmentDraftPlacements = [];
  state.equipmentDraftPointer = null;
  syncEquipmentForm();
}

async function saveEquipmentDraftPlacement(savedEquipmentId) {
  const draftPlacement = getEquipmentDraftPlacement();
  if (!draftPlacement || !savedEquipmentId) return;
  const committedPlacement = normalizeFloorplanPlacement({
    ...draftPlacement,
    equipment_id: Number(savedEquipmentId),
    location_state: draftPlacement.location_state || "placed",
  }, findFloorplanPlacementIndex(savedEquipmentId));
  const mergedPlacements = clonePlacements([
    ...state.floorplanPlacements.filter((item) => Number(item.equipment_id) !== Number(savedEquipmentId)),
    committedPlacement,
  ]).sort((left, right) => Number(left.equipment_id) - Number(right.equipment_id));
  const persistLocal = () => {
    writeFloorplanPlacementsToLocalStorage(mergedPlacements);
    setFloorplanPlacementsState(mergedPlacements, "localStorage");
  };
  if (!state.client) {
    persistLocal();
    return;
  }
  try {
    const { data, error } = await state.client
      .from("equipment_floorplan_placements")
      .upsert([committedPlacement], { onConflict: "equipment_id" })
      .select("equipment_id, x_percent, y_percent, width_percent, height_percent, location_state");
    if (error) throw error;
    const savedPlacement = normalizeFloorplanPlacement((data && data[0]) || committedPlacement, findFloorplanPlacementIndex(savedEquipmentId));
    const savedPlacements = clonePlacements([
      ...state.floorplanPlacements.filter((item) => Number(item.equipment_id) !== Number(savedEquipmentId)),
      savedPlacement,
    ]).sort((left, right) => Number(left.equipment_id) - Number(right.equipment_id));
    writeFloorplanPlacementsToLocalStorage(savedPlacements);
    setFloorplanPlacementsState(savedPlacements, "supabase");
  } catch (error) {
    console.warn("Equipment dialog placement save failed, falling back to localStorage", error);
    persistLocal();
  }
}

/* --------------------------------------------------------------------------
   設備稼動率統計與 Excel 匯出 (Equipment Utilization Analytics)
   -------------------------------------------------------------------------- */

function toISODateString(date) {
  const d = new Date(date);
  const pad = (value) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getPresetDateRange(preset) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  if (preset === "this-month") {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return { start: toISODateString(start), end: toISODateString(end) };
  }
  if (preset === "last-month") {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return { start: toISODateString(start), end: toISODateString(end) };
  }
  if (preset === "this-week") {
    const currentDay = now.getDay();
    const distanceToMonday = (currentDay + 6) % 7;
    const start = new Date(year, month, day - distanceToMonday);
    const end = new Date(year, month, day - distanceToMonday + 6);
    return { start: toISODateString(start), end: toISODateString(end) };
  }
  if (preset === "last-30") {
    const start = new Date(year, month, day - 29);
    const end = new Date(year, month, day);
    return { start: toISODateString(start), end: toISODateString(end) };
  }
  if (preset === "last-90") {
    const start = new Date(year, month, day - 89);
    const end = new Date(year, month, day);
    return { start: toISODateString(start), end: toISODateString(end) };
  }
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return { start: toISODateString(start), end: toISODateString(end) };
}

function calculateEquipmentUtilization(startDateStr, endDateStr, options = {}) {
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDateStr);
  end.setHours(23, 59, 59, 999);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return null;
  }

  const days = [];
  let cur = new Date(start);
  while (cur <= end) {
    const dayStart = new Date(cur);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(cur);
    dayEnd.setHours(23, 59, 59, 999);
    days.push({
      dateStr: toISODateString(dayStart),
      startTime: dayStart.getTime(),
      endTime: dayEnd.getTime(),
    });
    cur.setDate(cur.getDate() + 1);
  }
  const totalDays = days.length;

  const validReservations = state.reservations.filter((r) => {
    const status = getEffectiveReservationStatus(r);
    if (status === "cancelled") return false;
    const rStart = new Date(r.start_time).getTime();
    const rEnd = new Date(r.end_time).getTime();
    return Number.isFinite(rStart) && Number.isFinite(rEnd) && rStart <= end.getTime() && rEnd >= start.getTime();
  });

  const candidateEquipment = (options.equipmentId && options.equipmentId !== "all")
    ? state.equipment.filter((eq) => String(eq.id) === String(options.equipmentId))
    : state.equipment;

  // 啟用中設備一律納入統計；停用設備若在選定區間內有專案紀錄（結案或進行中）則保留，無紀錄則不顯示
  const targetEquipment = candidateEquipment.filter((eq) => {
    if (!isEquipmentDisabled(eq)) {
      return true;
    }
    return validReservations.some((r) => Number(r.equipment_id) === Number(eq.id));
  });

  const equipmentStats = targetEquipment.map((eq) => {
    const eqReservations = validReservations.filter((r) => Number(r.equipment_id) === Number(eq.id));
    
    let activeDaysCount = 0;
    let cumulativeProjectDays = 0;

    days.forEach((day) => {
      const dayReservations = eqReservations.filter((r) => {
        const rStart = new Date(r.start_time).getTime();
        const rEnd = new Date(r.end_time).getTime();
        return rStart <= day.endTime && rEnd >= day.startTime;
      });

      const count = dayReservations.length;
      if (count > 0) {
        activeDaysCount += 1;
        cumulativeProjectDays += count;
      }
    });

    const baseRate = totalDays > 0 ? (activeDaysCount / totalDays) * 100 : 0;
    const weightedRate = totalDays > 0 ? (cumulativeProjectDays / totalDays) * 100 : 0;

    return {
      equipment: eq,
      totalDays,
      activeDays: activeDaysCount,
      baseRate,
      cumulativeProjectDays,
      weightedRate,
      projectCount: eqReservations.length,
    };
  });

  const totalActiveDays = equipmentStats.reduce((sum, item) => sum + item.activeDays, 0);
  const totalCumulativeDays = equipmentStats.reduce((sum, item) => sum + item.cumulativeProjectDays, 0);
  const totalProjectCount = new Set(
    validReservations
      .filter((r) => targetEquipment.some((eq) => Number(eq.id) === Number(r.equipment_id)))
      .map((r) => r.id)
  ).size;

  const totalCapacityDays = equipmentStats.length * totalDays;
  const avgBaseRate = totalCapacityDays > 0 ? (totalActiveDays / totalCapacityDays) * 100 : 0;
  const avgWeightedRate = totalCapacityDays > 0 ? (totalCumulativeDays / totalCapacityDays) * 100 : 0;

  return {
    startDate: toISODateString(start),
    endDate: toISODateString(end),
    totalDays,
    equipmentStats,
    summary: {
      avgBaseRate,
      avgWeightedRate,
      totalActiveDays,
      totalCumulativeDays,
      totalProjects: totalProjectCount,
      equipmentCount: equipmentStats.length,
    },
  };
}

function renderAnalyticsEquipmentOptions() {
  const select = document.getElementById("analyticsEquipmentSelect");
  if (!select) return;
  const previousValue = select.value || "all";
  select.innerHTML = '<option value="all">全部設備 (所有機台)</option>';
  
  state.equipment.forEach((eq) => {
    const opt = document.createElement("option");
    opt.value = String(eq.id);
    opt.textContent = `${eq.name} (${eq.category || "未分類"})${isEquipmentDisabled(eq) ? " [停用]" : ""}`;
    select.appendChild(opt);
  });
  
  if (state.equipment.some((eq) => String(eq.id) === previousValue)) {
    select.value = previousValue;
  } else {
    select.value = "all";
  }
}

function renderUtilizationAnalytics() {
  const startInput = document.getElementById("analyticsStartDate");
  const endInput = document.getElementById("analyticsEndDate");
  const select = document.getElementById("analyticsEquipmentSelect");
  if (!startInput || !endInput) return;

  if (!startInput.value || !endInput.value) {
    const defaultRange = getPresetDateRange(state.analyticsPreset || "this-month");
    startInput.value = defaultRange.start;
    endInput.value = defaultRange.end;
  }

  const equipmentId = select ? select.value : "all";
  const data = calculateEquipmentUtilization(startInput.value, endInput.value, { equipmentId });
  if (!data) return;

  state.analyticsData = data;

  // Render KPI Summary Cards
  const periodDaysEl = document.getElementById("analyticsPeriodDays");
  const periodRangeTextEl = document.getElementById("analyticsPeriodRangeText");
  const avgBaseRateEl = document.getElementById("analyticsAvgBaseRate");
  const avgWeightedRateEl = document.getElementById("analyticsAvgWeightedRate");
  const totalProjectsEl = document.getElementById("analyticsTotalProjects");

  if (periodDaysEl) periodDaysEl.textContent = `${data.totalDays} 天`;
  if (periodRangeTextEl) periodRangeTextEl.textContent = `${data.startDate} 至 ${data.endDate}`;
  if (avgBaseRateEl) avgBaseRateEl.textContent = `${data.summary.avgBaseRate.toFixed(1)}%`;
  if (avgWeightedRateEl) avgWeightedRateEl.textContent = `${data.summary.avgWeightedRate.toFixed(1)}%`;
  if (totalProjectsEl) totalProjectsEl.textContent = `${data.summary.totalProjects} 筆`;

  // Render Equipment Table
  const tbody = document.getElementById("analyticsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (data.equipmentStats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="table-empty">查無設備資料</td></tr>';
    return;
  }

  data.equipmentStats.forEach((stat) => {
    const tr = document.createElement("tr");
    const eq = stat.equipment;
    const isDisabled = isEquipmentDisabled(eq);

    let weightedBadgeClass = "normal";
    if (stat.weightedRate > 150) {
      weightedBadgeClass = "heavy";
    } else if (stat.weightedRate > 100) {
      weightedBadgeClass = "highlight";
    }

    let progressFillClass = "";
    if (stat.baseRate >= 100) {
      progressFillClass = "full";
    } else if (stat.baseRate >= 70) {
      progressFillClass = "high";
    }

    const statusBadge = isDisabled
      ? '<span class="status-badge state-offline">停用</span>'
      : (eq.status === "validation"
          ? '<span class="status-badge state-validation">驗證中</span>'
          : (eq.status === "maintenance"
              ? '<span class="status-badge state-maintenance">維修中</span>'
              : '<span class="status-badge state-available">可預約</span>'));

    tr.innerHTML = `
      <td><strong>${escapeHtml(eq.name)}</strong></td>
      <td><span class="category-tag">${escapeHtml(eq.category || "--")}</span></td>
      <td class="center">${escapeHtml(String(eq.capacity || "1"))}</td>
      <td class="center">${stat.totalDays} 天</td>
      <td class="center"><strong>${stat.activeDays}</strong> 天</td>
      <td>
        <div class="rate-cell-group">
          <span class="rate-percentage">${stat.baseRate.toFixed(1)}%</span>
          <div class="rate-progress-bar" title="基礎稼動率：${stat.baseRate.toFixed(1)}%">
            <div class="rate-progress-fill ${progressFillClass}" style="width: ${Math.min(stat.baseRate, 100)}%;"></div>
          </div>
        </div>
      </td>
      <td class="center"><strong>${stat.cumulativeProjectDays}</strong> 天</td>
      <td class="center">
        <span class="weighted-rate-badge ${weightedBadgeClass}" title="加權重複稼動率：${stat.weightedRate.toFixed(1)}%">
          ${stat.weightedRate.toFixed(1)}%
        </span>
      </td>
      <td class="center">${stat.projectCount} 筆</td>
      <td class="center">${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}

function exportUtilizationToExcel() {
  const data = state.analyticsData;
  if (!data || !data.equipmentStats || data.equipmentStats.length === 0) {
    alert("目前沒有可匯出的稼動率數據，請先選擇日期區間並計算。");
    return;
  }

  const generatedTime = new Date().toLocaleString("zh-TW");
  const filename = `設備稼動率統計報表_${data.startDate.replaceAll("-", "")}_${data.endDate.replaceAll("-", "")}.xlsx`;

  if (typeof XLSX !== "undefined") {
    const wsData = [
      ["可靠度實驗室設備稼動率統計報表"],
      [`統計區間：${data.startDate} 至 ${data.endDate}（共 ${data.totalDays} 天） | 產表時間：${generatedTime}`],
      [`可靠度設備平均基礎稼動率：${data.summary.avgBaseRate.toFixed(1)}% | 可靠度設備平均重複加權稼動率：${data.summary.avgWeightedRate.toFixed(1)}% | 納入統計專案數：${data.summary.totalProjects} 筆 | 設備總數：${data.summary.equipmentCount} 台`],
      [],
      [
        "設備名稱",
        "類別",
        "可重疊預約量",
        "統計天數",
        "基礎稼動天數",
        "基礎稼動率",
        "專案累計天數",
        "重複加權稼動率",
        "專案總筆數",
        "設備狀態"
      ]
    ];

    data.equipmentStats.forEach((stat) => {
      const eq = stat.equipment;
      const statusText = isEquipmentDisabled(eq)
        ? "停用"
        : (eq.status === "validation" ? "驗證中" : (eq.status === "maintenance" ? "維修中" : "可預約"));

      wsData.push([
        eq.name,
        eq.category || "",
        String(eq.capacity || "1"),
        stat.totalDays,
        stat.activeDays,
        { t: "n", v: Number((stat.baseRate / 100).toFixed(4)), z: "0.0%" },
        stat.cumulativeProjectDays,
        { t: "n", v: Number((stat.weightedRate / 100).toFixed(4)), z: "0.0%" },
        stat.projectCount,
        statusText
      ]);
    });

    wsData.push([
      "總計 / 可靠度設備平均",
      "",
      "",
      data.totalDays,
      data.summary.totalActiveDays,
      { t: "n", v: Number((data.summary.avgBaseRate / 100).toFixed(4)), z: "0.0%" },
      data.summary.totalCumulativeDays,
      { t: "n", v: Number((data.summary.avgWeightedRate / 100).toFixed(4)), z: "0.0%" },
      data.summary.totalProjects,
      "--"
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 22 },
      { wch: 12 },
      { wch: 14 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 12 },
      { wch: 12 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "設備稼動率統計");
    XLSX.writeFile(wb, filename);
    return;
  }

  // Fallback if XLSX library is not loaded
  let csv = "\ufeff";
  csv += `可靠度實驗室設備稼動率統計報表\n`;
  csv += `統計區間：${data.startDate} 至 ${data.endDate}（共 ${data.totalDays} 天） | 產表時間：${generatedTime}\n`;
  csv += `可靠度設備平均基礎稼動率：${data.summary.avgBaseRate.toFixed(1)}% | 可靠度設備平均重複加權稼動率：${data.summary.avgWeightedRate.toFixed(1)}% | 納入統計專案數：${data.summary.totalProjects} 筆 | 設備總數：${data.summary.equipmentCount} 台\n\n`;
  csv += `設備名稱,類別,可重疊預約量,統計天數,基礎稼動天數,基礎稼動率,專案累計天數,重複加權稼動率,專案總筆數,設備狀態\n`;
  data.equipmentStats.forEach((stat) => {
    const eq = stat.equipment;
    const statusText = isEquipmentDisabled(eq)
      ? "停用"
      : (eq.status === "validation" ? "驗證中" : (eq.status === "maintenance" ? "維修中" : "可預約"));
    csv += `"${eq.name}","${eq.category || ""}","${eq.capacity || "1"}",${stat.totalDays},${stat.activeDays},${stat.baseRate.toFixed(1)}%,${stat.cumulativeProjectDays},${stat.weightedRate.toFixed(1)}%,${stat.projectCount},"${statusText}"\n`;
  });
  csv += `"總計 / 可靠度設備平均","","",${data.totalDays},${data.summary.totalActiveDays},${data.summary.avgBaseRate.toFixed(1)}%,${data.summary.totalCumulativeDays},${data.summary.avgWeightedRate.toFixed(1)}%,${data.summary.totalProjects},"--"\n`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/\.xlsx$/, ".csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
