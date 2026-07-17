/* ==========================================================================
   Planner_AI — auth page logic
   ========================================================================== */

// If already logged in, skip straight to the dashboard.
if (Auth.isLoggedIn()) {
  window.location.href = "dashboard.html";
}

// --- signature week-strip animation ---
(function buildWeekStrip() {
  const days = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
  const todayIdx = (new Date().getDay() + 6) % 7; // Monday = 0
  const strip = document.getElementById("weekStrip");
  days.forEach((d, i) => {
    const bar = document.createElement("div");
    bar.className = "bar" + (i === todayIdx ? " today" : "");
    const h = 30 + Math.round(Math.sin(i * 1.3) * 18) + (i === todayIdx ? 20 : 0);
    bar.style.height = `${Math.max(24, h)}px`;
    bar.style.animationDelay = `${i * 60}ms`;
    const label = document.createElement("span");
    label.textContent = d;
    bar.appendChild(label);
    strip.appendChild(bar);
  });
})();

// --- toasts ---
function showToast(message, type = "") {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function showAlert(message) {
  const alert = document.getElementById("formAlert");
  alert.textContent = message;
  alert.classList.add("show");
}
function hideAlert() {
  const alert = document.getElementById("formAlert");
  alert.classList.remove("show");
}

// --- tab switching ---
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");

function showLogin() {
  loginForm.style.display = "";
  registerForm.style.display = "none";
  tabLogin.classList.add("active");
  tabRegister.classList.remove("active");
  hideAlert();
}
function showRegister() {
  loginForm.style.display = "none";
  registerForm.style.display = "";
  tabRegister.classList.add("active");
  tabLogin.classList.remove("active");
  hideAlert();
}

tabLogin.addEventListener("click", showLogin);
tabRegister.addEventListener("click", showRegister);
document.getElementById("goToRegister").addEventListener("click", (e) => { e.preventDefault(); showRegister(); });
document.getElementById("goToLogin").addEventListener("click", (e) => { e.preventDefault(); showLogin(); });

// --- helpers for submit-button loading state ---
function setBusy(button, busy, busyLabel) {
  button.disabled = busy;
  const label = button.querySelector(".btn-label");
  if (busy) {
    button.dataset.original = label.textContent;
    label.textContent = busyLabel;
  } else {
    label.textContent = button.dataset.original || label.textContent;
  }
}

// --- login submit ---
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const btn = document.getElementById("loginSubmit");

  setBusy(btn, true, "Входим…");
  try {
    await Api.login(email, password);
    window.location.href = "dashboard.html";
  } catch (err) {
    showAlert(err.message || "Не удалось войти");
    setBusy(btn, false);
  }
});

// --- register submit ---
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert();
  const username = document.getElementById("regUsername").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const btn = document.getElementById("registerSubmit");

  setBusy(btn, true, "Создаём…");
  try {
    await Api.register(username, email, password);
    await Api.login(email, password);
    window.location.href = "dashboard.html";
  } catch (err) {
    showAlert(err.message || "Не удалось зарегистрироваться");
    setBusy(btn, false);
  }
});