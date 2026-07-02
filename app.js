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
  requesterFormDirty: false,
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
  checked_out: "已結案",
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
  const { data, error } = await state.client
    .from("equipment")
    .select("id, name, category, location, status, capacity, is_active, requires_test_condition")
    .order("is_active", { ascending: false })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  assertNoError(error, "讀取設備資料失敗");
  state.equipment = data || [];
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
  const activeReservations = state.reservations.filter((item) => item.status !== "cancelled");
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
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name} (${item.category})`;
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

function renderEquipmentSummary() {
  const root = document.getElementById("equipmentSummary");
  root.innerHTML = "";

  if (!state.equipment.length) {
    root.innerHTML = '<article class="empty-card">目前尚無設備資料。</article>';
    return;
  }

  state.equipment.forEach((item) => {
    const card = document.createElement("article");
    card.className = "equipment-card";
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <div class="equipment-state">
          <span class="badge ${escapeHtml(item.status)}">${escapeHtml(statusText[item.status] || item.status)}</span>
          ${item.is_active ? "" : '<span class="badge inactive">停用</span>'}
        </div>
        <div class="equipment-card-meta">
          <span>類別：${escapeHtml(item.category)}</span>
          <span>位置：${escapeHtml(item.location || "-")}</span>
          <span>可重疊預約量：${escapeHtml(item.capacity)}</span>
          <span>測試條件：${item.requires_test_condition ? "必填" : "非必填"}</span>
        </div>
      </div>
      <div class="equipment-card-actions">
        <button type="button" class="secondary equipment-edit-btn" data-edit-equipment="${item.id}">編輯</button>
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
    form.elements.capacity.value = "1";
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
  form.elements.capacity.value = String(equipment.capacity || 1);
  form.elements.requires_test_condition.value = equipment.requires_test_condition ? "1" : "0";
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
    const row = document.createElement("div");
    row.className = `gantt-row${variant === "bulletin" ? " bulletin-row" : ""}`;

    const label = document.createElement("div");
    label.className = `gantt-equipment-label${variant === "bulletin" ? " bulletin-cell" : ""}`;
    label.innerHTML = `
      <strong>${escapeHtml(equipment.name)}</strong>
      <span>${escapeHtml(equipment.category)} / ${escapeHtml(statusText[equipment.status] || equipment.status)}</span>
    `;

    const lane = document.createElement("div");
    lane.className = `gantt-lane${variant === "bulletin" ? " bulletin-lane" : ""}`;
    if (equipment.status !== "available" || !equipment.is_active) {
      lane.classList.add("is-limited");
    }

    const reservations = state.reservations.filter((reservation) =>
      Number(reservation.equipment_id) === Number(equipment.id) &&
      reservation.status !== "cancelled"
    );

    reservations.forEach((reservation) => {
      const bar = document.createElement("button");
      bar.type = "button";
      bar.className = `gantt-bar${variant === "bulletin" ? " bulletin-bar" : ""}`;
      bar.style.cssText = getGanttBarStyle(reservation);
      bar.title = `${reservation.equipment_name} / ${reservation.project_name} / ${formatDateTime(reservation.start_time)} - ${formatDateTime(reservation.end_time)}`;
      bar.innerHTML = `
        <strong>${escapeHtml(reservation.requester_name)}</strong>
        <span>${escapeHtml(reservation.project_name || "未填專案")}</span>
        <em>${formatTime(reservation.start_time)}-${formatTime(reservation.end_time)}</em>
      `;
      lane.appendChild(bar);
    });

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

function getGanttBarStyle(reservation) {
  const weekStart = state.weekStart.getTime();
  const weekEnd = addDays(state.weekStart, 7).getTime();
  const reservationStart = new Date(reservation.start_time).getTime();
  const reservationEnd = new Date(reservation.end_time).getTime();
  const clampedStart = Math.max(reservationStart, weekStart);
  const clampedEnd = Math.min(reservationEnd, weekEnd);
  const total = weekEnd - weekStart;
  const left = ((clampedStart - weekStart) / total) * 100;
  const width = Math.max(((clampedEnd - clampedStart) / total) * 100, 1.4);
  return `left: ${left.toFixed(3)}%; width: ${width.toFixed(3)}%;`;
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
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(reservation.equipment_name)}</td>
      <td>${formatDateTime(reservation.start_time)}<br>${formatDateTime(reservation.end_time)}</td>
      <td>${escapeHtml(reservation.requester_name)}<br><span class="muted">${escapeHtml(reservation.department)}</span></td>
      <td>${escapeHtml(reservation.project_name)}<br><span class="muted">${escapeHtml(reservation.purpose)}</span></td>
      <td><span class="badge ${escapeHtml(reservation.status)}">${escapeHtml(statusText[reservation.status] || reservation.status)}</span></td>
      <td class="row-actions"></td>
    `;

    const actions = tr.querySelector(".row-actions");
    if (reservation.status !== "cancelled") {
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
    if (equipment.requires_test_condition && !String(payload.test_condition || "").trim()) {
      throw new Error("此設備預約時必須填寫測試條件。");
    }

    const { data: conflicts, error: conflictError } = await state.client
      .from("reservations")
      .select("id, requester_name, start_time, end_time")
      .eq("equipment_id", equipmentId)
      .neq("status", "cancelled")
      .lt("start_time", endIso)
      .gt("end_time", startIso);

    assertNoError(conflictError, "讀取預約衝突失敗");
    if ((conflicts?.length || 0) >= Number(equipment.capacity || 1)) {
      throw new Error(`此設備於該時段的可重疊預約量已滿（上限 ${equipment.capacity || 1}）。`);
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
    capacity: Number(payload.capacity || 1),
    requires_test_condition: String(payload.requires_test_condition || "0") === "1",
    status: String(payload.status || "available"),
    is_active: String(payload.is_active || "1") === "1",
  };

  if (!row.name) {
    message.textContent = "請填寫設備名稱。";
    return;
  }
  if (!row.category) {
    message.textContent = "請填寫設備類別。";
    return;
  }
  if (row.capacity < 1) {
    message.textContent = "可重疊預約量至少需為 1。";
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
    && Number(equipment.capacity) === Number(payload.capacity)
    && String(equipment.status) === String(payload.status)
    && Boolean(equipment.is_active) === Boolean(payload.is_active)
    && Boolean(equipment.requires_test_condition) === Boolean(payload.requires_test_condition);
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

function scheduleBulletinAutoScroll() {
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

  wrap.scrollTo({ top: 0, behavior: "auto" });
  state.bulletinScroll.direction = "down";
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

  const requiresTestCondition = Boolean(equipment?.requires_test_condition);
  field.hidden = !requiresTestCondition;
  input.required = requiresTestCondition;
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
