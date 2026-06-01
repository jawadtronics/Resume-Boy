const form = document.querySelector("#resume-flow-form");
const steps = Array.from(document.querySelectorAll(".flow-step"));
const progressItems = Array.from(document.querySelectorAll("[data-progress]"));
const sourceButtons = Array.from(document.querySelectorAll(".source-choice"));
const templateButtons = Array.from(document.querySelectorAll(".template-card"));
const selectedSourceInput = document.querySelector("#selected-source");
const selectedTemplateInput = document.querySelector("#selected-template");
const selectedModelInput = document.querySelector("#selected-model-tier");
const sourceNextButton = document.querySelector("#source-next");
const detailsNextButton = document.querySelector("#details-next");
const startButton = document.querySelector("#start-button");
const jobInput = document.querySelector("#job-input");
const jobHint = document.querySelector("#job-hint");
const templateLockCopy = document.querySelector("#template-lock-copy");
const modelButtons = Array.from(document.querySelectorAll("[data-model-tier]"));
const modelLockCopy = document.querySelector("#model-lock-copy");
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
let selectedModelTier = "basic";
let currentPlanId = "free";
let detailsSent = false;

window.addEventListener("load", () => {
  document.body.classList.add("is-ready");
  checkCredits();
});

document.querySelectorAll("[data-plan-upgrade]").forEach((button) => {
  button.addEventListener("click", () => startPlanUpgrade(button.dataset.planUpgrade, button));
});

modelButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextTier = button.dataset.modelTier || "basic";
    if (nextTier === "pro" && currentPlanId !== "elite") {
      selectedModelTier = "basic";
      if (modelLockCopy) modelLockCopy.textContent = "Pro requires the Elite plan.";
    } else {
      selectedModelTier = nextTier;
      if (modelLockCopy) {
        modelLockCopy.textContent = selectedModelTier === "pro"
          ? "Using Gemini 3.5 for this resume."
          : "Using Gemini 3.1 Flash Lite.";
      }
    }
    selectedModelInput.value = selectedModelTier;
    updateModelButtons();
  });
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

  startButton.textContent = "Opening...";
  startButton.disabled = true;
});

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
  updateModelButtons();
}

function updateModelButtons() {
  modelButtons.forEach((button) => {
    const tier = button.dataset.modelTier || "basic";
    const locked = tier === "pro" && currentPlanId !== "elite";
    button.classList.toggle("is-selected", tier === selectedModelTier);
    button.disabled = locked;
    button.title = locked ? "Elite plan required" : "";
  });
  selectedModelInput.value = selectedModelTier;
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
    currentPlanId = profile.plan_id || "free";
    if (currentPlanId !== "elite" && selectedModelTier === "pro") {
      selectedModelTier = "basic";
    }
    if (modelLockCopy) {
      modelLockCopy.textContent = currentPlanId === "elite"
        ? "Elite can use Basic or Pro."
        : "Pro is available on Elite.";
    }
    updateModelButtons();
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
