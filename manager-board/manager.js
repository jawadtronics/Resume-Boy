const fromInput = document.querySelector("#filter-from");
const toInput = document.querySelector("#filter-to");
const userSelect = document.querySelector("#filter-user");
const applyButton = document.querySelector("#apply-filters");
const clearButton = document.querySelector("#clear-filters");
const stateNode = document.querySelector("#manager-state");
const usersTable = document.querySelector("#users-table");
const dailyList = document.querySelector("#daily-list");
const recentList = document.querySelector("#recent-list");
const userCountLabel = document.querySelector("#user-count-label");

let lastUsers = [];

window.addEventListener("load", () => {
  document.body.classList.add("is-ready");
  setDefaultDates();
  loadManagerSummary();
});

applyButton.addEventListener("click", loadManagerSummary);
clearButton.addEventListener("click", () => {
  fromInput.value = "";
  toInput.value = "";
  userSelect.value = "";
  loadManagerSummary();
});

function setDefaultDates() {
  const now = new Date();
  const prior = new Date(now);
  prior.setDate(now.getDate() - 7);
  fromInput.value = toDateInputValue(prior);
  toInput.value = toDateInputValue(now);
}

async function loadManagerSummary() {
  setState("Loading manager dashboard...");
  const params = new URLSearchParams();
  if (fromInput.value) params.set("from", fromInput.value);
  if (toInput.value) params.set("to", toInput.value);
  if (userSelect.value) params.set("user_id", userSelect.value);

  try {
    const response = await fetch(`/api/manager/summary?${params}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load manager dashboard.");

    renderSummary(payload);
    setState("Updated");
  } catch (error) {
    console.error("[manager] Load failed", error);
    setState(error.message, "error");
  }
}

function renderSummary(payload) {
  const totals = payload.totals || {};
  document.querySelector("#stat-users").textContent = formatNumber(totals.users);
  document.querySelector("#stat-generations").textContent = formatNumber(totals.generations);
  document.querySelector("#stat-range-generations").textContent = formatNumber(totals.rangeGenerations);
  document.querySelector("#stat-today-generations").textContent = formatNumber(totals.todayGenerations);

  lastUsers = payload.users || [];
  renderUserFilter(lastUsers);
  renderUsers(lastUsers);
  renderDaily(payload.daily || []);
  renderRecent(payload.recentGenerations || []);
}

function renderUserFilter(users) {
  const selected = userSelect.value;
  userSelect.innerHTML = '<option value="">All users</option>';
  users.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.name || "Unnamed user"}${user.email ? ` (${user.email})` : ""}`;
    userSelect.appendChild(option);
  });
  userSelect.value = selected;
}

function renderUsers(users) {
  userCountLabel.textContent = `${users.length} user${users.length === 1 ? "" : "s"}`;
  usersTable.innerHTML = "";

  if (!users.length) {
    usersTable.innerHTML = '<tr><td colspan="6">No users found for this filter.</td></tr>';
    return;
  }

  users.forEach((user) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <strong>${escapeHtml(user.name || "Unnamed user")}</strong>
        <small>${escapeHtml(user.email || user.id)}</small>
      </td>
      <td>${escapeHtml(user.planId || "free")}</td>
      <td>${formatNumber(user.totalGenerations)}</td>
      <td>${formatNumber(user.rangeGenerations)}</td>
      <td>${formatNumber(user.todayGenerations)}</td>
      <td>${user.creditsRemaining ?? "Unlimited"}</td>
    `;
    usersTable.appendChild(row);
  });
}

function renderDaily(items) {
  dailyList.innerHTML = "";
  if (!items.length) {
    dailyList.innerHTML = '<p class="empty-copy">No daily activity in this range.</p>';
    return;
  }

  const max = Math.max(...items.map((item) => Number(item.count || 0)), 1);
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "daily-row";
    row.innerHTML = `
      <span>${escapeHtml(item.date)}</span>
      <i><b style="width:${Math.max(6, (Number(item.count || 0) / max) * 100)}%"></b></i>
      <strong>${formatNumber(item.count)}</strong>
    `;
    dailyList.appendChild(row);
  });
}

function renderRecent(items) {
  recentList.innerHTML = "";
  if (!items.length) {
    recentList.innerHTML = '<p class="empty-copy">No recent generations in this range.</p>';
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "recent-row";
    row.innerHTML = `
      <strong>${escapeHtml(item.title || "Untitled generation")}</strong>
      <span>${escapeHtml(item.userName || "Unknown user")} / ${formatDate(item.createdAt)}</span>
    `;
    recentList.appendChild(row);
  });
}

function setState(message, tone = "") {
  stateNode.textContent = message;
  stateNode.dataset.tone = tone;
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
