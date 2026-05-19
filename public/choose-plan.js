const plansGrid = document.querySelector("#choose-plan-grid");
const stateNode = document.querySelector("#choose-plan-state");
const planTemplate = document.querySelector("#choose-plan-card-template");

let selectedPlan = "";

window.addEventListener("load", () => {
  document.body.classList.add("is-ready");
  loadPlans();
});

async function loadPlans() {
  try {
    const response = await fetch("/api/profile", { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load plans.");

    const profile = payload.profile || {};
    const currentPlanId = profile.plan_selection_required ? "" : profile.plan_id || "free";
    renderPlans(payload.plans || [], currentPlanId);
  } catch (error) {
    console.error("[choose-plan] Load failed", error);
    plansGrid.innerHTML = `<div class="choose-plan-loading is-error">${escapeHtml(error.message)}</div>`;
  }
}

function renderPlans(plans, currentPlanId) {
  plansGrid.innerHTML = "";
  const currentRank = currentPlanId ? planRank(currentPlanId) : -1;

  plans.forEach((plan) => {
    const card = planTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.plan = plan.id;
    card.querySelector("small").textContent = badgeForPlan(plan);
    card.querySelector("h2").textContent = plan.name;
    card.querySelector(".choose-plan-price").innerHTML = priceHtml(plan);

    const featureList = card.querySelector("ul");
    (Array.isArray(plan.features) ? plan.features : []).slice(0, 6).forEach((feature) => {
      const item = document.createElement("li");
      item.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">check</span>${escapeHtml(feature)}`;
      featureList.appendChild(item);
    });

    const button = card.querySelector("button");
    const isDowngrade = planRank(plan.id) < currentRank;
    button.textContent = plan.id === currentPlanId ? "Current Plan" : Number(plan.price_cents || 0) === 0 ? "Choose Free" : `Choose ${plan.name}`;
    button.disabled = plan.id === currentPlanId || isDowngrade;
    button.hidden = isDowngrade;
    if (!button.disabled) {
      button.addEventListener("click", () => selectPlan(plan.id, button));
    }

    if (plan.id === currentPlanId) {
      card.classList.add("is-current");
    }

    plansGrid.appendChild(card);
  });
}

async function selectPlan(planId, button) {
  selectedPlan = planId;
  stateNode.textContent = "Preparing your plan...";
  document.querySelectorAll(".choose-plan-card").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.plan === planId);
  });
  document.querySelectorAll(".choose-plan-card button").forEach((planButton) => {
    planButton.disabled = true;
  });

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
      stateNode.textContent = "Opening SafePay checkout...";
      window.location.assign(payload.checkout_url);
      return;
    }

    window.location.assign(payload.redirect_url || "/app");
  } catch (error) {
    console.error("[choose-plan] Selection failed", { selectedPlan, error });
    stateNode.textContent = error.message;
    loadPlans();
    if (button) button.focus();
  }
}

function badgeForPlan(plan) {
  if (plan.id === "free") return "Base access";
  if (plan.id === "standard") return "Limited offer";
  if (plan.id === "elite") return "Unlimited";
  return "Available";
}

function priceHtml(plan) {
  if (Number(plan.price_cents || 0) === 0) return "Free";
  const amount = `$${(Number(plan.price_cents || 0) / 100).toFixed(Number(plan.price_cents) % 100 ? 2 : 0)}`;
  return `${amount}<span>/${escapeHtml(plan.billing_period || "year")}</span>`;
}

function planRank(planId) {
  return { free: 0, standard: 1, elite: 2 }[planId] ?? 0;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
