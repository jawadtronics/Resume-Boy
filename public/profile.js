const nameInput = document.querySelector("#profile-name");
const emailNode = document.querySelector("#profile-email");
const initialsNode = document.querySelector("#profile-initials");
const totalGenerationsNode = document.querySelector("#total-generations");
const leftCreditsNode = document.querySelector("#left-credits");
const currentPlanNode = document.querySelector("#current-plan");
const descriptionInput = document.querySelector("#profile-description");
const plansGrid = document.querySelector("#plans-grid");
const planTemplate = document.querySelector("#plan-card-template");
const saveButton = document.querySelector("#save-profile");
const saveState = document.querySelector("#profile-save-state");

let profileData = null;

window.addEventListener("load", () => {
  document.body.classList.add("is-ready");
  loadProfile();
});

saveButton.addEventListener("click", saveProfile);

async function loadProfile() {
  try {
    const response = await fetch("/api/profile", { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load profile.");

    profileData = payload;
    renderProfile(payload);
  } catch (error) {
    console.error("[profile] Load failed", error);
    saveState.textContent = error.message;
  }
}

function renderProfile(payload) {
  const profile = payload.profile || {};
  const stats = payload.stats || {};

  nameInput.value = profile.name || "Resume Boy User";
  descriptionInput.value = profile.profile_details || "";
  emailNode.textContent = profile.email || "";
  initialsNode.textContent = getInitials(profile.name || profile.email || "R");
  totalGenerationsNode.textContent = formatNumber(stats.totalGenerations || 0);
  leftCreditsNode.textContent = String(stats.leftCredits ?? 0);
  currentPlanNode.textContent = stats.currentPlan || "Free";
  renderPlans(payload.plans || [], profile.plan_id || "free");
}

function renderPlans(plans, currentPlanId) {
  plansGrid.innerHTML = "";
  const currentRank = planRank(currentPlanId);

  plans.forEach((plan) => {
    const card = planTemplate.content.firstElementChild.cloneNode(true);
    const isCurrent = plan.id === currentPlanId;
    const isDowngrade = planRank(plan.id) < currentRank;
    card.classList.toggle("is-current", isCurrent);
    card.querySelector("h2").textContent = `${plan.name} Plan`;
    card.querySelector(".plan-subtitle").textContent = subtitleForPlan(plan);
    card.querySelector(".plan-badge").textContent = isCurrent ? "Current" : "Available";
    card.querySelector(".plan-price").innerHTML = priceHtml(plan);
    const featureList = card.querySelector(".plan-features");
    const features = Array.isArray(plan.features) ? plan.features : [];
    features.forEach((feature) => {
      const item = document.createElement("li");
      item.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">check</span>${escapeHtml(feature)}`;
      featureList.appendChild(item);
    });

    const button = card.querySelector(".plan-button");
    button.textContent = isCurrent ? "Current Plan" : isDowngrade ? "Downgrade unavailable" : Number(plan.price_cents || 0) === 0 ? "Activate Free" : "Upgrade";
    button.disabled = isCurrent || isDowngrade;
    if (!isCurrent && !isDowngrade) {
      button.addEventListener("click", () => selectPlan(plan.id, button));
    }
    plansGrid.appendChild(card);
  });
}

async function selectPlan(planId, button) {
  button.disabled = true;
  button.textContent = "Preparing...";
  saveState.textContent = "Starting plan flow...";

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
    if (!response.ok) throw new Error(payload.error || "Could not start plan.");

    if (payload.status === "checkout" && payload.checkout_url) {
      window.location.assign(payload.checkout_url);
      return;
    }

    await loadProfile();
    saveState.textContent = "Plan updated";
  } catch (error) {
    console.error("[profile] Plan selection failed", error);
    saveState.textContent = error.message;
    button.disabled = false;
    button.textContent = Number((profileData?.plans || []).find((plan) => plan.id === planId)?.price_cents || 0) === 0 ? "Activate Free" : "Upgrade";
  }
}

async function saveProfile() {
  saveButton.disabled = true;
  saveState.textContent = "Saving...";

  try {
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        name: nameInput.value,
        profile_details: descriptionInput.value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not save profile.");

    profileData.profile = payload.profile;
    initialsNode.textContent = getInitials(payload.profile?.name || payload.profile?.email || "R");
    saveState.textContent = "Saved";
  } catch (error) {
    console.error("[profile] Save failed", error);
    saveState.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
}

function subtitleForPlan(plan) {
  if (plan.id === "free") return "For getting started";
  if (plan.id === "standard") return "Monthly standard plan";
  if (plan.id === "elite") return "For unlimited monthly scale";
  return plan.support_level || "";
}

function priceHtml(plan) {
  if (plan.price_cents === 0) return "Free";
  const dollars = `$${(Number(plan.price_cents || 0) / 100).toFixed(Number(plan.price_cents) % 100 ? 2 : 0)}`;
  return `${dollars}<span>/${escapeHtml(plan.billing_period || "year")}</span>`;
}

function getInitials(value) {
  const parts = String(value || "")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "R";
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function planRank(planId) {
  return { free: 0, standard: 1, elite: 2 }[planId] || 0;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
