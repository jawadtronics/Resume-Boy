const modeInput = document.querySelector("#mode");
const title = document.querySelector("#login-title");
const submitButton = document.querySelector("#submit-button");
const toggleButton = document.querySelector("#toggle-mode");
const toggleCopy = document.querySelector("#toggle-copy");
const signupFields = document.querySelectorAll(".signup-field");
const nameInput = document.querySelector("#name");
const passwordInput = document.querySelector("#password");
const confirmPasswordInput = document.querySelector("#confirm-password");

let isSignup = false;

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
