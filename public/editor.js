const storageKey = "resmaker_generated_latex";
const finalLatexKey = "resmaker_final_latex";
const sourceTextarea = document.querySelector("#latex-source");
const downloadButton = document.querySelector("#download-button");
const nextButton = document.querySelector("#next-button");
const autosaveStatus = document.querySelector("#autosave-status");
const compileStatus = document.querySelector("#compile-status");
const compileLog = document.querySelector("#compile-log");
const compileLogPanel = document.querySelector("#compile-log-panel");
const pdfPreview = document.querySelector("#pdf-preview");
const emptyPreview = document.querySelector("#empty-preview");

let currentPdfBlob = null;
let currentPdfUrl = "";
let compileTimer = null;
let draftTimer = null;
let compileRequestId = 0;
const embeddedEditorData = getEmbeddedEditorData();
const generationId =
  embeddedEditorData.generationId ||
  sessionStorage.getItem("resmaker_generation_id") ||
  "";

const initialLatex =
  embeddedEditorData.latex ||
  sessionStorage.getItem(storageKey) ||
  sessionStorage.getItem(finalLatexKey) ||
  "% No generated LaTeX was found. Return to the dashboard and generate a resume first.\\n";

if (embeddedEditorData.latex) {
  sessionStorage.setItem(storageKey, initialLatex);
}
if (generationId) {
  sessionStorage.setItem("resmaker_generation_id", generationId);
}

const editor = window.CodeMirror.fromTextArea(sourceTextarea, {
  mode: "stex",
  theme: "eclipse",
  lineNumbers: true,
  lineWrapping: true,
  matchBrackets: true,
  tabSize: 2,
  indentUnit: 2,
  value: initialLatex,
});

editor.setValue(initialLatex);
window.setTimeout(() => editor.refresh(), 120);
window.setTimeout(() => compileLatex(), 350);

editor.on("change", () => {
  setStatus(autosaveStatus, "Auto-saving...");
  sessionStorage.setItem(storageKey, editor.getValue());
  scheduleCompile();
  scheduleDraftSave();
});

downloadButton.addEventListener("click", async () => {
  if (!currentPdfBlob) return;
  sessionStorage.setItem(finalLatexKey, editor.getValue());
  await saveGenerationPdf();
  const downloadUrl = URL.createObjectURL(currentPdfBlob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = "resume-boy-resume.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
    window.location.href = "/app";
  }, 650);
});

nextButton.addEventListener("click", () => {
  sessionStorage.setItem(finalLatexKey, editor.getValue());
  saveGenerationPdf().finally(() => {
    window.location.href = "/app";
  });
});

document.querySelectorAll("[data-plan-upgrade]").forEach((button) => {
  button.addEventListener("click", () => startPlanUpgrade(button.dataset.planUpgrade, button));
});

window.addEventListener("beforeunload", () => {
  if (currentPdfUrl) URL.revokeObjectURL(currentPdfUrl);
});

function scheduleCompile() {
  window.clearTimeout(compileTimer);
  compileTimer = window.setTimeout(() => compileLatex(), 1800);
}

function scheduleDraftSave() {
  if (!generationId) return;
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => saveLatexDraft(), 2600);
}

function getEmbeddedEditorData() {
  const dataNode = document.querySelector("#editor-initial-latex");
  if (!dataNode) return {};
  try {
    return JSON.parse(dataNode.textContent) || {};
  } catch {
    return {};
  }
}

async function compileLatex() {
  const currentLatex = editor.getValue();
  const latex = normalizeLatexForEditor(currentLatex);
  if (latex !== currentLatex) {
    editor.setValue(latex);
    sessionStorage.setItem(storageKey, latex);
  }
  if (!latex.trim()) return;

  const requestId = ++compileRequestId;
  setStatus(compileStatus, "Compiling...");
  compileLog.textContent = "";
  compileLogPanel.open = false;

  try {
    const response = await fetch("/api/latex/compile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/pdf, application/json",
      },
      body: JSON.stringify({ latex }),
    });

    if (requestId !== compileRequestId) return;

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      const errorPayload = contentType.includes("application/json")
        ? await response.json()
        : { error: "Compilation failed.", log: await response.text() };
      showCompileError(errorPayload.error, errorPayload.log);
      return;
    }

    if (!contentType.includes("application/pdf")) {
      const body = await response.text();
      showCompileError("The compiler did not return a PDF.", body.slice(0, 2000));
      return;
    }

    const pdfBlob = await response.blob();
    if (requestId !== compileRequestId) return;
    showPdf(pdfBlob);
  } catch (error) {
    if (requestId !== compileRequestId) return;
    showCompileError("Unable to compile LaTeX.", error.message);
  }
}

function normalizeLatexForEditor(latex) {
  return String(latex || "").replace(/^(\s*\\begin\{itemize\}\[[^\]\n]*\])\}\s*$/gim, "$1");
}

function showPdf(pdfBlob) {
  if (currentPdfUrl) URL.revokeObjectURL(currentPdfUrl);
  currentPdfBlob = pdfBlob;
  currentPdfUrl = URL.createObjectURL(pdfBlob);
  if (pdfPreview) pdfPreview.src = currentPdfUrl;
  if (emptyPreview) emptyPreview.hidden = true;
  downloadButton.disabled = false;
  setStatus(compileStatus, "Compiled");
  compileLog.textContent = "";
  compileLogPanel.open = false;
}

function showCompileError(message, log) {
  setStatus(compileStatus, "Error");
  downloadButton.disabled = !currentPdfBlob;
  compileLog.textContent = [message, log].filter(Boolean).join("\\n\\n");
  compileLogPanel.open = false;
}

async function saveLatexDraft() {
  if (!generationId) return;

  try {
    setStatus(autosaveStatus, "Auto-saving...");
    const response = await fetch(`/api/history/${encodeURIComponent(generationId)}/draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ latex: editor.getValue() }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Draft save failed.");
    }

    setStatus(autosaveStatus, "Saved");
  } catch (error) {
    console.error("[editor] Draft save failed", error);
    setStatus(autosaveStatus, "Autosave failed");
  }
}

async function saveGenerationPdf() {
  if (!generationId) {
    setStatus(autosaveStatus, currentPdfBlob ? "Saved" : "Saved");
    return null;
  }

  try {
    setStatus(autosaveStatus, "Saving...");
    const response = await fetch(`/api/history/${encodeURIComponent(generationId)}/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ latex: editor.getValue() }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      showCompileError(payload.error || "Could not save PDF.", payload.log || "");
      return null;
    }

    setStatus(autosaveStatus, "Saved");
    return payload;
  } catch (error) {
    console.error("[editor] PDF save failed", error);
    showCompileError("Could not save PDF.", error.message);
    return null;
  }
}

async function startPlanUpgrade(planId, button) {
  const state = document.querySelector("#credits-state");
  button.disabled = true;
  if (state) state.textContent = "Preparing checkout...";

  try {
    const response = await fetch("/api/plan/select", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ plan_id: planId }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not start upgrade.");
    if (payload.checkout_url) {
      window.location.assign(payload.checkout_url);
    }
  } catch (error) {
    console.error("[editor] Upgrade failed", error);
    if (state) state.textContent = error.message;
    button.disabled = false;
  }
}

function setStatus(node, text) {
  if (!node) return;
  node.textContent = text;
  node.dataset.state = statusState(text);
}

function statusState(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("compiling") || value.includes("saving")) return "busy";
  if (value.includes("compiled") || value.includes("saved")) return "success";
  if (value.includes("error") || value.includes("failed") || value.includes("fix")) return "error";
  return "neutral";
}
