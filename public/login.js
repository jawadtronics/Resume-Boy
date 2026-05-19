const modeInput = document.querySelector("#mode");
const title = document.querySelector("#login-title");
const submitButton = document.querySelector("#submit-button");
const toggleButton = document.querySelector("#toggle-mode");
const toggleCopy = document.querySelector("#toggle-copy");
const signupFields = document.querySelectorAll(".signup-field");
const nameInput = document.querySelector("#name");
const passwordInput = document.querySelector("#password");
const confirmPasswordInput = document.querySelector("#confirm-password");
const forgotPasswordButton = document.querySelector("#forgot-password");
const resetModal = document.querySelector("#password-reset-modal");
const resetCloseButton = document.querySelector("#password-reset-close");
const resetForm = document.querySelector("#password-reset-form");
const resetCopy = document.querySelector("#password-reset-copy");
const resetEmailStep = document.querySelector("#password-reset-email-step");
const resetCodeStep = document.querySelector("#password-reset-code-step");
const resetEmailInput = document.querySelector("#password-reset-email");
const resetCodeInput = document.querySelector("#password-reset-code");
const resetNewPasswordInput = document.querySelector("#password-reset-new");
const resetConfirmPasswordInput = document.querySelector("#password-reset-confirm");
const resetSubmitButton = document.querySelector("#password-reset-submit");
const resetState = document.querySelector("#password-reset-state");

let isSignup = false;
let resetStep = "email";

toggleButton.addEventListener("click", () => {
  isSignup = !isSignup;
  modeInput.value = isSignup ? "signup" : "login";
  title.textContent = isSignup ? "Create your account" : "Log into your account";
  submitButton.textContent = isSignup ? "Sign up" : "Login";
  toggleCopy.textContent = isSignup ? "Already have an account?" : "Don't have an account?";
  toggleButton.textContent = isSignup ? "Login" : "Sign up";
  passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
  nameInput.required = isSignup;
  confirmPasswordInput.required = isSignup;

  signupFields.forEach((field) => {
    field.hidden = !isSignup;
  });
});

if (forgotPasswordButton && resetModal && resetForm) {
  forgotPasswordButton.addEventListener("click", openPasswordReset);
  resetCloseButton?.addEventListener("click", closePasswordReset);
  resetModal.addEventListener("click", (event) => {
    if (event.target === resetModal) closePasswordReset();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !resetModal.hidden) closePasswordReset();
  });
  resetForm.addEventListener("submit", handlePasswordResetSubmit);
}

function openPasswordReset() {
  resetStep = "email";
  resetForm.reset();
  resetEmailInput.value = document.querySelector("#email")?.value || "";
  resetModal.hidden = false;
  setResetStep("email");
  setResetState("");
  window.requestAnimationFrame(() => resetEmailInput.focus());
}

function closePasswordReset() {
  resetModal.hidden = true;
  setResetState("");
}

function setResetStep(step) {
  resetStep = step;
  const isCodeStep = step === "code";
  resetEmailStep.hidden = isCodeStep;
  resetCodeStep.hidden = !isCodeStep;
  resetCodeInput.disabled = !isCodeStep;
  resetNewPasswordInput.disabled = !isCodeStep;
  resetConfirmPasswordInput.disabled = !isCodeStep;
  resetSubmitButton.textContent = isCodeStep ? "Update password" : "Next";
  resetCopy.textContent = isCodeStep
    ? "Enter the code from your email, then choose a new password."
    : "Enter your account email and we will send a short verification code.";
}

function setResetState(message, tone = "") {
  resetState.textContent = message;
  resetState.dataset.tone = tone;
}

async function handlePasswordResetSubmit(event) {
  event.preventDefault();
  resetSubmitButton.disabled = true;

  try {
    if (resetStep === "email") {
      await startPasswordReset();
      return;
    }

    await confirmPasswordReset();
  } catch (error) {
    console.error("[login] Password reset failed", error);
    setResetState(error.message || "Password reset failed.", "error");
  } finally {
    resetSubmitButton.disabled = false;
  }
}

async function startPasswordReset() {
  const email = resetEmailInput.value.trim();
  if (!email) throw new Error("Enter your email address.");
  setResetState("Sending code...", "pending");

  const response = await fetch("/api/auth/password-reset/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ email }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not send the reset code.");

  setResetStep("code");
  setResetState(payload.message || "Code sent. Check your email.", "success");
  resetCodeInput.focus();
}

async function confirmPasswordReset() {
  const response = await fetch("/api/auth/password-reset/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      email: resetEmailInput.value.trim(),
      code: resetCodeInput.value.trim(),
      password: resetNewPasswordInput.value,
      confirm_password: resetConfirmPasswordInput.value,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not update the password.");

  document.querySelector("#email").value = resetEmailInput.value.trim();
  passwordInput.value = "";
  setResetState(payload.message || "Password updated. You can log in now.", "success");
  resetSubmitButton.textContent = "Done";
  setTimeout(closePasswordReset, 1200);
}
