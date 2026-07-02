const SUPABASE_CONFIG_KEY = "rlab-supabase-config";

const state = {
  client: null,
  config: null,
  equipment: [],
  reservations: [],
  weekStart: startOfWeek(new Date()),
  activeView: "reservation",
  editingEquipmentId: null,
  loading: false,
};

const statusText = {
  available: "可預約",
  reserved: "已預約",
  maintenance: "維修中",
  offline: "停用",
  cancelled: "已取消",
  checked_in: "使用中",
  checked_out: "已結束",
};

statusText.validation = "驗證中";

const dayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  hydrateSupabaseConfig();
  setDefaultTimes();
  renderAll();

  if (state.config) {
    await connectAndLoad();
  }
});

function bindEvents() {
  document.getElementById("refreshBtn").addEventListener("click", () => connectAndLoad(true));
  document.getElementById("prevWeek").addEventListener("click", () => moveWeek(-7));
  document.getElementById("nextWeek").addEventListener("click", () => moveWeek(7));
  document.getElementById("reservationForm").addEventListener("submit", submitReservation);
  document.getElementById("equipmentForm").addEventListener("submit", submitEquipment);
  document.getElementById("equipmentCancelBtn").addEventListener("click", cancelEquipmentEdit);
  document.getElementById("equipmentResetBtn").addEventListener("click", resetEquipmentForm);
  document.getElementById("supabaseConfigForm").addEventListener("submit", saveSupabaseConfig);
  document.getElementById("clearSupabaseConfigBtn").addEventListener("click", clearSupabaseConfig);

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.viewTarget));
  });
}

function hydrateSupabaseConfig() {
  const raw = window.localStorage.getItem(SUPABASE_CONFIG_KEY);
  if (!raw) {
    renderConnectionState();
    return;
  }

  try {
    const config = JSON.parse(raw);
    state.config = normalizeSupabaseConfig(config);
    document.getElementById("supabaseUrl").value = state.config.url;
    document.getElementById("supabaseAnonKey").value = state.config.anonKey;
    state.client = buildClient(state.config);
  } catch (error) {
    console.warn("Failed to restore Supabase config", error);
    window.localStorage.removeItem(SUPABASE_CONFIG_KEY);
    state.config = null;
    state.client = null;
  }

  renderConnectionState();
}

async function saveSupabaseConfig(event) {
  event.preventDefault();
  const message = document.getElementById("supabaseConfigMessage");

  try {
    const formData = new FormData(event.currentTarget);
    const config = normalizeSupabaseConfig({
      url: formData.get("supabase_url"),
      anonKey: formData.get("supabase_anon_key"),
    });

    state.config = config;
    state.client = buildClient(config);
    window.localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config));
    renderConnectionState();
    message.textContent = "設定已儲存，正在連線 Supabase。";
    await connectAndLoad();
    message.textContent = "Supabase 已連線。";
  } catch (error) {
    message.textContent = error.message;
    renderNotice(error.message, "error");
    renderConnectionState("disconnected");
  }
}

function clearSupabaseConfig() {
  state.client = null;
  state.config = null;
  state.equipment = [];
  state.reservations = [];
  state.editingEquipmentId = null;
  window.localStorage.removeItem(SUPABASE_CONFIG_KEY);
  document.getElementById("supabaseConfigForm").reset();
  document.getElementById("supabaseConfigMessage").textContent = "已清除連線設定。";
  renderNotice("請重新輸入 Supabase URL 與 anon key。", "info");
  renderConnectionState("disconnected");
  renderAll();
}

function normalizeSupabaseConfig(config) {
  const url = String(config?.url || "").trim().replace(/\/+$/, "");
  const anonKey = String(config?.anonKey || "").trim();

  if (!url.startsWith("https://")) {
    throw new Error("Supabase URL 必須是 https:// 開頭。");
  }
  if (!anonKey) {
    throw new Error("請輸入 Supabase anon key。");
  }

  return { url, anonKey };
}

function buildClient(config) {
  if (!window.supabase?.createClient) {
    throw new Error("Supabase SDK 載入失敗，請稍後重整頁面。");
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
    renderNotice("請先完成 Supabase 連線設定。", "info");
    renderConnectionState("disconnected");
    renderAll();
    return;
  }

  state.loading = true;
  renderConnectionState("connecting");
  if (forceRefresh) {
    renderNotice("正在重新同步雲端資料...", "info");
  }

  try {
    await loadAll();
    renderConnectionState("connected");
    renderNotice("已連線到 Supabase，畫面資料來自雲端。", "success");
  } catch (error) {
    console.error(error);
    renderConnectionState("disconnected");
    renderNotice(error.message, "error");
  } finally {
    state.loading = false;
    renderAll();
  }
}

async function loadAll() {
  await loadEquipment();
  await loadReservations();
}

async function loadEquipment() {
  const { data, error } = await state.client
    .from("equipment")
    .select("id, name, category, location, status, capacity, is_active")
    .order("is_active", { ascending: false })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  assertNoError(error, "設備資料讀取失敗");
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
      purpose,
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

  assertNoError(error, "預約資料讀取失敗");

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
  renderEquipmentSummary();
  renderWeek();
  renderGantt();
  renderReservationRows();
  renderViewState();
  renderConnectionState();
  syncEquipmentForm();
}

function renderConnectionState(forcedState = null) {
  const badge = document.getElementById("connectionBadge");
  const mode = forcedState || (state.client ? "connected" : "disconnected");

  badge.className = `status-pill ${mode}`;
  if (mode === "connecting") {
    badge.textContent = "連線中";
    return;
  }
  if (mode === "connected") {
    badge.textContent = "雲端已連線";
    return;
  }
  badge.textContent = "未連線";
}

function renderNotice(message, level = "info") {
  const notice = document.getElementById("runtimeNotice");
  notice.className = `notice ${level}`;
  notice.textContent = message;
}

function setActiveView(viewName) {
  state.activeView = viewName;
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
  if (!root) return;

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
    { label: "本週預約", value: activeReservations.length, hint: `${reservedHours.toFixed(1)} 小時已排程` },
    { label: "驗證中", value: validation, hint: "暫不開放預約" },
    { label: "維修中", value: maintenance, hint: "工程或校正中" },
    { label: "停用 / 未啟用", value: offline, hint: "目前不納入排程" },
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
}

function renderEquipmentSummary() {
  const root = document.getElementById("equipmentSummary");
  root.innerHTML = "";

  if (!state.equipment.length) {
    root.innerHTML = '<article class="empty-card">尚未有設備資料，可直接從右側表單新增。</article>';
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
          ${item.is_active ? "" : '<span class="badge inactive">未啟用</span>'}
        </div>
        <div class="equipment-card-meta">
          <span>類別：${escapeHtml(item.category)}</span>
          <span>位置：${escapeHtml(item.location || "未設定")}</span>
          <span>容量：${escapeHtml(item.capacity)} 台</span>
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
  const equipment = state.equipment.find((item) => item.id === state.editingEquipmentId);

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
    form.elements.status.value = "available";
    form.elements.is_active.value = "1";
    if (!message.dataset.preserve) {
      message.textContent = "";
    }
    return;
  }

  title.textContent = `編輯設備資訊：${equipment.name}`;
  submitButton.textContent = "儲存變更";
  cancelButton.hidden = false;
  resetButton.textContent = "回復內容";
  form.elements.equipment_id.value = String(equipment.id);
  form.elements.name.value = equipment.name;
  form.elements.category.value = equipment.category;
  form.elements.location.value = equipment.location || "";
  form.elements.capacity.value = String(equipment.capacity || 1);
  form.elements.status.value = equipment.status;
  form.elements.is_active.value = equipment.is_active ? "1" : "0";
  message.textContent = "";
}

function resetEquipmentForm() {
  if (state.editingEquipmentId) {
    syncEquipmentForm();
    return;
  }
  state.editingEquipmentId = null;
  document.getElementById("equipmentMessage").dataset.preserve = "";
  syncEquipmentForm();
}

function cancelEquipmentEdit() {
  state.editingEquipmentId = null;
  const message = document.getElementById("equipmentMessage");
  message.dataset.preserve = "";
  message.textContent = "已取消編輯。";
  syncEquipmentForm();
}

function renderWeek() {
  const board = document.getElementById("scheduleBoard");
  const template = document.getElementById("dayTemplate");
  const weekEnd = addDays(state.weekStart, 6);
  document.getElementById("weekLabel").textContent = `${formatDate(state.weekStart)} - ${formatDate(weekEnd)}`;
  board.innerHTML = "";

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(state.weekStart, offset);
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector("h3").textContent = `${dayNames[date.getDay()]} ${formatDate(date)}`;
    const events = state.reservations.filter((reservation) => sameDate(new Date(reservation.start_time), date));
    const eventRoot = node.querySelector(".day-events");

    if (events.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-day";
      empty.textContent = "尚無預約";
      eventRoot.appendChild(empty);
    } else {
      events.forEach((reservation) => eventRoot.appendChild(renderEventCard(reservation)));
    }

    board.appendChild(node);
  }
}

function renderEventCard(reservation) {
  const card = document.createElement("div");
  card.className = `event-card ${reservation.status === "cancelled" ? "cancelled" : ""}`;
  card.innerHTML = `
    <strong>${escapeHtml(reservation.equipment_name)}</strong>
    <span>${formatTime(reservation.start_time)} - ${formatTime(reservation.end_time)}</span>
    <span>${escapeHtml(reservation.requester_name)} / ${escapeHtml(reservation.purpose)}</span>
  `;
  return card;
}

function renderGantt() {
  const scale = document.getElementById("ganttScale");
  const chart = document.getElementById("ganttChart");
  if (!scale || !chart) return;

  scale.innerHTML = '<div class="gantt-equipment-spacer">設備</div>';
  chart.innerHTML = "";

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(state.weekStart, offset);
    const tick = document.createElement("div");
    tick.className = "gantt-day";
    tick.textContent = `${dayNames[date.getDay()]} ${formatDate(date)}`;
    scale.appendChild(tick);
  }

  if (!state.equipment.length) {
    chart.innerHTML = '<div class="gantt-placeholder">尚未有設備資料，請先新增設備。</div>';
    return;
  }

  state.equipment.forEach((equipment) => {
    const row = document.createElement("div");
    row.className = "gantt-row";

    const label = document.createElement("div");
    label.className = "gantt-equipment-label";
    label.innerHTML = `
      <strong>${escapeHtml(equipment.name)}</strong>
      <span>${escapeHtml(equipment.category)} / ${escapeHtml(statusText[equipment.status] || equipment.status)}</span>
    `;

    const lane = document.createElement("div");
    lane.className = "gantt-lane";
    if (equipment.status !== "available" || !equipment.is_active) {
      lane.classList.add("is-limited");
    }

    const reservations = state.reservations.filter((reservation) =>
      Number(reservation.equipment_id) === Number(equipment.id)
      && reservation.status !== "cancelled"
    );

    reservations.forEach((reservation) => {
      const bar = document.createElement("button");
      bar.type = "button";
      bar.className = "gantt-bar";
      bar.style.cssText = getGanttBarStyle(reservation);
      bar.title = `${reservation.equipment_name} ${formatDateTime(reservation.start_time)} - ${formatDateTime(reservation.end_time)}`;
      bar.innerHTML = `
        <strong>${escapeHtml(reservation.requester_name)}</strong>
        <span>${formatTime(reservation.start_time)}-${formatTime(reservation.end_time)}</span>
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
  const width = Math.max(((clampedEnd - clampedStart) / total) * 100, 1.2);
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
      <td>${escapeHtml(reservation.purpose)}</td>
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
    message.textContent = "請先建立可預約設備。";
    return;
  }
  if (new Date(endIso) <= new Date(startIso)) {
    message.textContent = "結束時間必須晚於開始時間。";
    return;
  }

  try {
    const equipment = state.equipment.find((item) => Number(item.id) === equipmentId);
    if (!equipment || !equipment.is_active || equipment.status !== "available") {
      throw new Error("所選設備目前不可預約。");
    }

    const { data: conflicts, error: conflictError } = await state.client
      .from("reservations")
      .select("id, requester_name, start_time, end_time")
      .eq("equipment_id", equipmentId)
      .neq("status", "cancelled")
      .lt("start_time", endIso)
      .gt("end_time", startIso)
      .limit(1);

    assertNoError(conflictError, "預約衝突檢查失敗");
    if (conflicts?.length) {
      throw new Error(`此時段與既有預約衝突：#${conflicts[0].id} ${conflicts[0].requester_name}`);
    }

    const reservationRow = {
      equipment_id: equipmentId,
      requester_name: payload.requester_name.trim(),
      requester_email: payload.requester_email.trim(),
      department: payload.department.trim(),
      purpose: payload.purpose.trim(),
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

    assertNoError(insertError, "預約建立失敗");

    const { error: historyError } = await state.client
      .from("reservation_history")
      .insert({
        reservation_id: inserted.id,
        action: "created",
        new_value: reservationRow,
        changed_by_name: payload.requester_name.trim(),
      });

    assertNoError(historyError, "預約紀錄寫入失敗");

    message.textContent = "預約已建立。";
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
    status: String(payload.status || "available"),
    is_active: String(payload.is_active || "1") === "1",
  };

  if (!row.name) {
    message.textContent = "設備名稱不可空白。";
    return;
  }
  if (!row.category) {
    message.textContent = "設備類別不可空白。";
    return;
  }
  if (row.capacity < 1) {
    message.textContent = "容量至少要為 1。";
    return;
  }

  try {
    let saved = null;
    if (equipmentId) {
      const { data, error } = await state.client
        .from("equipment")
        .update(row)
        .eq("id", equipmentId)
        .select()
        .single();
      assertNoError(error, "設備更新失敗");
      saved = data;
      message.textContent = "設備資料已更新。";
      state.editingEquipmentId = equipmentId;
    } else {
      const { data, error } = await state.client
        .from("equipment")
        .insert(row)
        .select()
        .single();
      assertNoError(error, "設備建立失敗");
      saved = data;
      message.textContent = "設備已新增。";
      state.editingEquipmentId = Number(saved.id);
    }

    message.dataset.preserve = "true";
    await loadEquipment();

    if (equipmentId) {
      const updated = state.equipment.find((item) => item.id === equipmentId);
      if (!updated || !equipmentMatchesPayload(updated, row)) {
        throw new Error("設備資料尚未反映到目前雲端狀態，請重新整理後再試一次。");
      }
    }

    renderAll();
    message.dataset.preserve = "";
  } catch (error) {
    message.textContent = error.message;
  }
}

function equipmentMatchesPayload(equipment, payload) {
  return String(equipment.name) === String(payload.name)
    && String(equipment.category) === String(payload.category)
    && String(equipment.location || "") === String(payload.location || "")
    && Number(equipment.capacity) === Number(payload.capacity)
    && String(equipment.status) === String(payload.status)
    && Boolean(equipment.is_active) === Boolean(payload.is_active);
}

async function cancelReservation(reservation) {
  assertClientReady();

  const reason = window.prompt("請輸入取消原因", "時程變更");
  if (!reason) return;

  try {
    const { data: current, error: loadError } = await state.client
      .from("reservations")
      .select("*")
      .eq("id", reservation.id)
      .single();

    assertNoError(loadError, "預約資料讀取失敗");

    const { data: updated, error: updateError } = await state.client
      .from("reservations")
      .update({
        status: "cancelled",
        cancel_reason: reason,
      })
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

    assertNoError(historyError, "預約取消紀錄寫入失敗");
    await loadReservations();
    renderAll();
  } catch (error) {
    renderNotice(error.message, "error");
  }
}

function assertClientReady() {
  if (!state.client) {
    throw new Error("請先完成 Supabase 連線設定。");
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

function setDefaultTimes() {
  const form = document.getElementById("reservationForm");
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const start = addHours(now, 1);
  const end = addHours(start, 2);
  form.elements.start_time.value = toDateTimeInput(start);
  form.elements.end_time.value = toDateTimeInput(end);
}

function startOfWeek(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - value.getDay());
  return value;
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function addHours(date, hours) {
  const value = new Date(date);
  value.setHours(value.getHours() + hours);
  return value;
}

function sameDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function toDateTimeInput(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value) {
  return new Date(value).toISOString();
}

function dateToIso(value) {
  return new Date(value).toISOString();
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
