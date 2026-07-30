const SUPABASE_URL = "https://sbqqylrnjfrrqwrdiiun.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNicXF5bHJuamZycnF3cmRpaXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5Mzg1MTEsImV4cCI6MjA5ODUxNDUxMX0.DlOsiff8VpyBNB1BrvnR8ny6b0CXwziM6ZqaHDcHz0Y";

const AUTO_REFRESH_MS = 60000;

const state = {
  client: null,
  config: null,
  equipment: [],
  reservations: [],
  requesters: [],
  weekStart: startOfWeek(new Date()),
  activeView: "reservation",
  editingEquipmentId: null,
  editingRequesterId: null,
  equipmentFormDirty: false,
  equipmentSpecSupported: true,
  requesterFormDirty: false,
  requesterEmailAutofillValue: "",
  requesterSuggestions: {
    requester_name: [],
    requester_email: [],
  },
  bulletinScroll: {
    intervalSeconds: 30,
    durationSeconds: 6,
    timerId: null,
    direction: "down",
  },
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

const dayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

document.addEventListener("DOMContentLoaded", async () => {
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
  document.getElementById("prevWeek").addEventListener("click", () => moveWeek(-7));
  document.getElementById("nextWeek").addEventListener("click", () => moveWeek(7));
  document.getElementById("bulletinPrevWeek").addEventListener("click", () => moveWeek(-7));
  document.getElementById("bulletinNextWeek").addEventListener("click", () => moveWeek(7));
  document.getElementById("bulletinFullscreenBtn").addEventListener("click", openBulletinFullscreen);
  document.getElementById("openBulletinWindowBtn").addEventListener("click", openBulletinWindow);
  document.getElementById("bulletinScrollInterval").addEventListener("change", updateBulletinScrollSettings);
  document.getElementById("bulletinScrollDuration").addEventListener("change", updateBulletinScrollSettings);
  window.addEventListener("resize", () => scheduleBulletinAutoScroll({ resetPosition: false }));
  document.addEventListener("fullscreenchange", () => {
    window.setTimeout(() => scheduleBulletinAutoScroll({ resetPosition: false }), 0);
  });

  document.getElementById("reservationForm").addEventListener("submit", submitReservation);
  document.querySelector("#reservationForm select[name='equipment_id']").addEventListener("change", syncReservationEquipmentState);

  document.getElementById("equipmentForm").addEventListener("submit", submitEquipment);
  document.getElementById("equipmentForm").addEventListener("input", markEquipmentFormDirty);
  document.getElementById("equipmentCancelBtn").addEventListener("click", cancelEquipmentEdit);
  document.getElementById("equipmentResetBtn").addEventListener("click", resetEquipmentForm);

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

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.viewTarget));
  });
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
  const equipmentSelect = "id, name, category, location, status, capacity, is_active, requires_test_condition";
  let { data, error } = await state.client
    .from("equipment")
    .select("id, name, category, location, status, capacity, equipment_spec, is_active, requires_test_condition")
    .order("is_active", { ascending: false })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error && /equipment_spec.*does not exist/i.test(error.message || "")) {
    state.equipmentSpecSupported = false;
    ({ data, error } = await state.client
      .from("equipment")
      .select(equipmentSelect)
      .order("is_active", { ascending: false })
      .order("category", { ascending: true })
      .order("name", { ascending: true }));
  } else {
    state.equipmentSpecSupported = !error;
  }

  assertNoError(error, "讀取設備資料失敗");
  state.equipment = (data || []).map((item) => ({ ...item, equipment_spec: item.equipment_spec || "" }));
}

async function loadReservations() {
  const fromIso = dateToIso(state.weekStart);
  const toIso = dateToIso(addDays(state.weekStart, 7));
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
    .lt("start_time", toIso)
    .gt("end_time", fromIso)
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
  renderRequesterSummary();
  renderEquipmentSummary();
  renderGantt();
  renderBulletinBoard();
  renderReservationRows();
  renderViewState();
  renderConnectionState();
  syncEquipmentForm();
  syncRequesterForm();
}

function markEquipmentFormDirty() {
  state.equipmentFormDirty = true;
}

function markRequesterFormDirty() {
  state.requesterFormDirty = true;
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
  const activeReservations = state.reservations.filter((item) => {
    const effectiveStatus = getEffectiveReservationStatus(item);
    return effectiveStatus !== "cancelled" && effectiveStatus !== "checked_out";
  });
  const available = state.equipment.filter((item) => item.status === "available" && item.is_active).length;
  const validation = state.equipment.filter((item) => item.status === "validation" && item.is_active).length;
  const maintenance = state.equipment.filter((item) => item.status === "maintenance" && item.is_active).length;
  const offline = state.equipment.filter((item) => item.status === "offline" || !item.is_active).length;
  const reservedHours = activeReservations.reduce((total, reservation) => {
    const start = new Date(reservation.start_time).getTime();
    const end = new Date(reservation.end_time).getTime();
    return total + Math.max(end - start, 0) / 36e5;
  }, 0);

  const metrics = [
    { label: "設備總數", value: state.equipment.length, hint: `可預約 ${available} 台` },
    { label: "本週預約", value: activeReservations.length, hint: `${reservedHours.toFixed(1)} 小時` },
    { label: "驗證中", value: validation, hint: "狀態追蹤" },
    { label: "維修中", value: maintenance, hint: "維護排程" },
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

function renderEquipmentOptions() {
  const select = document.querySelector("#reservationForm select[name='equipment_id']");
  const previousValue = select.value;
  select.innerHTML = "";

  state.equipment
    .filter((item) => item.is_active && item.status === "available")
    .forEach((item) => {
      const view = getEquipmentViewModel(item);
      const option = document.createElement("option");
      option.value = view.id;
      option.textContent = view.optionText;
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
  return {
    id: equipment.id,
    name: equipment.name || "-",
    category: equipment.category || "-",
    location: equipment.location || "-",
    capacity: equipment.capacity || "-",
    equipmentSpec: equipment.equipment_spec || "未設定",
    status,
    statusLabel,
    isActive: isTruthyFlag(equipment.is_active),
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

function startEditEquipment(equipmentId) {
  state.editingEquipmentId = Number(equipmentId);
  state.equipmentFormDirty = false;
  syncEquipmentForm();
  setActiveView("equipment");
}

function syncEquipmentForm() {
  const form = document.getElementById("equipmentForm");
  const title = document.getElementById("equipmentFormTitle");
  const submitButton = document.getElementById("equipmentSubmitBtn");
  const cancelButton = document.getElementById("equipmentCancelBtn");
  const resetButton = document.getElementById("equipmentResetBtn");
  const message = document.getElementById("equipmentMessage");
  const equipment = state.equipment.find((item) => Number(item.id) === state.editingEquipmentId);

  if (state.equipmentFormDirty) return;

  if (!equipment) {
    title.textContent = "新增/編輯設備資訊";
    submitButton.textContent = "新增設備";
    cancelButton.hidden = true;
    resetButton.textContent = "清空";
    form.elements.equipment_id.value = "";
    form.elements.name.value = "";
    form.elements.category.value = "";
    form.elements.location.value = "";
    form.elements.capacity.value = "";
    form.elements.equipment_spec.value = "";
    form.elements.requires_test_condition.value = "0";
    form.elements.status.value = "available";
    form.elements.is_active.value = "1";
    if (!message.dataset.preserve) {
      message.textContent = "";
    }
    state.equipmentFormDirty = false;
    return;
  }

  title.textContent = `編輯設備資訊：${equipment.name}`;
  submitButton.textContent = "儲存變更";
  cancelButton.hidden = false;
  resetButton.textContent = "回復原值";
  form.elements.equipment_id.value = String(equipment.id);
  form.elements.name.value = equipment.name;
  form.elements.category.value = equipment.category;
  form.elements.location.value = equipment.location || "";
  form.elements.capacity.value = String(equipment.capacity || "");
  form.elements.equipment_spec.value = equipment.equipment_spec || "";
  form.elements.requires_test_condition.value = isTruthyFlag(equipment.requires_test_condition) ? "1" : "0";
  form.elements.status.value = equipment.status;
  form.elements.is_active.value = equipment.is_active ? "1" : "0";
  message.textContent = "";
  state.equipmentFormDirty = false;
}

function resetEquipmentForm() {
  state.equipmentFormDirty = false;
  syncEquipmentForm();
}

function cancelEquipmentEdit() {
  state.editingEquipmentId = null;
  state.equipmentFormDirty = false;
  const message = document.getElementById("equipmentMessage");
  message.dataset.preserve = "";
  message.textContent = "已取消編輯。";
  syncEquipmentForm();
}

function renderGantt() {
  renderGanttSurface({
    scaleId: "ganttScale",
    chartId: "ganttChart",
    labelId: "weekLabel",
    variant: "default",
  });
}

function renderBulletinBoard() {
  renderGanttSurface({
    scaleId: "bulletinScale",
    chartId: "bulletinChart",
    labelId: "bulletinWeekLabel",
    variant: "bulletin",
  });
  const stamp = document.getElementById("bulletinTimestamp");
  stamp.textContent = `更新時間 ${new Date().toLocaleString("zh-TW")}`;
  scheduleBulletinAutoScroll();
}

function renderGanttSurface({ scaleId, chartId, labelId, variant }) {
  const scale = document.getElementById(scaleId);
  const chart = document.getElementById(chartId);
  const labelNode = document.getElementById(labelId);
  if (labelNode) {
    labelNode.textContent = `${formatDate(state.weekStart)} - ${formatDate(addDays(state.weekStart, 6))}`;
  }

  if (!scale || !chart) return;
  scale.innerHTML = `<div class="gantt-equipment-spacer ${variant === "bulletin" ? "bulletin-cell" : ""}">設備</div>`;
  chart.innerHTML = "";

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(state.weekStart, offset);
    const tick = document.createElement("div");
    tick.className = `gantt-day${variant === "bulletin" ? " bulletin-cell" : ""}`;
    tick.textContent = `${dayNames[date.getDay()]} ${formatDate(date)}`;
    scale.appendChild(tick);
  }

  if (!state.equipment.length) {
    chart.innerHTML = '<div class="gantt-placeholder">目前尚無設備資料。</div>';
    return;
  }

  state.equipment.forEach((equipment) => {
    const equipmentView = getEquipmentViewModel(equipment);
    const row = document.createElement("div");
    row.className = `gantt-row${variant === "bulletin" ? " bulletin-row" : ""}`;

    const label = document.createElement("div");
    label.className = `gantt-equipment-label${variant === "bulletin" ? " bulletin-cell" : ""}`;
    label.innerHTML = `
      <button type="button" class="equipment-zoom-btn">${escapeHtml(equipmentView.name)}</button>
      <span>${escapeHtml(equipmentView.labelText)}</span>
    `;
    label.querySelector(".equipment-zoom-btn").addEventListener("click", () => openEquipmentSchedule(equipment));

    const lane = document.createElement("div");
    lane.className = `gantt-lane${variant === "bulletin" ? " bulletin-lane" : ""}`;
    if (equipment.status !== "available" || !equipment.is_active) {
      lane.classList.add("is-limited");
    }

    const reservations = state.reservations.filter((reservation) =>
      Number(reservation.equipment_id) === Number(equipment.id) &&
      reservation.status !== "cancelled"
    );

    const stackedReservations = layoutStackedReservations(reservations);
    const visibleStackedReservations = getVisibleStackedReservations(stackedReservations, variant);
    const laneSummary = getGanttLaneSummary(stackedReservations, visibleStackedReservations);
    const ganttMetrics = variant === "default"
      ? getDefaultGanttMetrics(Math.max(stackedReservations[0]?.stackCount || 1, 1))
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
      const bar = document.createElement("button");
      bar.type = "button";
      const textMode = variant === "default" ? (ganttMetrics?.textMode || "project") : "full";
      bar.className = [
        "gantt-bar",
        variant === "bulletin" ? "bulletin-bar" : "",
        variant === "default" && textMode === "project" ? "project-only" : "",
        variant === "default" && textMode === "project-requester" ? "project-requester" : "",
        view.effectiveStatus === "checked_out" ? "is-complete" : "",
      ].filter(Boolean).join(" ");
      bar.style.cssText = ganttMetrics
        ? `${getGanttBarStyle(stacked.reservation, { gapPx: stacked.fillsToDayEnd ? 0 : 3, visualEndTime: stacked.visualEndTime })} top: ${ganttMetrics.top + stacked.level * (ganttMetrics.barHeight + ganttMetrics.gap)}px; height: ${ganttMetrics.barHeight}px;`
        : getStackedGanttBarStyle(stacked, { variant, compact: true });
      bar.title = view.titleText;
      bar.innerHTML = `
        <strong>${escapeHtml(view.projectName)}</strong>
      `;
      if (variant === "default") {
        bar.innerHTML = getMainGanttBarMarkup(reservation, textMode);
      } else if (variant === "bulletin") {
        bar.innerHTML = getBulletinGanttBarMarkup(reservation);
      }
      bar.addEventListener("click", () => openReservationDetail(reservation));
      lane.appendChild(bar);
    });

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
      empty.textContent = "本週沒有預約";
      lane.appendChild(empty);
    }

    row.appendChild(label);
    row.appendChild(lane);
    chart.appendChild(row);
  });
}

function layoutStackedReservations(reservations) {
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
  applyRightEdgeFill(laidOut);
  return laidOut;
}

function applyRightEdgeFill(stackedReservations) {
  const weekStart = state.weekStart.getTime();
  const weekEnd = addDays(state.weekStart, 7).getTime();
  const groups = new Map();

  stackedReservations.forEach((item) => {
    const start = Math.max(new Date(item.reservation.start_time).getTime(), weekStart);
    const end = Math.min(new Date(item.reservation.end_time).getTime(), weekEnd);
    const dayIndex = Math.min(Math.max(Math.floor((start - weekStart) / 86400000), 0), 6);
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
    const dayEnd = Math.min(weekStart + (group[0].dayIndex + 1) * 86400000, weekEnd);
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
  return stackedReservations.filter((item) => item.level < maxVisibleLevels);
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
  const { gapPx = 0, visualEndTime = null } = options;
  const weekStart = state.weekStart.getTime();
  const weekEnd = addDays(state.weekStart, 7).getTime();
  const reservationStart = new Date(reservation.start_time).getTime();
  const reservationEnd = visualEndTime ? new Date(visualEndTime).getTime() : new Date(reservation.end_time).getTime();
  const clampedStart = Math.max(reservationStart, weekStart);
  const clampedEnd = Math.min(reservationEnd, weekEnd);
  const total = weekEnd - weekStart;
  const left = ((clampedStart - weekStart) / total) * 100;
  const width = Math.max(((clampedEnd - clampedStart) / total) * 100, 1.4);
  if (gapPx > 0) {
    return `left: ${left.toFixed(3)}%; width: calc(${width.toFixed(3)}% - ${gapPx}px);`;
  }
  return `left: ${left.toFixed(3)}%; width: ${width.toFixed(3)}%;`;
}

function getStackedGanttBarStyle(stacked, options = {}) {
  const { variant = "default", zoom = false, compact = false } = options;
  const baseStyle = getGanttBarStyle(stacked.reservation, { visualEndTime: stacked.visualEndTime });
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
    return `<strong>${projectName}</strong>`;
  }

  if (textMode === "project-requester") {
    return `
      <strong>${projectName}</strong>
      <span>${requesterName}</span>
    `;
  }

  return `
    <strong>${projectName}</strong>
    <span>${requesterName}</span>
    <em>${timeRange}</em>
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

function renderEquipmentScheduleDialog(equipment) {
  const equipmentView = getEquipmentViewModel(equipment);
  const title = document.getElementById("equipmentScheduleTitle");
  const subtitle = document.getElementById("equipmentScheduleSubtitle");
  const scale = document.getElementById("equipmentScheduleScale");
  const chart = document.getElementById("equipmentScheduleChart");
  const list = document.getElementById("equipmentScheduleList");
  if (!title || !subtitle || !scale || !chart || !list) return;

  const reservations = state.reservations.filter((reservation) =>
    Number(reservation.equipment_id) === Number(equipment.id) &&
    reservation.status !== "cancelled"
  );
  const stackedReservations = layoutStackedReservations(reservations);
  title.textContent = equipmentView.name || "設備預約放大檢視";
  subtitle.textContent = `${equipmentView.category} / ${formatDate(state.weekStart)} - ${formatDate(addDays(state.weekStart, 6))}`;
  scale.innerHTML = "";
  chart.innerHTML = "";

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(state.weekStart, offset);
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
    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = [
      "gantt-bar",
      "equipment-schedule-bar",
      view.effectiveStatus === "checked_out" ? "is-complete" : "",
    ].filter(Boolean).join(" ");
    bar.style.cssText = getStackedGanttBarStyle(stacked, { zoom: true });
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
    empty.textContent = "本週沒有預約";
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
  const status = document.getElementById("reservationDetailCopyStatus");
  if (!dialog || !title || !subtitle || !body || !copyButton || !completeButton || !status) return;

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
  completeButton.onclick = () => completeReservation(reservation);
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

  const isReadOnly = getEffectiveReservationStatus(reservation) === "checked_out";
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

  if (getEffectiveReservationStatus(reservation) === "checked_out") {
    message.textContent = "已完成的預約只能瀏覽，不能再修改。";
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
  rows.innerHTML = "";

  if (!state.reservations.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="6" class="muted">本週尚無預約資料。</td>';
    rows.appendChild(tr);
    return;
  }

  state.reservations.forEach((reservation) => {
    const view = getReservationViewModel(reservation);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(view.equipmentName)}</td>
      <td>${escapeHtml(view.startText)}<br>${escapeHtml(view.endText)}</td>
      <td>${escapeHtml(view.requesterName)}<br><span class="muted">${escapeHtml(view.department)}</span></td>
      <td>${escapeHtml(view.projectName)}<br><span class="muted">${escapeHtml(view.purpose)}</span></td>
      <td><span class="badge ${escapeHtml(view.effectiveStatus)}">${escapeHtml(view.statusLabel)}</span></td>
      <td class="row-actions"></td>
    `;

    const actions = tr.querySelector(".row-actions");
    if (canCompleteReservation(reservation)) {
      const complete = document.createElement("button");
      complete.className = "secondary small-action";
      complete.type = "button";
      complete.textContent = "完成";
      complete.addEventListener("click", () => completeReservation(reservation));
      actions.appendChild(complete);
    }

    if (reservation.status !== "cancelled" && getEffectiveReservationStatus(reservation) !== "checked_out") {
      const cancel = document.createElement("button");
      cancel.className = "danger-link";
      cancel.type = "button";
      cancel.textContent = "取消";
      cancel.addEventListener("click", () => cancelReservation(reservation));
      actions.appendChild(cancel);
    }

    rows.appendChild(tr);
  });
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
    if (!equipment || !equipment.is_active || equipment.status !== "available") {
      throw new Error("目前設備狀態不可預約。");
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

  const row = {
    name: String(payload.name || "").trim(),
    category: String(payload.category || "").trim(),
    location: String(payload.location || "").trim(),
    capacity: String(payload.capacity || "").trim(),
    equipment_spec: String(payload.equipment_spec || "").trim(),
    requires_test_condition: String(payload.requires_test_condition || "0") === "1",
    status: String(payload.status || "available"),
    is_active: String(payload.is_active || "1") === "1",
  };

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
    if (equipmentId) {
      const { error } = await state.client
        .from("equipment")
        .update(row)
        .eq("id", equipmentId);
      assertNoError(error, "更新設備失敗");
      message.textContent = "設備資料已更新。";
      state.editingEquipmentId = equipmentId;
    } else {
      const { data, error } = await state.client
        .from("equipment")
        .insert(row)
        .select()
        .single();
      assertNoError(error, "新增設備失敗");
      message.textContent = "設備已新增。";
      state.editingEquipmentId = Number(data.id);
    }

    state.equipmentFormDirty = false;
    message.dataset.preserve = "true";
    await loadEquipment();
    renderAll();
    message.dataset.preserve = "";
    if (!state.equipmentSpecSupported && payload.equipment_spec) {
      message.textContent = "設備規格欄位尚未建立；請先執行 Supabase SQL，其他設備資料已更新。";
    }
  } catch (error) {
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

  root.innerHTML = state.requesters.map((item) => `
    <article class="equipment-card requester-card">
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <div class="equipment-state">
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
  `).join("");

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
    && String(equipment.category) === String(payload.category)
    && String(equipment.location || "") === String(payload.location || "")
    && String(equipment.capacity || "") === String(payload.capacity || "")
    && String(equipment.equipment_spec || "") === String(payload.equipment_spec || "")
    && String(equipment.status) === String(payload.status)
    && isTruthyFlag(equipment.is_active) === isTruthyFlag(payload.is_active)
    && isTruthyFlag(equipment.requires_test_condition) === isTruthyFlag(payload.requires_test_condition);
}

async function cancelReservation(reservation) {
  assertClientReady();

  const reason = window.prompt("請輸入取消原因", "行程異動");
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
    assertNoError(updateError, "取消預約失敗");

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
  } catch (error) {
    renderNotice(error.message, "error");
  }
}

async function completeReservation(reservation) {
  assertClientReady();

  if (!canCompleteReservation(reservation)) {
    renderNotice("此預約目前不能標記完成。", "error");
    return;
  }

  const confirmed = window.confirm("確定要將此預約標記為完成，並從現在開始釋放後續時段嗎？");
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
    assertNoError(updateError, "完成預約失敗");

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

function updateBulletinScrollSettings() {
  const intervalInput = document.getElementById("bulletinScrollInterval");
  const durationInput = document.getElementById("bulletinScrollDuration");
  state.bulletinScroll.intervalSeconds = clampNumber(intervalInput.value, 5, 300, 30);
  state.bulletinScroll.durationSeconds = clampNumber(durationInput.value, 1, 30, 6);
  intervalInput.value = String(state.bulletinScroll.intervalSeconds);
  durationInput.value = String(state.bulletinScroll.durationSeconds);
  scheduleBulletinAutoScroll();
}

function scheduleBulletinAutoScroll(options = {}) {
  const resetPosition = options.resetPosition !== false;

  if (state.bulletinScroll.timerId) {
    window.clearInterval(state.bulletinScroll.timerId);
    state.bulletinScroll.timerId = null;
  }

  const wrap = document.querySelector(".bulletin-wrap");
  if (!wrap) return;

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

function stepBulletinAutoScroll() {
  const wrap = document.querySelector(".bulletin-wrap");
  if (!wrap) return;

  const maxTop = Math.max(wrap.scrollHeight - wrap.clientHeight, 0);
  if (maxTop <= 8) {
    wrap.scrollTo({ top: 0, behavior: "auto" });
    state.bulletinScroll.direction = "down";
    return;
  }

  const targetTop = state.bulletinScroll.direction === "down" ? maxTop : 0;
  wrap.style.scrollBehavior = "smooth";
  wrap.scrollTo({ top: targetTop, behavior: "smooth" });
  window.setTimeout(() => {
    wrap.style.scrollBehavior = "";
  }, state.bulletinScroll.durationSeconds * 1000);
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

function setDefaultTimes() {
  const form = document.getElementById("reservationForm");
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const start = addHours(now, 1);
  const end = addHours(start, 2);
  form.elements.department.value = "PQE";
  form.elements.start_time.value = toDateTimeInput(start);
  form.elements.end_time.value = toDateTimeInput(end);
  if (form.elements.test_condition) {
    form.elements.test_condition.value = "";
  }
  syncReservationEquipmentState();
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
  menu.innerHTML = matches.map((item, index) => `
    <button
      type="button"
      class="typeahead-option"
      data-requester-field="${field}"
      data-requester-index="${index}">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.email)} / ${escapeHtml(item.department || "PQE")}</span>
    </button>
  `).join("");

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
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
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

function formatTime(value) {
  const d = new Date(value);
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDateTime(value) {
  const d = new Date(value);
  const day = d.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" });
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
