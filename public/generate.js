const generationInputNode = document.querySelector("#generation-input");
const stageNode = document.querySelector("#generate-stage");
const percentNode = document.querySelector("#generate-percent");
const barNode = document.querySelector("#generate-bar");
const stepNodes = Array.from(document.querySelectorAll("[data-generate-step]"));
const errorNode = document.querySelector("#generate-error");
const errorCopy = errorNode?.querySelector("p");

const storageKey = "resmaker_generated_latex";
const finalLatexKey = "resmaker_final_latex";
let displayedPercent = 1;
let targetPercent = 8;
let progressTimer = null;

const input = readGenerationInput();

window.addEventListener("load", () => {
  document.body.classList.add("is-ready");
  startSmoothProgress();
  runGeneration();
});

async function runGeneration() {
  try {
    setStage({
      text: "Scraping and reading the target job.",
      target: input.sourceType === "linkedin_url" ? 30 : 24,
      step: 0,
    });
    const jobPayload = await postJson("/api/generation/job-details", {
      job_source: input.sourceType,
      job_input: input.jobInput,
      template: input.templateId,
      model_tier: input.modelTier || "basic",
    });

    setStage({
      text: "Syncing the job requirements with your profile.",
      target: 48,
      step: 1,
    });
    await pause(500);

    setStage({
      text: "Writing a tailored ATS-friendly LaTeX resume.",
      target: 78,
      step: 2,
    });
    const latexPayload = await postJson("/api/generation/latex", {
      source_type: jobPayload.sourceType,
      template: jobPayload.templateId,
      model_tier: jobPayload.modelTier || input.modelTier || "basic",
      job_details: jobPayload.jobDetails,
    });

    setStage({
      text: "Compiling and saving the PDF preview.",
      target: 96,
      step: 3,
    });
    const finalPayload = await postJson("/api/generation/finalize", {
      source_type: jobPayload.sourceType,
      template: jobPayload.templateId,
      job_url: jobPayload.normalizedJobUrl,
      job_description: jobPayload.savedJobDescription,
      job_details: jobPayload.jobDetails,
      model_tier: jobPayload.modelTier || input.modelTier || "basic",
      latex: latexPayload.latex,
    });

    sessionStorage.setItem(storageKey, finalPayload.latex || latexPayload.latex || "");
    sessionStorage.setItem(finalLatexKey, finalPayload.latex || latexPayload.latex || "");
    if (finalPayload.generationId) {
      sessionStorage.setItem("resmaker_generation_id", finalPayload.generationId);
    }
    if (finalPayload.pdfUrl) {
      sessionStorage.setItem("resmaker_generated_pdf_url", finalPayload.pdfUrl);
    }

    setStage({
      text: "Complete. Opening your editor.",
      target: 100,
      step: 3,
    });
    await pause(650);
    window.location.href = finalPayload.redirectUrl || "/editor";
  } catch (error) {
    console.error("[generate] Generation failed", error);
    stopSmoothProgress();
    showError(error.message || "Generation failed. Please try again.");
  }
}

function readGenerationInput() {
  try {
    return JSON.parse(generationInputNode?.textContent || "{}");
  } catch {
    return {};
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function startSmoothProgress() {
  stopSmoothProgress();
  renderProgress();
  progressTimer = window.setInterval(() => {
    if (displayedPercent < targetPercent) {
      displayedPercent += 1;
    } else if (displayedPercent < 98) {
      displayedPercent += Math.random() > 0.72 ? 1 : 0;
    }
    displayedPercent = Math.min(displayedPercent, 100);
    renderProgress();
  }, 260);
}

function stopSmoothProgress() {
  if (progressTimer) window.clearInterval(progressTimer);
  progressTimer = null;
}

function setStage({ text, target, step }) {
  if (stageNode) stageNode.textContent = text;
  targetPercent = Math.max(targetPercent, Number(target || 0));
  stepNodes.forEach((item, index) => item.classList.toggle("is-active", index <= step));
}

function renderProgress() {
  if (percentNode) percentNode.textContent = `${Math.round(displayedPercent)}%`;
  if (barNode) barNode.style.width = `${Math.round(displayedPercent)}%`;
}

function showError(message) {
  if (stageNode) stageNode.textContent = "Something blocked the generation.";
  if (errorCopy) errorCopy.textContent = message;
  if (errorNode) errorNode.hidden = false;
}

function pause(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
