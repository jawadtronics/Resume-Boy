const steps = Array.from(document.querySelectorAll(".type-step"));
const jobInput = document.querySelector("#job-input");
const addJobButton = document.querySelector("#add-job");
const jobTags = document.querySelector("#job-tags");
const jobItemsInput = document.querySelector("#job-items");
const sourceChoices = Array.from(document.querySelectorAll("input[name='source_type']"));
const sourcePanels = Array.from(document.querySelectorAll(".source-panel"));
const form = document.querySelector(".typeform-card");
const loadingOverlay = document.querySelector(".loading-overlay");
let currentStep = 0;
let jobs = [];

function showStep(index) {
  currentStep = index;
  steps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex === index);
  });

  const input = steps[index].querySelector("input:not([type='hidden'])");
  if (input) window.setTimeout(() => input.focus(), 180);
}

function addJob() {
  const value = jobInput.value.trim();
  if (!value || jobs.includes(value)) return;
  jobs = [...jobs, value];
  jobInput.value = "";
  syncJobs();
}

function syncJobs() {
  jobItemsInput.value = JSON.stringify(jobs);
  jobTags.innerHTML = jobs
    .map((job, index) => `<button type="button" class="tag-pill" data-index="${index}">${escapeHtml(job)}<span>×</span></button>`)
    .join("");
}

addJobButton.addEventListener("click", addJob);

jobInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    if (jobInput.value.trim()) {
      addJob();
      return;
    }
    if (jobs.length) showStep(1);
  }
});

document.querySelector("[data-next]").addEventListener("click", () => {
  addJob();
  if (jobs.length) showStep(1);
});

document.querySelector("[data-back]").addEventListener("click", () => showStep(0));

jobTags.addEventListener("click", (event) => {
  const button = event.target.closest("[data-index]");
  if (!button) return;
  jobs = jobs.filter((_, index) => index !== Number(button.dataset.index));
  syncJobs();
});

sourceChoices.forEach((choice) => {
  choice.addEventListener("change", () => {
    sourcePanels.forEach((panel) => {
      panel.hidden = panel.dataset.source !== choice.value;
    });
  });
});

form.addEventListener("submit", () => {
  addJob();
  loadingOverlay.setAttribute("aria-hidden", "false");
  loadingOverlay.classList.add("is-visible");
});

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
