const historyList = document.querySelector("#history-list");
const historyCount = document.querySelector("#history-count");
const rowTemplate = document.querySelector("#history-row-template");

let historyItems = [];
let activeId = "";

window.addEventListener("load", () => {
  document.body.classList.add("is-ready");
  loadHistory();
});

async function loadHistory() {
  historyList.innerHTML = '<div class="history-loading">Loading generations...</div>';

  try {
    const response = await fetch("/api/history", { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load history.");

    historyItems = payload.items || [];
    renderHistoryList();
  } catch (error) {
    console.error("[history] Load failed", error);
    historyList.innerHTML = `<div class="history-loading is-error">${escapeHtml(error.message)}</div>`;
  }
}

function renderHistoryList() {
  historyCount.textContent = `${historyItems.length} generation${historyItems.length === 1 ? "" : "s"}`;
  historyList.innerHTML = "";

  if (!historyItems.length) {
    historyList.innerHTML = `
      <div class="history-loading">
        <strong>No resumes yet.</strong>
        <span>Generate your first ATS resume from the dashboard.</span>
      </div>
    `;
    return;
  }

  historyItems.forEach((item, index) => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = item.id;
    row.classList.toggle("is-active", item.id === activeId);
    row.querySelector(".history-row-index").textContent = String(index + 1).padStart(2, "0");
    row.querySelector(".history-row-title").textContent = item.title || "Untitled generation";
    row.querySelector(".history-row-meta").textContent = [
      item.status || "generated",
      formatDate(item.created_at),
    ].filter(Boolean).join(" / ");
    row.addEventListener("click", () => openHistoryItem(item.id));
    historyList.appendChild(row);
  });
}

function openHistoryItem(id) {
  activeId = id;
  renderHistoryList();
  window.location.href = `/history/${encodeURIComponent(id)}/editor`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
