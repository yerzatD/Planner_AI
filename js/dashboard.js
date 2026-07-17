/* ==========================================================================
   Planner_AI — dashboard logic
   ========================================================================== */

if (!Auth.isLoggedIn()) {
  window.location.href = "index.html";
}

const DAY_ORDER = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const DAY_SHORT = { "понедельник": "ПН", "вторник": "ВТ", "среда": "СР", "четверг": "ЧТ", "пятница": "ПТ", "суббота": "СБ", "воскресенье": "ВС" };

let currentUser = null;
let currentRole = "user"; // 'user' | 'admin'

// ---------------------------------------------------------------------
// toasts / small helpers
// ---------------------------------------------------------------------
function showToast(message, type = "") {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function initials(name) {
  if (!name) return "?";
  return name.trim().slice(0, 1).toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// boot: figure out who's logged in and which role they have
// ---------------------------------------------------------------------
async function boot() {
  try {
    currentUser = await Api.me();
  } catch (e) {
    Auth.clearToken();
    window.location.href = "index.html";
    return;
  }

  // UserResponse doesn't always include `role`. Prefer it when present;
  // otherwise probe the admin-only endpoint to tell the two roles apart.
  if (currentUser.role) {
    currentRole = currentUser.role;
  } else {
    try {
      await Api.getUsers();
      currentRole = "admin";
    } catch {
      currentRole = "user";
    }
  }

  renderIdentity();
  setupNav();

  if (currentRole === "admin") {
    document.getElementById("navAdmin").hidden = false;
    switchView("roster");
  } else {
    document.getElementById("navStudent").hidden = false;
    switchView("plan");
  }

  document.getElementById("profileUsername").value = currentUser.username || "";
  document.getElementById("profileEmail").value = currentUser.email || "";
}

function renderIdentity() {
  document.getElementById("sidebarName").textContent = currentUser.username || "Без имени";
  document.getElementById("sidebarEmail").textContent = currentUser.email || "";
  document.getElementById("avatarInitial").textContent = initials(currentUser.username);
  document.getElementById("roleStamp").textContent = currentRole === "admin" ? "куратор" : "студент";
}

// ---------------------------------------------------------------------
// nav / view routing
// ---------------------------------------------------------------------
const VIEW_META = {
  plan: { title: "Мой план", subtitle: "Недельное расписание, собранное ИИ" },
  generate: { title: "Новый план", subtitle: "Опиши неделю — получи расписание" },
  history: { title: "История", subtitle: "Все прошлые запросы к планировщику" },
  roster: { title: "Студенты", subtitle: "Все зарегистрированные аккаунты" },
  profile: { title: "Профиль", subtitle: "Имя и email аккаунта" },
};

function setupNav() {
  document.querySelectorAll(".nav-link[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.getElementById("menuBtn").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
  document.getElementById("logoutBtn").addEventListener("click", () => {
    Auth.clearToken();
    window.location.href = "index.html";
  });
}

function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
  const target = document.getElementById(`view-${name}`);
  if (target) target.hidden = false;

  document.querySelectorAll(".nav-link[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });

  const meta = VIEW_META[name] || {};
  document.getElementById("topbarTitle").textContent = meta.title || "";
  document.getElementById("topbarSubtitle").textContent = meta.subtitle || "";

  document.getElementById("sidebar").classList.remove("open");

  if (name === "plan") loadPlanView();
  if (name === "history") loadHistoryView();
  if (name === "roster") loadRosterView();
}

// ---------------------------------------------------------------------
// STUDENT: plan (weekly calendar)
// ---------------------------------------------------------------------
function classifyTask(task) {
  const hay = `${task.type || ""} ${task.title || ""}`.toLowerCase();
  if (/видео|урок|video/.test(hay)) return "video";
  if (/конспект|практ|дз|домаш|квиз|тест|ошиб/.test(hay)) return "deadline";
  return "generic";
}

function renderPlan(chat) {
  const container = document.getElementById("planContainer");
  const warningsBox = document.getElementById("planWarnings");
  const metaBox = document.getElementById("planMeta");

  if (!chat || !chat.response_from_ai) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="glyph">📅</div>
        <h4>Плана пока нет</h4>
        <p>Создай первый план на вкладке «Новый план».</p>
      </div>`;
    warningsBox.classList.remove("show");
    metaBox.innerHTML = "";
    return;
  }

  const plan = chat.response_from_ai;
  const days = Array.isArray(plan.plan) ? plan.plan : [];
  const sorted = [...days].sort((a, b) => {
    const ia = DAY_ORDER.indexOf((a.day || "").toLowerCase());
    const ib = DAY_ORDER.indexOf((b.day || "").toLowerCase());
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  // warnings
  if (Array.isArray(plan.warnings) && plan.warnings.length) {
    warningsBox.innerHTML = `<span>⚠</span><div>${plan.warnings.map(escapeHtml).join("<br>")}</div>`;
    warningsBox.classList.add("show");
  } else {
    warningsBox.classList.remove("show");
  }

  // meta pills
  const metaPills = [];
  if (typeof plan.total_lessons === "number") {
    metaPills.push(`<div class="meta-pill">Всего уроков <b>${plan.total_lessons}</b></div>`);
  }
  if (typeof plan.lessons_planned === "number") {
    metaPills.push(`<div class="meta-pill">Запланировано <b>${plan.lessons_planned}</b></div>`);
  }
  metaBox.innerHTML = metaPills.join("");

  // free hours lookup
  let freeHours = {};
  if (plan.free_hours_per_day) {
    if (Array.isArray(plan.free_hours_per_day)) {
      plan.free_hours_per_day.forEach((f) => (freeHours[(f.day || "").toLowerCase()] = f.hours));
    } else {
      Object.entries(plan.free_hours_per_day).forEach(([k, v]) => (freeHours[k.toLowerCase()] = v));
    }
  }

  if (!sorted.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="glyph">📅</div>
        <h4>ИИ не вернул расписание</h4>
        <p>Попробуй сформулировать запрос подробнее на вкладке «Новый план».</p>
      </div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  sorted.forEach((day) => {
    const col = document.createElement("div");
    col.className = "day-col";

    const dayKey = (day.day || "").toLowerCase();
    const free = freeHours[dayKey];

    col.innerHTML = `
      <div class="day-col-head">
        <div class="d-name">${escapeHtml(DAY_SHORT[dayKey] || (day.day || "").slice(0, 2).toUpperCase())} · ${escapeHtml(day.day || "")}</div>
        <div class="d-date">${escapeHtml(day.date || "")}</div>
        ${free !== undefined ? `<div class="d-free">свободно ~${free} ч</div>` : ""}
      </div>
      <div class="day-tasks"></div>
    `;

    const tasksBox = col.querySelector(".day-tasks");
    const tasks = Array.isArray(day.tasks) ? day.tasks : [];

    if (!tasks.length) {
      tasksBox.innerHTML = `<div class="empty-day">Свободный день</div>`;
    } else {
      tasks.forEach((task) => {
        const cls = classifyTask(task);
        const chip = document.createElement("div");
        chip.className = `task-chip type-${cls}${task.status === "done" ? " status-done" : ""}`;
        chip.innerHTML = `
          <div class="t-title">${escapeHtml(task.title || task.type || "Задача")}</div>
          <div class="t-time mono">${escapeHtml(task.start_time || "")}${task.end_time ? "–" + escapeHtml(task.end_time) : ""}</div>
        `;
        tasksBox.appendChild(chip);
      });
    }

    grid.appendChild(col);
  });

  container.innerHTML = "";
  container.appendChild(grid);
}

async function loadPlanView() {
  const container = document.getElementById("planContainer");
  container.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
  try {
    const chat = await Api.getLastChat();
    renderPlan(chat);
  } catch (e) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="glyph">⚠</div>
        <h4>Не удалось загрузить план</h4>
        <p>${escapeHtml(e.message)}</p>
      </div>`;
  }
}

// ---------------------------------------------------------------------
// STUDENT: generate
// ---------------------------------------------------------------------
const promptInput = document.getElementById("promptInput");
const generateBtn = document.getElementById("generateBtn");

generateBtn.addEventListener("click", submitPrompt);
promptInput.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitPrompt();
});

async function submitPrompt() {
  const text = promptInput.value.trim();
  if (!text) {
    showToast("Опиши свою неделю перед отправкой", "error");
    return;
  }

  generateBtn.disabled = true;
  const original = generateBtn.textContent;
  generateBtn.innerHTML = `<span class="loading-dots"><span></span><span></span><span></span></span> Составляем план…`;

  try {
    const chat = await Api.sendPrompt(text);
    showToast("План готов", "success");
    promptInput.value = "";
    switchView("plan");
    renderPlan(chat);
  } catch (e) {
    showToast(e.message || "Не удалось сгенерировать план", "error");
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = original;
  }
}

// ---------------------------------------------------------------------
// STUDENT: history
// ---------------------------------------------------------------------
async function loadHistoryView() {
  const box = document.getElementById("historyList");
  box.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
  try {
    const chats = await Api.getAllChats();
    if (!chats.length) {
      box.innerHTML = `
        <div class="empty-state">
          <div class="glyph">☰</div>
          <h4>История пуста</h4>
          <p>Здесь появятся все твои запросы к ИИ-планировщику.</p>
        </div>`;
      return;
    }
    box.innerHTML = "";
    [...chats].reverse().forEach((chat) => {
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `
        <div class="h-prompt">${escapeHtml(chat.prompt)}</div>
        <div class="h-id mono">#${chat.id} →</div>
      `;
      row.addEventListener("click", () => {
        switchView("plan");
        renderPlan(chat);
      });
      box.appendChild(row);
    });
  } catch (e) {
    box.innerHTML = `
      <div class="empty-state">
        <div class="glyph">⚠</div>
        <h4>Не удалось загрузить историю</h4>
        <p>${escapeHtml(e.message)}</p>
      </div>`;
  }
}

// ---------------------------------------------------------------------
// ADMIN: roster
// ---------------------------------------------------------------------
let pendingDeleteId = null;

async function loadRosterView() {
  const tbody = document.getElementById("rosterBody");
  const countEl = document.getElementById("rosterCount");
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:40px;"><span class="spinner"></span></td></tr>`;
  try {
    const users = await Api.getUsers();
    countEl.textContent = `${users.length} всего`;

    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:40px; color:var(--text-muted);">Пока нет студентов</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    users.forEach((u) => {
      const role = u.role || "user";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><div class="roster-name"><div class="avatar" style="width:28px;height:28px;font-size:11px;">${escapeHtml(initials(u.username))}</div>${escapeHtml(u.username)}</div></td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="role-badge ${role}">${role === "admin" ? "куратор" : "студент"}</span></td>
        <td style="text-align:right;">
          ${u.id === currentUser.id ? "" : `<button class="btn btn-danger btn-sm" data-delete="${u.id}" data-name="${escapeHtml(u.username)}">Удалить</button>`}
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => openDeleteModal(btn.dataset.delete, btn.dataset.name));
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:40px; color:var(--coral);">${escapeHtml(e.message)}</td></tr>`;
  }
}

function openDeleteModal(id, name) {
  pendingDeleteId = id;
  document.getElementById("deleteModalText").textContent = `«${name}» будет удалён без возможности восстановления.`;
  document.getElementById("deleteModal").classList.add("show");
}
function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById("deleteModal").classList.remove("show");
}
document.getElementById("cancelDelete").addEventListener("click", closeDeleteModal);
document.getElementById("deleteModal").addEventListener("click", (e) => {
  if (e.target.id === "deleteModal") closeDeleteModal();
});
document.getElementById("confirmDelete").addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  const btn = document.getElementById("confirmDelete");
  btn.disabled = true;
  try {
    await Api.deleteUser(pendingDeleteId);
    showToast("Студент удалён", "success");
    closeDeleteModal();
    loadRosterView();
  } catch (e) {
    showToast(e.message || "Не удалось удалить", "error");
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------------
document.getElementById("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("profileSubmit");
  const username = document.getElementById("profileUsername").value.trim();
  const email = document.getElementById("profileEmail").value.trim();

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Сохраняем…";
  try {
    currentUser = await Api.updateMe(username, email);
    renderIdentity();
    showToast("Профиль обновлён", "success");
  } catch (e) {
    showToast(e.message || "Не удалось сохранить", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

boot();