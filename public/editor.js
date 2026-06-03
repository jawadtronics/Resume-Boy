const storageKey = "resmaker_generated_latex";
const finalLatexKey = "resmaker_final_latex";
const sourceTextarea = document.querySelector("#latex-source");
const aiEditForm = document.querySelector("#ai-edit-form");
const aiEditInput = document.querySelector("#ai-edit-input");
const saveButton = document.querySelector("#save-button");
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
let currentPdfSourceUrl =
  embeddedEditorData.pdfUrl ||
  sessionStorage.getItem("resmaker_generated_pdf_url") ||
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
if (currentPdfSourceUrl) {
  sessionStorage.setItem("resmaker_generated_pdf_url", currentPdfSourceUrl);
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
if (currentPdfSourceUrl) {
  showPdfUrl(currentPdfSourceUrl);
} else {
  window.setTimeout(() => compileLatex(), 350);
}

editor.on("change", () => {
  setStatus(autosaveStatus, "Auto-saving...");
  sessionStorage.setItem(storageKey, editor.getValue());
  scheduleCompile();
  scheduleDraftSave();
});

aiEditForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await applyAiEdit();
});

saveButton?.addEventListener("click", async () => {
  sessionStorage.setItem(finalLatexKey, editor.getValue());
  if (generationId) {
    await saveLatexDraft();
  } else {
    setStatus(autosaveStatus, "Saved");
  }
});

downloadButton.addEventListener("click", async () => {
  if (!currentPdfBlob && !currentPdfSourceUrl) return;
  sessionStorage.setItem(finalLatexKey, editor.getValue());
  const previousText = downloadButton.textContent;
  downloadButton.disabled = true;
  downloadButton.textContent = "Downloading...";
  try {
    const saved = generationId ? await saveGenerationPdf() : null;
    if (saved?.pdf_url) {
      currentPdfSourceUrl = saved.pdf_url;
      sessionStorage.setItem("resmaker_generated_pdf_url", currentPdfSourceUrl);
    }
    await downloadCurrentPdf();
    downloadButton.textContent = "Downloaded";
    window.setTimeout(() => {
      downloadButton.textContent = previousText;
      downloadButton.disabled = false;
    }, 900);
  } catch (error) {
    console.error("[editor] Download failed", error);
    showCompileError("Could not download PDF.", error.message);
    downloadButton.textContent = previousText;
    downloadButton.disabled = false;
  }
});

nextButton.addEventListener("click", () => {
  sessionStorage.setItem(finalLatexKey, editor.getValue());
  window.location.href = "/app";
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

async function applyAiEdit() {
  const instruction = aiEditInput?.value.trim() || "";
  const latex = editor.getValue();
  if (!instruction || !latex.trim()) return;

  const previousPlaceholder = aiEditInput.placeholder;
  aiEditInput.disabled = true;
  aiEditInput.value = "";
  aiEditInput.placeholder = "Making changes with AI...";
  setStatus(autosaveStatus, "AI editing...");

  try {
    const response = await fetch("/api/latex/edit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ latex, instruction }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "AI edit failed.");
    }

    const updatedLatex = normalizeLatexForEditor(payload.latex || "");
    if (!updatedLatex.trim()) {
      throw new Error("AI returned an empty LaTeX document.");
    }

    editor.setValue(updatedLatex);
    sessionStorage.setItem(storageKey, updatedLatex);
    sessionStorage.setItem(finalLatexKey, updatedLatex);
    setStatus(autosaveStatus, "Updated");
    window.clearTimeout(compileTimer);
    await compileLatex();
    scheduleDraftSave();
  } catch (error) {
    console.error("[editor] AI edit failed", error);
    setStatus(autosaveStatus, "AI edit failed");
    showCompileError("Could not apply the AI edit.", error.message);
  } finally {
    aiEditInput.disabled = false;
    aiEditInput.placeholder = previousPlaceholder;
    aiEditInput.focus();
  }
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
  currentPdfSourceUrl = "";
  currentPdfUrl = URL.createObjectURL(pdfBlob);
  if (pdfPreview) pdfPreview.src = currentPdfUrl;
  if (emptyPreview) emptyPreview.hidden = true;
  downloadButton.disabled = false;
  setStatus(compileStatus, "Compiled");
  compileLog.textContent = "";
  compileLogPanel.open = false;
}

function showPdfUrl(pdfUrl) {
  if (!pdfUrl) return;
  if (currentPdfUrl) URL.revokeObjectURL(currentPdfUrl);
  currentPdfBlob = null;
  currentPdfUrl = "";
  currentPdfSourceUrl = pdfUrl;
  if (pdfPreview) pdfPreview.src = pdfUrl;
  if (emptyPreview) emptyPreview.hidden = true;
  downloadButton.disabled = false;
  setStatus(compileStatus, "Compiled");
  compileLog.textContent = "";
  compileLogPanel.open = false;
}

function showCompileError(message, log) {
  setStatus(compileStatus, "Error");
  downloadButton.disabled = !currentPdfBlob && !currentPdfSourceUrl;
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
    if (payload?.pdf_url) {
      showPdfUrl(payload.pdf_url);
    }
    return payload;
  } catch (error) {
    console.error("[editor] PDF save failed", error);
    showCompileError("Could not save PDF.", error.message);
    return null;
  }
}

async function downloadCurrentPdf() {
  let blob = currentPdfBlob;
  if (!blob && currentPdfSourceUrl) {
    const response = await fetch(currentPdfSourceUrl);
    if (!response.ok) throw new Error("Could not fetch the saved PDF.");
    blob = await response.blob();
  }
  if (!blob) throw new Error("No compiled PDF is available yet.");

  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = "resume-boy-resume.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 650);
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
  if (value.includes("compiling") || value.includes("saving") || value.includes("editing")) return "busy";
  if (value.includes("compiled") || value.includes("saved") || value.includes("updated")) return "success";
  if (value.includes("error") || value.includes("failed") || value.includes("fix")) return "error";
  return "neutral";
}
