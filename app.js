const state = {
  equipment: [],
  reservations: [],
  weekStart: startOfWeek(new Date()),
  activeView: "reservation",
  editingEquipmentId: null,
};

const statusText = {
  available: "可預約",
  reserved: "已預約",
  validation: "驗證中",
  maintenance: "維修中",
  offline: "停用",
  cancelled: "已取消",
};

const dayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

document.addEventListener("DOMContentLoaded", () => {
  setDefaultTimes();
  bindEvents();
  loadAll();
});

function bindEvents() {
  document.getElementById("refreshBtn").addEventListener("click", loadAll);
  document.getElementById("prevWeek").addEventListener("click", () => moveWeek(-7));
  document.getElementById("nextWeek").addEventListener("click", () => moveWeek(7));
  document.getElementById("reservationForm").addEventListener("submit", submitReservation);
  document.getElementById("equipmentForm").addEventListener("submit", submitEquipment);
  document.getElementById("equipmentCancelBtn").addEventListener("click", cancelEquipmentEdit);
  document.getElementById("equipmentResetBtn").addEventListener("click", resetEquipmentForm);

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.viewTarget));
  });
}

async function loadAll() {
  await loadEquipment();
  await loadReservations();
  renderAll();
}

async function loadEquipment() {
  const data = await api("/api/equipment");
  state.equipment = data.equipment;
}

async function loadReservations() {
  const from = toDateTimeInput(state.weekStart);
  const to = toDateTimeInput(addDays(state.weekStart, 7));
  const data = await api(`/api/reservations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  state.reservations = data.reservations;
}

function renderAll() {
  renderDashboardMetrics();
  renderEquipmentOptions();
  renderEquipmentSummary();
  renderWeek();
  renderGantt();
  renderReservationRows();
  renderViewState();
  syncEquipmentForm();
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
    { label: "驗證中", value: validation, hint: "暫不開放一般預約" },
    { label: "維修中", value: maintenance, hint: "暫停開放預約" },
    { label: "停用或未啟用", value: offline, hint: "不列入目前借用" },
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
          <span>容量：${escapeHtml(item.capacity)} 組</span>
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

  title.textContent = `編輯設備資訊: ${equipment.name}`;
  submitButton.textContent = "儲存變更";
  cancelButton.hidden = false;
  resetButton.textContent = "還原內容";
  form.elements.equipment_id.value = String(equipment.id);
  form.elements.name.value = equipment.name;
  form.elements.category.value = equipment.category;
  form.elements.location.value = equipment.location || "";
  form.elements.capacity.value = String(equipment.capacity || 1);
  form.elements.status.value = equipment.status;
  form.elements.is_active.value = String(equipment.is_active ? 1 : 0);
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
  const form = event.currentTarget;
  const message = document.getElementById("formMessage");
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.equipment_id = Number(payload.equipment_id);

  try {
    await api("/api/reservations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
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
  const form = event.currentTarget;
  const message = document.getElementById("equipmentMessage");
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.capacity = Number(payload.capacity || 1);
  payload.is_active = Number(payload.is_active);

  const equipmentId = payload.equipment_id ? Number(payload.equipment_id) : null;
  delete payload.equipment_id;

  try {
    if (equipmentId) {
      await api(`/api/equipment/${equipmentId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await api("/api/equipment", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

    message.dataset.preserve = "true";
    await loadEquipment();
    if (equipmentId) {
      const updated = state.equipment.find((item) => item.id === equipmentId);
      if (!updated || !equipmentMatchesPayload(updated, payload)) {
        throw new Error("設備資料未反映到目前伺服器，請重新啟動後端後再試一次。");
      }
      message.textContent = "設備資料已更新。";
      state.editingEquipmentId = equipmentId;
    } else {
      message.textContent = "設備已新增。";
      state.editingEquipmentId = null;
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
    && Number(equipment.is_active) === Number(payload.is_active);
}

async function cancelReservation(reservation) {
  const reason = window.prompt("請輸入取消原因", "調整排程");
  if (!reason) return;

  await api(`/api/reservations/${reservation.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "cancelled",
      cancel_reason: reason,
      changed_by: reservation.requester_name,
    }),
  });

  await loadReservations();
  renderAll();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "系統發生錯誤");
  }
  return data;
}

function moveWeek(days) {
  state.weekStart = addDays(state.weekStart, days);
  loadReservations().then(renderAll);
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
