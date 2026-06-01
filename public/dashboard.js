const form = document.querySelector("#resume-flow-form");
const steps = Array.from(document.querySelectorAll(".flow-step"));
const progressItems = Array.from(document.querySelectorAll("[data-progress]"));
const sourceButtons = Array.from(document.querySelectorAll(".source-choice"));
const templateButtons = Array.from(document.querySelectorAll(".template-card"));
const selectedSourceInput = document.querySelector("#selected-source");
const selectedTemplateInput = document.querySelector("#selected-template");
const sourceNextButton = document.querySelector("#source-next");
const detailsNextButton = document.querySelector("#details-next");
const startButton = document.querySelector("#start-button");
const jobInput = document.querySelector("#job-input");
const jobHint = document.querySelector("#job-hint");
const templateLockCopy = document.querySelector("#template-lock-copy");
const resumeLoading = document.querySelector("#resume-loading");
const loadingStage = document.querySelector("#loading-stage");
const loadingPercent = document.querySelector("#loading-percent");
const loadingBar = document.querySelector("#loading-bar");
const loadingSteps = Array.from(document.querySelectorAll("[data-loading-step]"));
const creditsPopup = document.querySelector("#credits-popup");
const creditsState = document.querySelector("#credits-state");

const sourceCopy = {
  linkedin_url: {
    placeholder: "Paste one LinkedIn job URL",
    hint: "Paste exactly one LinkedIn job URL.",
  },
  description: {
    placeholder: "Paste the full job description here...",
    hint: "Paste the full description for stronger keyword coverage.",
  },
};

let currentStep = 0;
let selectedSource = "";
let selectedTemplate = "";
let detailsSent = false;
let loadingTimer = null;

const generationStages = [
  { at: 0, pct: 8, text: "Starting the resume engine.", step: 0 },
  { at: 900, pct: 18, text: "Scraping the LinkedIn job details.", step: 0 },
  { at: 8000, pct: 32, text: "Extracting skills, experience, education, and certifications.", step: 0 },
  { at: 18000, pct: 48, text: "Syncing the job with your profile.", step: 1 },
  { at: 30000, pct: 63, text: "Choosing the strongest ATS keywords.", step: 1 },
  { at: 42000, pct: 76, text: "Generating your LaTeX resume.", step: 2 },
  { at: 58000, pct: 87, text: "Polishing bullets and template formatting.", step: 2 },
  { at: 76000, pct: 94, text: "Almost there. Opening the editor next.", step: 3 },
];

window.addEventListener("load", () => {
  document.body.classList.add("is-ready");
  checkCredits();
});

document.querySelectorAll("[data-plan-upgrade]").forEach((button) => {
  button.addEventListener("click", () => startPlanUpgrade(button.dataset.planUpgrade, button));
});

sourceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const changedSource = selectedSource && selectedSource !== button.dataset.source;
    selectedSource = button.dataset.source;
    selectedSourceInput.value = selectedSource;
    sourceButtons.forEach((item) => item.classList.toggle("is-selected", item === button));

    const copy = sourceCopy[selectedSource] || sourceCopy.description;
    jobInput.placeholder = copy.placeholder;
    jobHint.textContent = copy.hint;
    if (changedSource) {
      jobInput.value = "";
    }
    detailsSent = false;
    selectedTemplate = "";
    selectedTemplateInput.value = "";
    templateButtons.forEach((item) => item.classList.remove("is-selected"));
    sourceNextButton.disabled = false;
    updateState();
  });
});

sourceNextButton.addEventListener("click", () => {
  if (!selectedSource) return;
  showStep(1);
});

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => showStep(Math.max(0, currentStep - 1)));
});

jobInput.addEventListener("input", () => {
  detailsSent = false;
  selectedTemplate = "";
  selectedTemplateInput.value = "";
  templateButtons.forEach((button) => button.classList.remove("is-selected"));
  updateState();
});

detailsNextButton.addEventListener("click", () => {
  if (!hasJobDetails()) return;
  detailsSent = true;
  updateState();
  showStep(2);
});

templateButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!detailsSent) return;
    selectedTemplate = button.dataset.template;
    selectedTemplateInput.value = selectedTemplate;
    templateButtons.forEach((item) => item.classList.toggle("is-selected", item === button));
    updateState();
  });
});

form.addEventListener("submit", (event) => {
  if (!selectedSource || !hasJobDetails() || !selectedTemplate) {
    event.preventDefault();
    return;
  }

  if (resumeLoading) {
    resumeLoading.setAttribute("aria-hidden", "false");
    resumeLoading.classList.add("is-visible");
    startGenerationProgress();
  }
  startButton.textContent = "Generating...";
  startButton.disabled = true;
});

function startGenerationProgress() {
  if (loadingTimer) window.clearInterval(loadingTimer);
  const startedAt = Date.now();
  renderGenerationProgress(generationStages[0]);

  loadingTimer = window.setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const currentStage = generationStages.reduce((active, stage) => (
      elapsed >= stage.at ? stage : active
    ), generationStages[0]);
    const nextStage = generationStages.find((stage) => stage.at > elapsed);
    let pct = currentStage.pct;

    if (nextStage) {
      const span = Math.max(nextStage.at - currentStage.at, 1);
      const progress = Math.min(Math.max((elapsed - currentStage.at) / span, 0), 1);
      pct = Math.round(currentStage.pct + (nextStage.pct - currentStage.pct) * progress);
    } else {
      pct = Math.min(98, currentStage.pct + Math.floor((elapsed - currentStage.at) / 12000));
    }

    renderGenerationProgress({ ...currentStage, pct });
  }, 500);
}

function renderGenerationProgress(stage) {
  if (loadingStage) loadingStage.textContent = stage.text;
  if (loadingPercent) loadingPercent.textContent = `${stage.pct}%`;
  if (loadingBar) loadingBar.style.width = `${stage.pct}%`;
  loadingSteps.forEach((item, index) => {
    item.classList.toggle("is-active", index <= stage.step);
  });
}

function showStep(index) {
  currentStep = index;
  steps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex === index);
  });
  progressItems.forEach((item, itemIndex) => {
    item.classList.toggle("is-active", itemIndex <= index);
  });

  const focusTarget = steps[index].querySelector("textarea, button:not(:disabled)");
  if (focusTarget) window.setTimeout(() => focusTarget.focus(), 180);
}

function hasJobDetails() {
  const value = jobInput.value.trim();
  if (!selectedSource || !value) return false;
  if (selectedSource === "linkedin_url") {
    return isSingleLinkedInJobUrl(value);
  }
  return value.length >= 20;
}

function updateState() {
  const detailsReady = hasJobDetails();
  detailsNextButton.disabled = !detailsReady;

  templateButtons.forEach((button) => {
    button.disabled = !detailsSent;
    button.classList.toggle("is-locked", !detailsSent);
  });

  templateLockCopy.textContent = detailsSent
    ? "Pick the layout you want to start with."
    : "Send the job details first, then choose a template.";

  startButton.disabled = !(detailsSent && selectedTemplate);
}

function isSingleLinkedInJobUrl(value) {
  const trimmed = value.trim();
  const urls = trimmed.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/jobs\/[^\s,]+/gi) || [];
  if (urls.length !== 1) return false;
  const extraText = trimmed.replace(urls[0], "").trim();
  return !extraText && extractLinkedInJobId(urls[0]);
}

function extractLinkedInJobId(value) {
  try {
    const withProtocol = value.startsWith("http") ? value : `https://${value}`;
    const url = new URL(withProtocol.replace(/[)\].,]+$/g, ""));
    const pathMatch = url.pathname.match(/\/jobs\/view\/.*?(\d{6,})(?:\/|$)/i);
    return pathMatch?.[1] || url.searchParams.get("currentJobId") || "";
  } catch {
    const fallback = value.match(/(?:jobs\/view\/.*?|currentJobId=)(\d{6,})/i);
    return fallback?.[1] || "";
  }
}

updateState();

async function checkCredits() {
  if (!creditsPopup) return;

  try {
    const response = await fetch("/api/profile", { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) return;
    const profile = payload.profile || {};
    const remaining = Number(profile.credits_remaining ?? 0);
    if (profile.plan_id === "free" && remaining <= 0 && profile.onboarding_status === false) {
      creditsPopup.hidden = false;
    }
  } catch (error) {
    console.error("[credits] Could not check credits", error);
  }
}

async function startPlanUpgrade(planId, button) {
  if (!planId) return;
  button.disabled = true;
  creditsState.textContent = "Preparing checkout...";

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
      return;
    }
    window.location.reload();
  } catch (error) {
    console.error("[credits] Upgrade failed", error);
    creditsState.textContent = error.message;
    button.disabled = false;
  }
}
