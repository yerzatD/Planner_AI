/* ==========================================================================
   Planner_AI — API client
   Talks to the FastAPI backend (main.py: /users/*, /chat/*).
   Change API_BASE_URL below when you deploy the backend somewhere
   other than localhost.
   ========================================================================== */

const API_BASE_URL = window.PLANNER_API_BASE_URL || "http://127.0.0.1:8000";

const TOKEN_KEY = "planner_ai_token";

const Auth = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  },
  isLoggedIn() {
    return !!this.getToken();
  },
};

class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : "Что-то пошло не так");
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Core request helper. Adds the bearer token automatically when present.
 * `body`, if given, is JSON-encoded unless `form` is true (used for the
 * OAuth2 password login endpoint, which expects x-www-form-urlencoded).
 */
async function apiRequest(path, { method = "GET", body = null, form = false, auth = true } = {}) {
  const headers = {};
  const opts = { method, headers };

  if (body !== null) {
    if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.body = new URLSearchParams(body).toString();
    } else {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }

  if (auth && Auth.isLoggedIn()) {
    headers["Authorization"] = `Bearer ${Auth.getToken()}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, opts);
  } catch (e) {
    throw new ApiError(0, "Не удалось связаться с сервером. Проверь, что бэкенд запущен.");
  }

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const detail = data && data.detail ? data.detail : `Ошибка ${res.status}`;
    throw new ApiError(res.status, detail);
  }

  return data;
}

const Api = {
  // ---- auth / users ----
  register(username, email, password) {
    return apiRequest("/users/", {
      method: "POST",
      body: { username, email, password },
      auth: false,
    });
  },
  async login(email, password) {
    const data = await apiRequest("/users/login", {
      method: "POST",
      form: true,
      body: { username: email, password },
      auth: false,
    });
    Auth.setToken(data.access_token);
    return data;
  },
  me() {
    return apiRequest("/users/get/me");
  },
  updateMe(username, email) {
    return apiRequest("/users/update/me", {
      method: "PATCH",
      body: { username, email },
    });
  },
  // ---- admin ----
  getUsers() {
    return apiRequest("/users/get_users");
  },
  deleteUser(id) {
    return apiRequest(`/users/delete/${id}`, { method: "DELETE" });
  },
  // ---- chat / planning ----
  sendPrompt(prompt) {
    return apiRequest("/chat/prompt", { method: "POST", body: { prompt } });
  },
  getAllChats() {
    return apiRequest("/chat/all");
  },
  getLastChat() {
    return apiRequest("/chat/last/chat").catch((e) => {
      if (e.status === 404) return null;
      throw e;
    });
  },
};