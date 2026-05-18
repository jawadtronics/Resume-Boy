const path = require("path");
const crypto = require("crypto");
const os = require("os");
const fs = require("fs/promises");
const nodeFs = require("fs");
const { execFile } = require("child_process");
const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const { createClient } = require("@supabase/supabase-js");
const Safepay = require("@sfpy/node-core");
const { platformResolver: latexPlatformResolver } = require("node-latex-compiler");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const apifyLinkedInUrl = process.env.APIFY_LINKEDIN_SCRAPER_URL;
const apifyLinkedInJobUrl = process.env.APIFY_LINKEDIN_JOB_URL || buildDefaultLinkedInJobUrl();
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const latexCompileTimeoutMs = Number(process.env.LATEX_COMPILE_TIMEOUT_MS || 30000);
const safepaySecretKey = process.env.SAFEPAY_SECRET_KEY;
const safepayPublicKey = process.env.SAFEPAY_PUBLIC_KEY;
const safepayEnvironment = process.env.SAFEPAY_ENVIRONMENT || "sandbox";
const safepayHost = process.env.SAFEPAY_HOST || (safepayEnvironment === "production" ? "https://api.getsafepay.com" : "https://sandbox.api.getsafepay.com");
const safepayCurrency = process.env.SAFEPAY_CURRENCY || "USD";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const PROFILE_SELECT = "id, name, email, job, cv_details, profile_details, onboarding_status, plan_id, billing_period, credits_used, credits_remaining, plan_started_at, plan_renews_at, plan_selection_required";
let PDFParseClass;

const PLACEHOLDER_JPEG_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAARD/2gAIAQEAAT8QH//Z";

const DEEDY_RESUME_CLASS = String.raw`
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{deedy-resume}[2026/05/18 Resume Boy compatibility class]
\LoadClass[letterpaper,10pt]{article}
\RequirePackage[margin=0.55in]{geometry}
\RequirePackage{xcolor}
\RequirePackage[hidelinks]{hyperref}
\RequirePackage{enumitem}
\RequirePackage{titlesec}
\RequirePackage{ifthen}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\definecolor{primary}{HTML}{111111}
\definecolor{headings}{HTML}{111111}
\definecolor{subheadings}{HTML}{333333}
\definecolor{date}{HTML}{555555}
\titleformat{\section}{\color{headings}\scshape\raggedright\large\bfseries}{}{0em}{}[\vspace{-4pt}\titlerule]
\titlespacing{\section}{0pt}{8pt}{6pt}
\newcommand{\lastupdated}{\begin{flushright}{\footnotesize\color{date}Last updated: \today}\end{flushright}\vspace{-18pt}}
\newcommand{\namesection}[3]{\begin{center}{\Huge\bfseries #1 #2}\\[4pt]{\small #3}\end{center}\vspace{8pt}}
\newcommand{\runsubsection}[1]{{\large\bfseries #1}}
\newcommand{\descript}[1]{{\color{subheadings}\textit{#1}}\par}
\newcommand{\location}[1]{{\footnotesize\color{date}#1}\par}
\newcommand{\sectionspace}{\vspace{8pt}}
\newenvironment{tightitemize}{\begin{itemize}[leftmargin=*, itemsep=1pt, topsep=2pt, parsep=0pt]}{\end{itemize}}
`;

app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use((req, _res, next) => {
  console.info(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get("/", (_req, res) => {
  res.redirect("/login");
});

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

app.get("/logo.png", (_req, res) => {
  res.sendFile(path.join(__dirname, "logo.png"));
});

app.get(["/favicon.png.avif", "/Favicon.png.avif"], (_req, res) => {
  res.type("image/avif");
  res.sendFile(path.join(__dirname, "Favicon.png.avif"));
});

app.get(["/temp1.png", "/temp2.png", "/temp3.png"], (req, res) => {
  res.sendFile(path.join(__dirname, req.path.slice(1)));
});

app.get("/editor", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  res.sendFile(path.join(__dirname, "views", "editor.html"));
});

app.get("/history", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  res.sendFile(path.join(__dirname, "views", "history.html"));
});

app.get("/profile", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  res.sendFile(path.join(__dirname, "views", "profile.html"));
});

app.get("/choose-plan", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  res.sendFile(path.join(__dirname, "views", "choose-plan.html"));
});

app.get("/history/:id/editor", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const note = await getProjectNote(auth.accessToken, req.params.id);
    return renderEditorPage(res, {
      initialLatex: normalizeLatexForCompilation(note?.latex_code || ""),
      generationId: note?.id || "",
      title: `${note?.title || "Saved"} Resume Editor`,
    });
  } catch (error) {
    console.error("[history] Could not open editor", {
      id: req.params.id,
      message: error.message,
      stack: error.stack,
    });
    return renderMessage(res, {
      eyebrow: "History item unavailable",
      title: "This resume could not be opened.",
      detail: error.message,
    });
  }
});

app.get("/app", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const profile = await getProfile(auth.user, auth.accessToken);
  if (profile?.onboarding_status) {
    return res.redirect("/onboarding");
  }
  if (profile?.plan_selection_required) {
    return res.redirect("/choose-plan");
  }

  return res.sendFile(path.join(__dirname, "views", "dashboard.html"));
});

app.post("/logout", (_req, res) => {
  clearAuthCookies(res);
  res.redirect("/login");
});

app.get("/logout", (_req, res) => {
  clearAuthCookies(res);
  res.redirect("/login");
});

app.post("/api/latex/compile", async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const latex = String(req.body?.latex || "");
    if (!latex.trim()) {
      return res.status(400).json({ error: "No LaTeX was provided.", log: "" });
    }

    if (Buffer.byteLength(latex, "utf8") > 1.5 * 1024 * 1024) {
      return res.status(413).json({ error: "LaTeX input is too large.", log: "" });
    }

    const pdf = await compileLatexToPdf(latex);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(pdf);
  } catch (error) {
    const compileLog = sanitizeCompileLog(error.compileLog || error.message || "");
    console.error("[latex] Compile failed", {
      message: error.message,
      stack: error.stack,
      compileLog: compileLog.slice(-4000),
    });
    return res.status(error.statusCode || 500).json({
      error: error.publicMessage || "LaTeX compilation failed.",
      log: compileLog,
    });
  }
});

app.get("/api/history", async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const authedSupabase = createAuthedClient(auth.accessToken);
    const { data, error } = await authedSupabase
      .from("project_notes")
      .select("id, title, source_type, job_url, job_description, job_details, template_id, pdf_url, resume_label, generation_notes, status, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json({ items: data || [] });
  } catch (error) {
    console.error("[history] List failed", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: "Could not load history." });
  }
});

app.get("/api/profile", async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const data = await getProfileDashboard(auth.user, auth.accessToken);
    return res.json(data);
  } catch (error) {
    console.error("[profile] Load failed", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: "Could not load profile details." });
  }
});

app.patch("/api/profile", async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const name = String(req.body?.name || "").trim();
    const profileDetails = String(req.body?.profile_details || "").trim();
    if (!name) {
      return res.status(400).json({ error: "Name is required." });
    }

    const authedSupabase = createAuthedClient(auth.accessToken);
    const { data, error } = await authedSupabase
      .from("profile")
      .update({ name, profile_details: profileDetails })
      .eq("id", auth.user.id)
      .select(PROFILE_SELECT)
      .single();

    if (error) throw error;
    return res.json({ profile: data });
  } catch (error) {
    console.error("[profile] Save failed", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: "Could not save profile changes." });
  }
});

app.post("/api/plan/select", async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const planId = String(req.body?.plan_id || "").trim().toLowerCase();
    if (!["free", "standard", "elite"].includes(planId)) {
      return res.status(400).json({ error: "Choose a valid plan." });
    }

    const plan = await getPlanById(auth.accessToken, planId);
    if (!plan) {
      return res.status(404).json({ error: "That plan is not available." });
    }

    const profile = await getProfile(auth.user, auth.accessToken);
    if (!canMoveToPlan(profile, planId)) {
      return res.status(409).json({ error: "You cannot downgrade from your current active plan." });
    }

    if (Number(plan.price_cents || 0) === 0) {
      const activatedProfile = await activateUserPlan({
        accessToken: auth.accessToken,
        userId: auth.user.id,
        plan,
      });
      return res.json({ status: "activated", redirect_url: "/app", profile: activatedProfile });
    }

    const checkout = await createSafepayCheckout({
      req,
      accessToken: auth.accessToken,
      user: auth.user,
      plan,
    });

    return res.json({ status: "checkout", checkout_url: checkout.checkoutUrl });
  } catch (error) {
    console.error("[plans] Selection failed", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(error.statusCode || 500).json({
      error: error.publicMessage || "Could not start this plan.",
    });
  }
});

app.get("/payments/safepay/success", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    console.info("[safepay] Success return query", normalizeSafepayReturnQuery(req.query));
    const transaction = await getPaymentTransactionForReturn(auth.accessToken, auth.user.id, req.query);
    if (!transaction) {
      return renderMessage(res, {
        eyebrow: "Payment not found",
        title: "We could not match this checkout to your account.",
        detail: "Please open Profile and try upgrading again.",
        href: "/profile",
        linkLabel: "Open profile",
      });
    }

    const verification = await verifySafepayPayment(transaction.tracker_token);
    const trustedSandboxReturn = isSandboxEnvironment() && hasReturnOrderId(req.query, transaction.id);
    const paymentAccepted = verification.paid || trustedSandboxReturn;
    const status = verification.paid ? "paid" : trustedSandboxReturn ? "paid_sandbox_return" : "returned_unverified";
    await updatePaymentTransaction(auth.accessToken, transaction.id, {
      status,
      provider_payload: {
        verification: verification.payload || {},
        return_query: normalizeSafepayReturnQuery(req.query),
        trusted_sandbox_return: trustedSandboxReturn,
      },
    });

    if (!paymentAccepted) {
      return renderMessage(res, {
        eyebrow: "Payment is processing",
        title: "SafePay has returned you to Resume Boy.",
        detail: "The plan will activate after SafePay confirms the payment. In sandbox, this can take a moment.",
        href: "/profile",
        linkLabel: "Back to profile",
      });
    }

    const plan = await getPlanById(auth.accessToken, transaction.plan_id);
    await activateUserPlan({ accessToken: auth.accessToken, userId: auth.user.id, plan });

    return renderMessage(res, {
      eyebrow: "Plan upgraded",
      title: `${plan.name} is active now.`,
      detail: "Your credits and plan access have been updated.",
      href: "/app",
      linkLabel: "Go to dashboard",
    });
  } catch (error) {
    console.error("[safepay] Success handling failed", {
      message: error.message,
      stack: error.stack,
    });
    return renderMessage(res, {
      eyebrow: "Payment check failed",
      title: "We could not verify this payment yet.",
      detail: "Please open Profile and try again, or check SafePay logs.",
      href: "/profile",
      linkLabel: "Open profile",
    });
  }
});

app.get("/payments/safepay/cancel", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    console.info("[safepay] Cancel return query", normalizeSafepayReturnQuery(req.query));
    const transaction = await getPaymentTransactionForReturn(auth.accessToken, auth.user.id, req.query);
    if (transaction) {
      await updatePaymentTransaction(auth.accessToken, transaction.id, { status: "cancelled" });
    }
  } catch (error) {
    console.error("[safepay] Cancel handling failed", {
      message: error.message,
      stack: error.stack,
    });
  }

  return renderMessage(res, {
    eyebrow: "Checkout cancelled",
    title: "No payment was taken.",
    detail: "You can restart the upgrade whenever you are ready.",
    href: "/profile",
    linkLabel: "Back to profile",
  });
});

app.get("/api/history/:id", async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const note = await getProjectNote(auth.accessToken, req.params.id);
    return res.json({ item: note });
  } catch (error) {
    console.error("[history] Detail failed", {
      id: req.params.id,
      message: error.message,
      stack: error.stack,
    });
    return res.status(404).json({ error: "Could not load this generation." });
  }
});

app.patch("/api/history/:id", async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "job_description")) {
      updates.job_description = String(req.body.job_description || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "resume_label")) {
      updates.resume_label = String(req.body.resume_label || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "generation_notes")) {
      updates.generation_notes = String(req.body.generation_notes || "").trim();
    }

    updates.updated_at = new Date().toISOString();

    const authedSupabase = createAuthedClient(auth.accessToken);
    const { data, error } = await authedSupabase
      .from("project_notes")
      .update(updates)
      .eq("id", req.params.id)
      .select("id, title, source_type, job_url, job_description, job_details, template_id, pdf_url, resume_label, generation_notes, status, created_at, updated_at, latex_code")
      .single();

    if (error) throw error;
    return res.json({ item: data });
  } catch (error) {
    console.error("[history] Update failed", {
      id: req.params.id,
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: "Could not update this generation." });
  }
});

app.post("/api/history/:id/draft", async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const latex = String(req.body?.latex || "");
    if (Buffer.byteLength(latex, "utf8") > 1.5 * 1024 * 1024) {
      return res.status(413).json({ error: "LaTeX input is too large." });
    }

    const authedSupabase = createAuthedClient(auth.accessToken);
    const { data, error } = await authedSupabase
      .from("project_notes")
      .update({
        latex_code: normalizeLatexForCompilation(latex),
        status: "draft_saved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .select("id, updated_at")
      .single();

    if (error) throw error;
    return res.json({ ok: true, item: data });
  } catch (error) {
    console.error("[history] Draft save failed", {
      id: req.params.id,
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: "Could not save the LaTeX draft." });
  }
});

app.post("/api/history/:id/save", async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const latex = String(req.body?.latex || "");
    if (!latex.trim()) {
      return res.status(400).json({ error: "No LaTeX was provided." });
    }
    if (Buffer.byteLength(latex, "utf8") > 1.5 * 1024 * 1024) {
      return res.status(413).json({ error: "LaTeX input is too large." });
    }

    const result = await saveProjectNotePdf({
      accessToken: auth.accessToken,
      userId: auth.user.id,
      noteId: req.params.id,
      latex,
    });

    return res.json(result);
  } catch (error) {
    console.error("[history] PDF save failed", {
      id: req.params.id,
      message: error.message,
      stack: error.stack,
    });
    return res.status(error.statusCode || 500).json({
      error: error.publicMessage || "Could not save the resume PDF.",
      log: sanitizeCompileLog(error.compileLog || error.message || ""),
    });
  }
});

app.get("/api/history/:id/pdf", async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const note = await getProjectNote(auth.accessToken, req.params.id);
    if (!note?.pdf_storage_path) {
      return res.status(404).json({ error: "This generation does not have a saved PDF yet." });
    }

    const authedSupabase = createAuthedClient(auth.accessToken);
    const { data, error } = await authedSupabase.storage
      .from("generated-resumes")
      .download(note.pdf_storage_path);

    if (error) throw error;

    const buffer = Buffer.from(await data.arrayBuffer());
    const filename = `${safeDownloadName(note.title || "resume-boy-resume")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("[history] PDF download failed", {
      id: req.params.id,
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: "Could not download this PDF." });
  }
});

app.post("/generate-resume", handleGenerateResume);
app.post("/editor", handleGenerateResume);

async function handleGenerateResume(req, res) {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const sourceType = String(req.body.job_source || "").trim();
    const jobInput = String(req.body.job_input || "").trim();
    const templateId = normalizeTemplateId(req.body.template);

    if (!["linkedin_url", "description"].includes(sourceType)) {
      return renderMessage(res, {
        eyebrow: "Choose job input",
        title: "Select LinkedIn job URL or text job description first.",
      });
    }

    if (!jobInput) {
      return renderMessage(res, {
        eyebrow: "Missing job details",
        title: "Add the job details before generating the resume.",
      });
    }

    if (!templateId) {
      return renderMessage(res, {
        eyebrow: "Choose template",
        title: "Select one of the resume templates before starting.",
      });
    }

    const creditSnapshot = await getCreditSnapshot(auth.user, auth.accessToken);
    if (!creditSnapshot.canGenerate) {
      return renderPlanExhaustedPage(res);
    }

    const profile = await getProfile(auth.user, auth.accessToken);
    const templateCode = await readResumeTemplate(templateId);
    let jobDetails;
    let normalizedJobUrl = "";
    let savedJobDescription = "";

    if (sourceType === "linkedin_url") {
      normalizedJobUrl = normalizeLinkedInJobUrl(jobInput);
      console.info("[resume] LinkedIn job selected", {
        userId: auth.user.id,
        jobUrl: normalizedJobUrl,
        templateId,
      });
      jobDetails = await fetchLinkedInJobDetails(normalizedJobUrl);
    } else {
      savedJobDescription = jobInput;
      console.info("[resume] Text job description selected", {
        userId: auth.user.id,
        characters: jobInput.length,
        templateId,
      });
      jobDetails = buildJobDetailsFromText(jobInput);
    }

    const latex = await generateLatexResume({
      templateId,
      templateCode,
      profile,
      jobDetails,
      sourceType,
    });

    console.info("[resume] LaTeX generated", {
      userId: auth.user.id,
      sourceType,
      templateId,
      outputCharacters: latex.length,
    });

    const generation = await createProjectNote({
      accessToken: auth.accessToken,
      userId: auth.user.id,
      sourceType,
      jobUrl: normalizedJobUrl,
      jobDescription: savedJobDescription || jobDetails?.job_description || "",
      jobDetails,
      templateId,
      latex,
    });
    const creditResult = await consumeGenerationCredit(auth.user, auth.accessToken);

    return renderEditorPage(res, {
      initialLatex: normalizeLatexForCompilation(latex),
      generationId: generation?.id || "",
      title: `${jobDetails?.job_title || "Generated"} Resume Editor`,
      creditExhausted: creditResult?.planId === "free" && creditResult?.remaining === 0,
    });
  } catch (error) {
    console.error("[resume] Generation failed", {
      message: error.message,
      stack: error.stack,
    });
    return renderMessage(res, {
      eyebrow: "Resume generation failed",
      title: error.message,
      detail: "Please check the job input and try again.",
    });
  }
}

app.post("/login", async (req, res) => {
  if (!supabase) {
    return renderMessage(res, {
      eyebrow: "Missing configuration",
      title: "Supabase is not configured yet.",
      detail: "Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to your .env file.",
    });
  }

  const mode = req.body.mode === "signup" ? "signup" : "login";
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirm_password || "");

  if (!email || !password) {
    return renderMessage(res, {
      eyebrow: "Missing details",
      title: "Email and password are required.",
    });
  }

  if (mode === "signup") {
    if (!name) {
      return renderMessage(res, {
        eyebrow: "Missing name",
        title: "Please enter your name to create an account.",
      });
    }

    if (password !== confirmPassword) {
      return renderMessage(res, {
        eyebrow: "Password mismatch",
        title: "Both password fields must match.",
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          profile_details: "",
        },
      },
    });

    if (error) {
      return renderMessage(res, {
        eyebrow: "Signup failed",
        title: error.message,
      });
    }

    if (data.session) {
      setAuthCookies(res, data.session);
      return res.redirect("/onboarding");
    }

    return renderMessage(res, {
      eyebrow: "Account created",
      title: "Check your email to confirm your account.",
      detail: "A profile row will be created automatically in Supabase.",
    });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return renderMessage(res, {
      eyebrow: "Login failed",
      title: error.message,
    });
  }

  setAuthCookies(res, data.session);
  const profile = await getProfile(data.user, data.session.access_token);

  if (profile?.onboarding_status !== false) {
    return res.redirect("/onboarding");
  }

  return res.redirect("/app");
});

app.get("/onboarding", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const profile = await getProfile(auth.user, auth.accessToken);
  if (profile?.onboarding_status === false) {
    return res.redirect("/app");
  }

  return res.sendFile(path.join(__dirname, "views", "onboarding.html"));
});

app.post("/onboarding", upload.single("cv_file"), async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const jobs = parseJobs(req.body.job_items);
    const sourceType = req.body.source_type === "linkedin" ? "linkedin" : "cv";
    const linkedinUrl = String(req.body.linkedin_url || "").trim();

    if (!jobs.length) {
      return renderMessage(res, {
        eyebrow: "One more detail",
        title: "Add at least one job or talent niche.",
      });
    }

    let cvDetails;
    let sourcePayload;
    const authedSupabase = createAuthedClient(auth.accessToken);

    if (sourceType === "linkedin") {
      if (!isUrl(linkedinUrl)) {
        return renderMessage(res, {
          eyebrow: "LinkedIn URL needed",
          title: "Please provide a valid LinkedIn URL.",
        });
      }

      const username = getLinkedInUsername(linkedinUrl);
      if (!username) {
        return renderMessage(res, {
          eyebrow: "LinkedIn URL needed",
          title: "Use a profile URL like linkedin.com/in/username.",
        });
      }

      console.info(`[onboarding] LinkedIn selected for user=${auth.user.id} username=${username}`);
      const linkedInProfile = await fetchLinkedInProfile(username);
      console.info(`[onboarding] LinkedIn profile resolved for username=${username}`, summarizeLinkedInProfile(linkedInProfile));
      sourcePayload = {
        type: "linkedin",
        username,
        profile: linkedInProfile,
      };
      cvDetails = {
        type: "linkedin",
        linkedin_url: linkedinUrl,
        linkedin_username: username,
        scraped_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };
    } else {
      if (!req.file) {
        return renderMessage(res, {
          eyebrow: "CV needed",
          title: "Upload your CV or choose LinkedIn instead.",
        });
      }

      const filePath = `${auth.user.id}/${Date.now()}-${safeFileName(req.file.originalname)}`;
      const { data: uploadData, error: uploadError } = await authedSupabase.storage
        .from("cvs")
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype || "application/octet-stream",
          upsert: true,
        });

      if (uploadError) {
        return renderMessage(res, {
          eyebrow: "Upload failed",
          title: uploadError.message,
        });
      }

      const { data: publicData } = authedSupabase.storage.from("cvs").getPublicUrl(filePath);
      const extractedText = await extractCvText(req.file);
      console.info(`[onboarding] CV uploaded for user=${auth.user.id}`, {
        filePath,
        publicUrl: publicData.publicUrl,
        originalName: req.file.originalname,
        extractedCharacters: extractedText.length,
      });
      sourcePayload = {
        type: "cv",
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        publicUrl: publicData.publicUrl,
        extractedText,
      };
      cvDetails = {
        type: "cv",
        file_path: filePath,
        public_url: publicData.publicUrl,
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        size: req.file.size,
        storage_id: uploadData?.id || null,
        text_extracted: Boolean(extractedText.trim()),
        uploaded_at: new Date().toISOString(),
      };
    }

    const profileDetailsBlock = await buildProfileDetailsBlock({
      jobs,
      sourcePayload,
    });
    console.info(`[onboarding] Profile details generated`, {
      userId: auth.user.id,
      sourceType,
      characters: profileDetailsBlock.length,
    });

    const { error } = await authedSupabase
      .from("profile")
      .update({
        job: jobs,
        cv_details: cvDetails,
        profile_details: profileDetailsBlock,
        onboarding_status: false,
        plan_selection_required: true,
      })
      .eq("id", auth.user.id);

    if (error) {
      return renderMessage(res, {
        eyebrow: "Onboarding failed",
        title: error.message,
      });
    }

    console.info(`[onboarding] Profile updated`, {
      userId: auth.user.id,
      sourceType,
      onboarding_status: false,
    });
    return res.redirect("/app");
  } catch (error) {
    console.error("[onboarding] Processing failed", {
      message: error.message,
      stack: error.stack,
    });
    return renderMessage(res, {
      eyebrow: "Processing failed",
      title: error.message,
      detail: "Please try again or use the other profile option.",
    });
  }
});

if (require.main === module) {
  const server = app.listen(port, () => {
    console.log(`Resume Boy login app running at http://localhost:${port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use.`);
      console.error(`Stop the other server or run this app with another port, for example: PORT=3001 npm start`);
      process.exit(1);
    }

    throw error;
  });
}

module.exports = app;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMessage(res, { eyebrow, title, detail, href = "/login", linkLabel = "Back to login" }) {
  res.status(200).send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(eyebrow)}</title>
        <meta name="description" content="Resume Boy is an AI powered resume generator for AI powered personalized job matching and personalize resume generator workflows.">
        <meta name="keywords" content="AI powered resume generator, AI powered personalized job, personalize resume generator, ATS resume generator">
        <link rel="icon" type="image/avif" href="/favicon.png.avif">
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body class="message-page">
        <main class="message-panel">
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h1>${escapeHtml(title)}</h1>
          ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
          <a class="primary-link" href="${escapeHtml(href)}">${escapeHtml(linkLabel)}</a>
        </main>
      </body>
    </html>
  `);
}

function renderLatexResult(res, latex, { templateId, sourceType, jobDetails }) {
  const title = `${jobDetails?.job_title || "Generated"} Resume LaTeX`;
  res.status(200).send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)}</title>
        <meta name="description" content="Resume Boy is an AI powered resume generator for AI powered personalized job matching and personalize resume generator workflows.">
        <meta name="keywords" content="AI powered resume generator, AI powered personalized job, personalize resume generator, ATS resume generator">
        <link rel="icon" type="image/avif" href="/favicon.png.avif">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body class="latex-page">
        <main class="latex-shell">
          <header class="latex-header">
            <div>
              <p class="eyebrow">Generated resume</p>
              <h1>${escapeHtml(title)}</h1>
              <p>${escapeHtml(templateId)} · ${escapeHtml(sourceType.replace("_", " "))}</p>
            </div>
            <div class="latex-actions">
              <button id="edit-preview-button" class="primary-link" type="button">Edit &amp; Preview</button>
              <a class="secondary-link" href="/app">Back to dashboard</a>
            </div>
          </header>
          <pre class="latex-output"><code>${escapeHtml(latex)}</code></pre>
        </main>
        <script id="generated-latex-data" type="application/json">${serializeScriptJson({ latex })}</script>
        <script>
          document.querySelector("#edit-preview-button").addEventListener("click", () => {
            const data = JSON.parse(document.querySelector("#generated-latex-data").textContent);
            sessionStorage.setItem("resmaker_generated_latex", data.latex || "");
            window.location.href = "/editor";
          });
        </script>
      </body>
    </html>
  `);
}

function renderEditorPage(res, { initialLatex = "", generationId = "", title = "Resume Boy - LaTeX Editor", creditExhausted = false } = {}) {
  res.status(200).send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)}</title>
        <meta name="description" content="Resume Boy is an AI powered resume generator for AI powered personalized job matching and personalize resume generator workflows.">
        <meta name="keywords" content="AI powered resume generator, AI powered personalized job, personalize resume generator, ATS resume generator">
        <link rel="icon" type="image/avif" href="/favicon.png.avif">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.css">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/theme/eclipse.min.css">
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body class="editor-page">
        <main class="editor-shell">
          <section class="editor-pane code-pane" aria-label="LaTeX editor">
            <div class="pane-header">
              <div>
                <p class="eyebrow">Source</p>
                <h1>LaTeX editor</h1>
              </div>
            </div>
            <textarea id="latex-source" spellcheck="false"></textarea>
          </section>

          <section class="editor-pane preview-pane" aria-label="PDF preview">
            <div class="pane-header">
              <div>
                <p class="eyebrow">Preview</p>
                <h1>Compiled PDF</h1>
              </div>
            </div>
            <div id="pdf-preview-wrap" class="pdf-preview-wrap">
              <iframe id="pdf-preview" title="Compiled resume PDF preview"></iframe>
              <div id="empty-preview" class="empty-preview">
                <p>Compile your resume to preview the PDF here.</p>
              </div>
            </div>
            <details id="compile-log-panel" class="compile-log-panel editor-hidden-log">
              <summary>Compile log</summary>
              <pre id="compile-log"></pre>
            </details>
          </section>
        </main>

        <nav class="editor-floating-bar" aria-label="Editor status and actions">
          <div class="editor-live-status">
            <span id="compile-status">Waiting</span>
            <span id="autosave-status">Saved</span>
          </div>
          <div class="editor-floating-actions">
            <button id="download-button" class="editor-button primary" type="button" disabled>Download</button>
            <button id="next-button" class="editor-button secondary" type="button">Done</button>
          </div>
        </nav>

        ${creditExhausted ? creditExhaustedDialogHtml() : ""}

        <script id="editor-initial-latex" type="application/json">${serializeScriptJson({ latex: initialLatex, generationId })}</script>
        <script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/stex/stex.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/edit/matchbrackets.min.js"></script>
        <script src="/editor.js"></script>
      </body>
    </html>
  `);
}

function renderPlanExhaustedPage(res) {
  res.status(402).send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Plan exhausted</title>
        <meta name="description" content="Resume Boy is an AI powered resume generator for AI powered personalized job matching and personalize resume generator workflows.">
        <link rel="icon" type="image/avif" href="/favicon.png.avif">
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body class="dashboard-page">
        ${creditExhaustedDialogHtml(false)}
        <script>
          document.querySelectorAll("[data-plan-upgrade]").forEach((button) => {
            button.addEventListener("click", async () => {
              const state = document.querySelector("#credits-state");
              button.disabled = true;
              state.textContent = "Preparing checkout...";
              try {
                const response = await fetch("/api/plan/select", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Accept": "application/json" },
                  body: JSON.stringify({ plan_id: button.dataset.planUpgrade })
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || "Could not start upgrade.");
                if (payload.checkout_url) window.location.assign(payload.checkout_url);
              } catch (error) {
                state.textContent = error.message;
                button.disabled = false;
              }
            });
          });
        </script>
      </body>
    </html>
  `);
}

function creditExhaustedDialogHtml(hidden = true) {
  return `
    <div id="credits-popup" class="credits-popup" ${hidden ? "" : ""}>
      <div class="credits-dialog" role="dialog" aria-modal="true" aria-labelledby="credits-title">
        <p class="flow-eyebrow">Plan exhausted</p>
        <h2 id="credits-title">You have used all free credits.</h2>
        <p>Upgrade to keep generating personalized ATS resumes.</p>
        <div class="credits-actions">
          <button class="button button-primary" type="button" data-plan-upgrade="standard">Upgrade Standard</button>
          <button class="button button-secondary" type="button" data-plan-upgrade="elite">Upgrade Elite</button>
        </div>
        <small id="credits-state" aria-live="polite"></small>
      </div>
    </div>
  `;
}

function serializeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function createAuthedClient(accessToken) {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function requireAuth(req, res) {
  if (!supabase) {
    renderMessage(res, {
      eyebrow: "Missing configuration",
      title: "Supabase is not configured yet.",
    });
    return null;
  }

  const cookies = parseCookies(req.headers.cookie || "");
  const accessToken = cookies.sb_access_token;

  if (!accessToken) {
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ error: "Please log in again." });
      return null;
    }
    res.redirect("/login");
    return null;
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    clearAuthCookies(res);
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ error: "Please log in again." });
      return null;
    }
    res.redirect("/login");
    return null;
  }

  return { user: data.user, accessToken };
}

async function getProfile(user, accessToken) {
  const authedSupabase = createAuthedClient(accessToken);
  let { data, error } = await authedSupabase
    .from("profile")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  if (!error && data) {
    data = await expireProfilePlanIfNeeded(accessToken, data);
    return data;
  }

  const { data: fallback } = await authedSupabase
    .from("profile")
    .upsert({
      id: user.id,
      name: user.user_metadata?.name || "",
      email: user.email || "",
      onboarding_status: true,
      plan_id: "free",
      billing_period: "year",
      credits_used: 0,
      credits_remaining: 5,
      plan_renews_at: nextPlanRenewal("year"),
      plan_selection_required: true,
    }, { onConflict: "id" })
    .select(PROFILE_SELECT)
    .single();

  return fallback;
}

async function getProfileDashboard(user, accessToken) {
  const profile = await getProfile(user, accessToken);
  const authedSupabase = createAuthedClient(accessToken);

  const [{ count, error: countError }, { data: plans, error: plansError }] = await Promise.all([
    authedSupabase
      .from("project_notes")
      .select("id", { count: "exact", head: true })
      .neq("status", "sample"),
    authedSupabase
      .from("subscription_plans")
      .select("id, name, price_cents, currency, billing_period, generation_limit, ai_model, support_level, features, sort_order, checkout_mode, safepay_plan_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (countError) throw countError;
  if (plansError) throw plansError;

  const currentPlan = (plans || []).find((plan) => plan.id === profile?.plan_id) || (plans || [])[0] || null;
  return {
    profile,
    currentPlan,
    plans: plans || [],
    stats: {
      totalGenerations: count || 0,
      leftCredits: currentPlan?.generation_limit === null ? "Unlimited" : profile?.credits_remaining ?? currentPlan?.generation_limit ?? 0,
      currentPlan: currentPlan?.name || "Free",
    },
  };
}

async function getCreditSnapshot(user, accessToken) {
  const profile = await getProfile(user, accessToken);
  const authedSupabase = createAuthedClient(accessToken);
  const { data: plan, error } = await authedSupabase
    .from("subscription_plans")
    .select("id, name, generation_limit")
    .eq("id", profile?.plan_id || "free")
    .single();

  if (error) throw error;

  const unlimited = plan?.generation_limit === null;
  const remaining = unlimited ? null : Number(profile?.credits_remaining ?? plan?.generation_limit ?? 0);
  return {
    canGenerate: unlimited || remaining > 0,
    unlimited,
    remaining,
    profile,
    plan,
  };
}

async function consumeGenerationCredit(user, accessToken) {
  const snapshot = await getCreditSnapshot(user, accessToken);
  if (snapshot.unlimited) {
    return {
      planId: snapshot.profile?.plan_id,
      remaining: null,
      unlimited: true,
    };
  }

  const profile = await getProfile(user, accessToken);
  const remaining = Number(profile?.credits_remaining || 0);
  const used = Number(profile?.credits_used || 0);
  const nextRemaining = Math.max(0, remaining - 1);
  const authedSupabase = createAuthedClient(accessToken);
  const { error } = await authedSupabase
    .from("profile")
    .update({
      credits_used: used + 1,
      credits_remaining: nextRemaining,
    })
    .eq("id", user.id);

  if (error) {
    console.error("[credits] Failed to consume generation credit", {
      userId: user.id,
      message: error.message,
    });
  }

  return {
    planId: profile?.plan_id,
    remaining: nextRemaining,
    unlimited: false,
  };
}

function nextPlanRenewal(period) {
  const now = new Date();
  if (period === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  }
  return new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString();
}

async function getPlanById(accessToken, planId) {
  const authedSupabase = createAuthedClient(accessToken);
  const { data, error } = await authedSupabase
    .from("subscription_plans")
    .select("id, name, price_cents, currency, billing_period, generation_limit, ai_model, support_level, features, checkout_mode, safepay_plan_id")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function expireProfilePlanIfNeeded(accessToken, profile) {
  if (!profile?.plan_renews_at || profile.plan_id === "free") return profile;
  const renewalTime = new Date(profile.plan_renews_at).getTime();
  if (!Number.isFinite(renewalTime) || renewalTime > Date.now()) return profile;

  const authedSupabase = createAuthedClient(accessToken);
  const { data, error } = await authedSupabase
    .from("profile")
    .update({
      plan_id: "free",
      billing_period: "month",
      credits_remaining: 0,
      plan_started_at: null,
      plan_renews_at: null,
      plan_selection_required: false,
    })
    .eq("id", profile.id)
    .select(PROFILE_SELECT)
    .single();

  if (error) {
    console.error("[plans] Failed to expire plan", {
      userId: profile.id,
      message: error.message,
    });
    return profile;
  }

  console.info("[plans] Monthly plan expired", {
    userId: profile.id,
    previousPlan: profile.plan_id,
  });
  return data;
}

function canMoveToPlan(profile, nextPlanId) {
  if (!profile?.plan_id || isPlanExpired(profile)) return true;
  const currentRank = planRank(profile.plan_id);
  const nextRank = planRank(nextPlanId);
  return nextRank >= currentRank;
}

function isPlanExpired(profile) {
  if (!profile?.plan_renews_at || profile.plan_id === "free") return false;
  const renewalTime = new Date(profile.plan_renews_at).getTime();
  return Number.isFinite(renewalTime) && renewalTime <= Date.now();
}

function planRank(planId) {
  return { free: 0, standard: 1, elite: 2 }[planId] ?? 0;
}

async function activateUserPlan({ accessToken, userId, plan }) {
  const authedSupabase = createAuthedClient(accessToken);
  const generationLimit = plan?.generation_limit === null ? null : Number(plan?.generation_limit ?? 0);
  const { data, error } = await authedSupabase
    .from("profile")
    .update({
      plan_id: plan.id,
      billing_period: plan.billing_period || "year",
      credits_used: 0,
      credits_remaining: generationLimit,
      plan_started_at: new Date().toISOString(),
      plan_renews_at: nextPlanRenewal(plan.billing_period || "year"),
      plan_selection_required: false,
    })
    .eq("id", userId)
    .select(PROFILE_SELECT)
    .single();

  if (error) throw error;
  console.info("[plans] Plan activated", {
    userId,
    planId: plan.id,
    generationLimit: plan.generation_limit,
  });
  return data;
}

async function createSafepayCheckout({ req, accessToken, user, plan }) {
  if (!safepaySecretKey || !safepayPublicKey) {
    const error = new Error("SafePay is not configured.");
    error.statusCode = 500;
    error.publicMessage = "SafePay keys are missing. Add SAFEPAY_SECRET_KEY and SAFEPAY_PUBLIC_KEY to .env.";
    throw error;
  }

  const authedSupabase = createAuthedClient(accessToken);
  const amount = Number(plan.price_cents || 0);
  const currency = plan.currency || safepayCurrency;
  const { data: transaction, error: insertError } = await authedSupabase
    .from("payment_transactions")
    .insert({
      user_id: user.id,
      plan_id: plan.id,
      provider_environment: safepayEnvironment,
      amount_cents: amount,
      currency,
      status: "created",
      provider_payload: {
        plan_name: plan.name,
        billing_period: plan.billing_period,
      },
    })
    .select("id, plan_id")
    .single();

  if (insertError) throw insertError;

  const safepay = new Safepay(safepaySecretKey, {
    authType: "secret",
    host: safepayHost,
    timeout: 45000,
  });
  const baseUrl = getBaseUrl(req);
  const redirectUrl = `${baseUrl}/payments/safepay/success`;
  const cancelUrl = `${baseUrl}/payments/safepay/cancel`;

  console.info("[safepay] Creating checkout", {
    userId: user.id,
    planId: plan.id,
    amount,
    currency,
    environment: safepayEnvironment,
  });

  const session = await safepay.payments.session.setup({
    merchant_api_key: safepayPublicKey,
    intent: process.env.SAFEPAY_PAYMENT_INTENT || "CYBERSOURCE",
    mode: "payment",
    entry_mode: process.env.SAFEPAY_ENTRY_MODE || "raw",
    currency,
    amount,
    include_fees: false,
  });
  const passport = await safepay.client.passport.create();
  const tracker = extractFirstValue(session, [
    "data.tracker.token",
    "tracker.token",
    "data.token",
    "token",
  ]);
  const tbt = extractFirstValue(passport, [
    "data",
    "data.token",
    "token",
    "tbt",
  ]);

  if (!tracker || !tbt) {
    console.error("[safepay] Missing checkout token", {
      hasTracker: Boolean(tracker),
      hasTbt: Boolean(tbt),
      sessionPreview: safeJsonPreview(session),
      passportPreview: safeJsonPreview(passport),
    });
    const error = new Error("SafePay did not return the required checkout tokens.");
    error.publicMessage = "SafePay checkout could not be prepared. Please try again.";
    throw error;
  }

  const checkoutUrl = safepay.checkout.createCheckoutUrl({
    env: safepayEnvironment,
    tracker,
    tbt,
    source: "hosted",
    redirect_url: redirectUrl,
    cancel_url: cancelUrl,
    order_id: transaction.id,
  });

  const { error: updateError } = await authedSupabase
    .from("payment_transactions")
    .update({
      tracker_token: tracker,
      checkout_url: checkoutUrl,
      status: "checkout_created",
      provider_payload: {
        plan_name: plan.name,
        session,
        passport: { received: true },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", transaction.id);

  if (updateError) throw updateError;
  console.info("[safepay] Checkout created", {
    transactionId: transaction.id,
    tracker,
  });

  return { checkoutUrl, transactionId: transaction.id, tracker };
}

async function getPaymentTransactionForReturn(accessToken, userId, query) {
  const intent = extractUuid(query.intent || query.transaction_id || query.order_id || "");
  const tracker = String(query.tracker || query.tracker_token || "").trim();
  const authedSupabase = createAuthedClient(accessToken);
  let request = authedSupabase
    .from("payment_transactions")
    .select("id, user_id, plan_id, tracker_token, amount_cents, currency, status")
    .eq("user_id", userId);

  if (intent) {
    request = request.eq("id", intent);
  } else if (tracker) {
    request = request.eq("tracker_token", tracker);
  } else {
    return null;
  }

  const { data, error } = await request.maybeSingle();
  if (error) throw error;
  return data;
}

function extractUuid(value) {
  const match = String(value || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return match ? match[0] : "";
}

function hasReturnOrderId(query, transactionId) {
  return [
    query.order_id,
    query.intent,
    query.transaction_id,
  ].some((value) => extractUuid(value) === transactionId);
}

function normalizeSafepayReturnQuery(query) {
  return Object.fromEntries(Object.entries(query || {}).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.map((item) => String(item)).join(",") : String(value || ""),
  ]));
}

function isSandboxEnvironment() {
  return ["sandbox", "development", "dev"].includes(String(safepayEnvironment || "").toLowerCase());
}

async function updatePaymentTransaction(accessToken, id, updates) {
  const authedSupabase = createAuthedClient(accessToken);
  const { error } = await authedSupabase
    .from("payment_transactions")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}

async function verifySafepayPayment(tracker) {
  if (!tracker || !safepaySecretKey) {
    return { paid: false, payload: { reason: "missing_tracker_or_secret" } };
  }

  try {
    const safepay = new Safepay(safepaySecretKey, {
      authType: "secret",
      host: safepayHost,
      timeout: 45000,
    });
    const payload = await safepay.reporter.payments.fetch(tracker);
    const paid = safepayPayloadLooksPaid(payload);
    console.info("[safepay] Payment verification", {
      tracker,
      paid,
      preview: safeJsonPreview(payload),
    });
    return { paid, payload };
  } catch (error) {
    console.error("[safepay] Payment verification failed", {
      tracker,
      message: error.message,
    });
    return { paid: false, payload: { error: error.message } };
  }
}

function safepayPayloadLooksPaid(payload) {
  const paidStates = new Set([
    "TRACKER_ENDED",
    "PAYMENT_ENDED",
    "AUTHORIZED",
    "AUTHORISED",
    "CAPTURED",
    "SUCCESS",
    "SUCCEEDED",
    "COMPLETED",
    "PAID",
  ]);
  const failedStates = new Set([
    "UNPAID",
    "FAILED",
    "DECLINED",
    "CANCELLED",
    "CANCELED",
    "VOIDED",
    "EXPIRED",
  ]);

  const values = collectStringValues(payload).map((value) => value.trim().toUpperCase());
  if (values.some((value) => failedStates.has(value))) return false;
  return values.some((value) => paidStates.has(value));
}

function collectStringValues(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  return Object.values(value).flatMap(collectStringValues);
}

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function extractFirstValue(source, paths) {
  for (const pathName of paths) {
    const value = pathName.split(".").reduce((current, key) => {
      if (current === null || current === undefined) return undefined;
      return current[key];
    }, source);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function safeJsonPreview(value) {
  return JSON.stringify(value || {}).slice(0, 900);
}

async function createProjectNote({ accessToken, userId, sourceType, jobUrl, jobDescription, jobDetails, templateId, latex }) {
  const title = buildProjectNoteTitle(jobDetails, sourceType);
  const authedSupabase = createAuthedClient(accessToken);
  const { data, error } = await authedSupabase
    .from("project_notes")
    .insert({
      user_id: userId,
      title,
      source_type: sourceType,
      job_url: jobUrl || null,
      job_description: jobDescription || "",
      job_details: jobDetails || {},
      template_id: templateId,
      latex_code: normalizeLatexForCompilation(latex),
      resume_label: `${templateId} resume draft`,
      generation_notes: buildGenerationNotes(jobDetails, sourceType),
      status: "generated",
    })
    .select("id, title")
    .single();

  if (error) {
    console.error("[history] Failed to create project note", {
      userId,
      sourceType,
      templateId,
      message: error.message,
    });
    throw error;
  }

  console.info("[history] Project note created", {
    userId,
    noteId: data.id,
    title: data.title,
  });
  return data;
}

async function getProjectNote(accessToken, noteId) {
  const authedSupabase = createAuthedClient(accessToken);
  const { data, error } = await authedSupabase
    .from("project_notes")
    .select("id, user_id, title, source_type, job_url, job_description, job_details, template_id, latex_code, pdf_url, pdf_storage_path, resume_label, generation_notes, status, created_at, updated_at")
    .eq("id", noteId)
    .single();

  if (error) throw error;
  return data;
}

async function saveProjectNotePdf({ accessToken, userId, noteId, latex }) {
  const normalizedLatex = normalizeLatexForCompilation(latex);
  await getProjectNote(accessToken, noteId);
  const pdf = await compileLatexToPdf(normalizedLatex);
  const authedSupabase = createAuthedClient(accessToken);
  const storagePath = `${userId}/${noteId}.pdf`;

  const { error: uploadError } = await authedSupabase.storage
    .from("generated-resumes")
    .upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    uploadError.publicMessage = uploadError.message;
    throw uploadError;
  }

  const { data: publicData } = authedSupabase.storage.from("generated-resumes").getPublicUrl(storagePath);
  const pdfUrl = publicData?.publicUrl || "";
  const { data, error } = await authedSupabase
    .from("project_notes")
    .update({
      latex_code: normalizedLatex,
      pdf_storage_path: storagePath,
      pdf_url: pdfUrl,
      status: "saved",
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select("id, pdf_url, pdf_storage_path, updated_at")
    .single();

  if (error) throw error;
  console.info("[history] PDF saved", {
    userId,
    noteId,
    storagePath,
    pdfBytes: pdf.length,
  });

  return {
    ok: true,
    item: data,
    pdf_url: pdfUrl,
  };
}

function buildProjectNoteTitle(jobDetails, sourceType) {
  const title = jobDetails?.job_title || (sourceType === "linkedin_url" ? "LinkedIn job resume" : "Text job resume");
  const company = jobDetails?.company_name ? ` at ${jobDetails.company_name}` : "";
  return `${title}${company}`;
}

function buildGenerationNotes(jobDetails, sourceType) {
  const requirements = extractJobRequirements(jobDetails || {});
  const lines = [
    `Source: ${sourceType === "linkedin_url" ? "LinkedIn job URL" : "Text job description"}`,
    `Experience: ${requirements.experience || "Not explicitly provided"}`,
    `Education: ${(requirements.education_level || []).join(", ") || "Not explicitly provided"}`,
    `Certifications: ${(requirements.certifications || []).join(", ") || "Not explicitly provided"}`,
    `Skills: ${(requirements.skills || []).slice(0, 12).join(", ") || "Not explicitly provided"}`,
  ];
  return lines.join("\n");
}

function setAuthCookies(res, session) {
  const maxAge = session.expires_in || 3600;
  res.cookie("sb_access_token", session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: maxAge * 1000,
  });
  res.cookie("sb_refresh_token", session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res) {
  res.clearCookie("sb_access_token");
  res.clearCookie("sb_refresh_token");
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(";").reduce((cookies, cookie) => {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (!name) return cookies;
    cookies[name] = decodeURIComponent(valueParts.join("="));
    return cookies;
  }, {});
}

function parseJobs(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item).trim()).filter(Boolean).slice(0, 12);
  } catch {
    return [];
  }
}

function isUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function safeFileName(value) {
  const ext = path.extname(value || "").toLowerCase();
  const base = path.basename(value || "cv", ext).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `${base || "cv"}-${crypto.randomBytes(4).toString("hex")}${ext || ".pdf"}`;
}

function safeDownloadName(value) {
  return String(value || "resume-boy-resume")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 80) || "resume-boy-resume";
}

function getLinkedInUsername(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  if (!trimmed.includes("linkedin.com")) {
    return trimmed.replace(/^@/, "").replace(/\/+$/, "");
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.findIndex((part) => part.toLowerCase() === "in");
    return index >= 0 ? decodeURIComponent(parts[index + 1] || "") : "";
  } catch {
    return "";
  }
}

function normalizeTemplateId(value) {
  const templateId = String(value || "").trim().toLowerCase();
  return ["template1", "template2", "template3"].includes(templateId) ? templateId : "";
}

async function compileLatexToPdf(latex) {
  const compiler = await findLatexCompiler();
  if (!compiler) {
    const error = new Error("No local LaTeX compiler was found.");
    error.statusCode = 501;
    error.publicMessage = "No local LaTeX compiler was found.";
    error.compileLog = "Expected bundled Tectonic from node-latex-compiler, system tectonic, or pdflatex.";
    throw error;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "resmaker-latex-"));
  const texPath = path.join(workDir, "main.tex");
  const pdfPath = path.join(workDir, "main.pdf");

  try {
    await fs.writeFile(texPath, normalizeLatexForCompilation(latex), "utf8");
    await writeLatexSupportFiles(workDir);
    const result = await runLatexCompiler(compiler, workDir);

    if (result.timedOut) {
      const error = new Error("LaTeX compilation timed out.");
      error.statusCode = 408;
      error.publicMessage = "LaTeX compilation timed out.";
      error.compileLog = result.log;
      throw error;
    }

    if (result.exitCode !== 0) {
      const error = new Error("LaTeX compilation failed.");
      error.statusCode = 400;
      error.publicMessage = "LaTeX compilation failed.";
      error.compileLog = result.log;
      throw error;
    }

    try {
      return await fs.readFile(pdfPath);
    } catch {
      const error = new Error("The compiler finished but did not produce a PDF.");
      error.statusCode = 400;
      error.publicMessage = "The compiler finished but did not produce a PDF.";
      error.compileLog = result.log;
      throw error;
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function findLatexCompiler() {
  const bundledTectonic = latexPlatformResolver.resolveTectonicExecutable({});
  const candidates = [
    bundledTectonic
      ? { command: bundledTectonic, args: ["--untrusted", "--print", "--keep-logs", "--keep-intermediates", "main.tex"], source: "bundled-tectonic" }
      : null,
    { command: "tectonic", args: ["--untrusted", "--print", "--keep-logs", "--keep-intermediates", "main.tex"] },
    { command: "pdflatex", args: ["-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "main.tex"] },
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await commandExists(candidate.command)) {
      console.info("[latex] Using compiler", {
        command: candidate.command,
        source: candidate.source || "system",
      });
      return candidate;
    }
  }

  return null;
}

function commandExists(command) {
  return new Promise((resolve) => {
    if (path.isAbsolute(command)) {
      fs.access(command, nodeFs.constants.X_OK)
        .then(() => resolve(true))
        .catch(() => resolve(false));
      return;
    }

    execFile("which", [command], { timeout: 2000 }, (error) => {
      resolve(!error);
    });
  });
}

function runLatexCompiler(compiler, cwd) {
  return new Promise((resolve) => {
    execFile(
      compiler.command,
      compiler.args,
      {
        cwd,
        env: {
          ...process.env,
          XDG_CACHE_HOME: path.join(os.tmpdir(), "resmaker-tectonic-cache"),
        },
        timeout: latexCompileTimeoutMs,
        maxBuffer: 1024 * 1024 * 8,
      },
      (error, stdout = "", stderr = "") => {
        resolve({
          exitCode: typeof error?.code === "number" ? error.code : 0,
          timedOut: Boolean(error?.killed && error?.signal === "SIGTERM"),
          log: sanitizeCompileLog(`${stdout}\n${stderr}`),
        });
      }
    );
  });
}

function normalizeLatexForCompilation(latex) {
  return extractLatexDocument(String(latex || ""))
    .replace(/dvipsNames/g, "dvipsnames")
    .replace(/\\usepackage\[(.*?)\]\{xColor\}/g, "\\usepackage[$1]{xcolor}")
    .replace(/^\s*\\input\s*\{glyphtounicode\}\s*$/gim, "% glyphtounicode removed for XeTeX/Tectonic compatibility")
    .replace(/^\s*\\input\s+glyphtounicode\s*$/gim, "% glyphtounicode removed for XeTeX/Tectonic compatibility")
    .replace(/^\s*\\pdfgentounicode\b.*$/gim, "% pdfgentounicode removed for XeTeX/Tectonic compatibility")
    .replace(/^\s*\\pdfglyphtounicode\b.*$/gim, "% pdfglyphtounicode removed for XeTeX/Tectonic compatibility")
    .replace(/^(\s*\\begin\{itemize\}\[[^\]\n]*\])\}\s*$/gim, "$1")
    .replace(/\$\\vcenter\{\\hbox\{\\tiny\$\\bullet\$\}\}\$/g, "\\textbullet")
    .replace(/\\renewcommand\\labelitemii\{[^}]*\\bullet[^}]*\}/g, "\\renewcommand\\labelitemii{\\textbullet}")
    .replace(/\$\|\$/g, "\\textbar{}")
    .replace(/\\includegraphics(\[[^\]]*\])?\{photo\.jpg\}/g, "\\includegraphics$1{photo.jpg}");
}

function extractLatexDocument(value) {
  const text = stripMarkdownCodeFence(value);
  const start = text.indexOf("\\documentclass");
  const end = text.lastIndexOf("\\end{document}");

  if (start >= 0 && end >= start) {
    return text.slice(start, end + "\\end{document}".length).trim();
  }

  return text;
}

async function writeLatexSupportFiles(workDir) {
  await Promise.all([
    fs.writeFile(path.join(workDir, "deedy-resume.cls"), DEEDY_RESUME_CLASS, "utf8"),
    fs.writeFile(path.join(workDir, "photo.jpg"), Buffer.from(PLACEHOLDER_JPEG_BASE64, "base64")),
  ]);
}

function sanitizeCompileLog(value) {
  return String(value || "")
    .replace(new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "[app]")
    .slice(-12000);
}

async function readResumeTemplate(templateId) {
  const normalized = normalizeTemplateId(templateId);
  if (!normalized) {
    throw new Error("Invalid resume template selected.");
  }

  const templatePath = path.join(__dirname, `${normalized}.tex`);
  try {
    return await fs.readFile(templatePath, "utf8");
  } catch (error) {
    throw new Error(`Could not read ${normalized}.tex: ${error.message}`);
  }
}

function normalizeLinkedInJobUrl(value) {
  const trimmed = String(value || "").trim();
  const urlMatches = trimmed.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/jobs\/[^\s,]+/gi) || [];

  if (urlMatches.length !== 1) {
    throw new Error("Paste exactly one LinkedIn job URL.");
  }

  const urlText = urlMatches[0].replace(/[)\].,]+$/g, "");
  const extraText = trimmed.replace(urlMatches[0], "").trim();
  if (extraText) {
    throw new Error("Only paste one LinkedIn job URL, without extra text.");
  }

  let parsed;
  try {
    parsed = new URL(urlText.startsWith("http") ? urlText : `https://${urlText}`);
  } catch {
    throw new Error("The LinkedIn job URL is not valid.");
  }

  if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname)) {
    throw new Error("Use a valid LinkedIn job URL.");
  }

  const idMatch = parsed.pathname.match(/\/jobs\/view\/.*?(\d{6,})(?:\/|$)/i);
  const jobId = idMatch?.[1] || parsed.searchParams.get("currentJobId") || "";
  if (!jobId) {
    throw new Error("The LinkedIn job URL must include a numeric job ID.");
  }

  return `https://www.linkedin.com/jobs/view/${jobId}/`;
}

function buildJobDetailsFromText(jobDescription) {
  return {
    scrape_status: "manual_text",
    job_title: "Custom job description",
    job_description: jobDescription,
    experience_years_min: null,
    experience_years_max: null,
    education_level: [],
    certifications: [],
    skills: [],
  };
}

async function fetchLinkedInProfile(username) {
  if (!apifyLinkedInUrl) {
    throw new Error("APIFY_LINKEDIN_SCRAPER_URL is not configured.");
  }

  console.info(`[apify] Starting LinkedIn scrape`, { username });
  const result = await postApifyLinkedInRequest(apifyLinkedInUrl, username, "primary");
  const directProfile = extractLinkedInProfileFromPayload(result);
  if (directProfile) {
    return directProfile;
  }

  const datasetId = result?.defaultDatasetId || result?.data?.defaultDatasetId || result?.output?.defaultDatasetId;
  if (datasetId) {
    console.info(`[apify] Run object returned; fetching dataset items`, { datasetId });
    const datasetItems = await fetchApifyDatasetItems(datasetId);
    const datasetProfile = extractLinkedInProfileFromPayload(datasetItems);
    if (datasetProfile) {
      return datasetProfile;
    }
  }

  console.error("[apify] Could not find LinkedIn profile in Apify payload", {
    payloadKeys: result && typeof result === "object" ? Object.keys(result) : [],
    sample: truncateForLog(result),
  });
  throw new Error("LinkedIn scraper returned JSON, but no profile item was found.");
}

async function postApifyLinkedInRequest(endpoint, username, label) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      includeEmail: false,
      usernames: [username],
    }),
  });

  const rawText = await response.text();
  console.info(`[apify] ${label} response received`, {
    endpoint: redactApifyToken(endpoint),
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    headers: Object.fromEntries(response.headers.entries()),
    characters: rawText.length,
    preview: rawText.slice(0, 500),
  });

  if (!response.ok) {
    throw new Error(`LinkedIn scraper failed: ${response.status} ${rawText.slice(0, 240)}`);
  }

  if (!rawText.trim()) {
    const datasetEndpoint = getRunSyncDatasetEndpoint(endpoint);
    if (datasetEndpoint && datasetEndpoint !== endpoint) {
      console.warn(`[apify] ${label} response was empty; retrying with dataset-items sync endpoint`, {
        datasetEndpoint: redactApifyToken(datasetEndpoint),
      });
      return postApifyLinkedInRequest(datasetEndpoint, username, "dataset-sync");
    }

    throw new Error("Apify returned an empty response body. Use the run-sync-get-dataset-items endpoint for dataset output.");
  }

  return parseJsonOrThrow(rawText, `Apify ${label} response`);
}

async function fetchApifyDatasetItems(datasetId) {
  const token = getApifyToken();
  const datasetUrl = new URL(`https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items`);
  datasetUrl.searchParams.set("clean", "true");
  datasetUrl.searchParams.set("format", "json");
  if (token) datasetUrl.searchParams.set("token", token);

  const response = await fetch(datasetUrl, {
    headers: {
      "Accept": "application/json",
    },
  });
  const rawText = await response.text();

  console.info("[apify] Dataset response received", {
    datasetId,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    characters: rawText.length,
    preview: rawText.slice(0, 500),
  });

  if (!response.ok) {
    throw new Error(`Apify dataset fetch failed: ${response.status} ${rawText.slice(0, 240)}`);
  }

  return parseJsonOrThrow(rawText, "Apify dataset items response");
}

async function fetchLinkedInJobDetails(jobUrl) {
  if (!apifyLinkedInJobUrl) {
    throw new Error("APIFY_LINKEDIN_JOB_URL is not configured, and no Apify token could be derived.");
  }

  console.info("[apify-job] Starting LinkedIn job scrape", {
    jobUrl,
    endpoint: redactApifyToken(apifyLinkedInJobUrl),
  });

  const payload = await postApifyJobRequest(apifyLinkedInJobUrl, jobUrl, "primary");
  const job = extractLinkedInJobFromPayload(payload);

  if (!job) {
    console.error("[apify-job] Could not find job details in payload", {
      payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
      sample: truncateForLog(payload),
    });
    throw new Error("LinkedIn job scraper returned JSON, but no job details were found.");
  }

  console.info("[apify-job] Job details resolved", summarizeJobDetails(job));
  return job;
}

async function postApifyJobRequest(endpoint, jobUrl, label) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      startUrls: [{ url: jobUrl }],
    }),
  });

  const rawText = await response.text();
  console.info(`[apify-job] ${label} response received`, {
    endpoint: redactApifyToken(endpoint),
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    characters: rawText.length,
    preview: rawText.slice(0, 500),
  });

  if (!response.ok) {
    throw new Error(`LinkedIn job scraper failed: ${response.status} ${rawText.slice(0, 240)}`);
  }

  if (!rawText.trim()) {
    const datasetEndpoint = getRunSyncDatasetEndpoint(endpoint);
    if (datasetEndpoint && datasetEndpoint !== endpoint) {
      console.warn(`[apify-job] ${label} response was empty; retrying with dataset-items sync endpoint`, {
        datasetEndpoint: redactApifyToken(datasetEndpoint),
      });
      return postApifyJobRequest(datasetEndpoint, jobUrl, "dataset-sync");
    }

    throw new Error("Apify job scraper returned an empty response body.");
  }

  return parseJsonOrThrow(rawText, `Apify job ${label} response`);
}

function extractLinkedInJobFromPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.find(isLinkedInJobLike) || null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (isLinkedInJobLike(payload)) {
    return payload;
  }

  const candidates = [
    payload.items,
    payload.data,
    payload.output,
    payload.result,
    payload.results,
    payload.defaultDatasetItems,
  ];

  for (const candidate of candidates) {
    const job = extractLinkedInJobFromPayload(candidate);
    if (job) return job;
  }

  return null;
}

function isLinkedInJobLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (
        value.job_description ||
        value.job_posting_id ||
        value.job_url ||
        value.job_title ||
        value.company_name
      )
  );
}

function extractLinkedInProfileFromPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.find(isLinkedInProfileLike) || null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (isLinkedInProfileLike(payload)) {
    return payload;
  }

  const candidates = [
    payload.items,
    payload.data,
    payload.output,
    payload.result,
    payload.results,
    payload.defaultDatasetItems,
  ];

  for (const candidate of candidates) {
    const profile = extractLinkedInProfileFromPayload(candidate);
    if (profile) return profile;
  }

  return null;
}

function isLinkedInProfileLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (
        value.basic_info ||
        value.profileUrl ||
        value.profile_url ||
        Array.isArray(value.experience) ||
        Array.isArray(value.education)
      )
  );
}

function parseJsonOrThrow(rawText, label) {
  const text = stripBom(String(rawText || "").trim());
  try {
    return JSON.parse(text);
  } catch (error) {
    const lineParsed = parseJsonLines(text);
    if (lineParsed) {
      console.warn(`[json] ${label} was JSONL; parsed ${lineParsed.length} lines.`);
      return lineParsed;
    }

    console.error(`[json] Failed to parse ${label}`, {
      message: error.message,
      firstCharacters: text.slice(0, 1000),
      lastCharacters: text.slice(-500),
    });
    throw new Error(`${label} was not valid JSON: ${error.message}`);
  }
}

function parseJsonLines(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  try {
    return lines.map((line) => JSON.parse(line));
  } catch {
    return null;
  }
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function getApifyToken() {
  const endpoint = apifyLinkedInUrl || process.env.APIFY_LINKEDIN_JOB_URL || "";
  if (!endpoint) return "";
  try {
    return new URL(endpoint).searchParams.get("token") || "";
  } catch {
    return "";
  }
}

function buildDefaultLinkedInJobUrl() {
  const token = getApifyToken();
  if (!token) return "";
  const url = new URL("https://api.apify.com/v2/acts/ayk_6789~linkedin-job-details-scraper/run-sync-get-dataset-items");
  url.searchParams.set("token", token);
  return url.toString();
}

function getRunSyncDatasetEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    if (url.pathname.endsWith("/run-sync")) {
      url.pathname = `${url.pathname}-get-dataset-items`;
      return url.toString();
    }
    return endpoint;
  } catch {
    return endpoint.replace("/run-sync?", "/run-sync-get-dataset-items?");
  }
}

function redactApifyToken(endpoint) {
  try {
    const url = new URL(endpoint);
    if (url.searchParams.has("token")) {
      url.searchParams.set("token", "***");
    }
    return url.toString();
  } catch {
    return String(endpoint).replace(/token=[^&]+/g, "token=***");
  }
}

function summarizeLinkedInProfile(profile) {
  const basic = profile?.basic_info || {};
  return {
    fullName: basic.fullname,
    publicIdentifier: basic.public_identifier,
    experiences: Array.isArray(profile?.experience) ? profile.experience.length : 0,
    education: Array.isArray(profile?.education) ? profile.education.length : 0,
    skills: Array.isArray(profile?.skills) ? profile.skills.length : 0,
  };
}

function summarizeJobDetails(job) {
  return {
    jobPostingId: job?.job_posting_id,
    title: job?.job_title,
    company: job?.company_name,
    experienceYears: [job?.experience_years_min, job?.experience_years_max].filter((value) => value !== null && value !== undefined).join("-"),
    educationLevels: Array.isArray(job?.education_level) ? job.education_level : [],
    certifications: Array.isArray(job?.certifications) ? job.certifications : [],
    skills: Array.isArray(job?.skills) ? job.skills.slice(0, 12) : [],
  };
}

function truncateForLog(value) {
  try {
    return JSON.stringify(value).slice(0, 1000);
  } catch {
    return String(value).slice(0, 1000);
  }
}

async function extractCvText(file) {
  const name = file.originalname.toLowerCase();
  const mimeType = file.mimetype || "";

  if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
    const PDFParse = getPdfParser();
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      return normalizeWhitespace(result.text || "");
    } finally {
      await parser.destroy();
    }
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return normalizeWhitespace(result.value || "");
  }

  if (mimeType.startsWith("text/") || name.endsWith(".txt")) {
    return normalizeWhitespace(file.buffer.toString("utf8"));
  }

  return "";
}

function getPdfParser() {
  if (PDFParseClass) {
    return PDFParseClass;
  }

  try {
    ({ PDFParse: PDFParseClass } = require("pdf-parse"));
    return PDFParseClass;
  } catch (error) {
    console.error("[cv] PDF parser failed to load", {
      message: error.message,
      stack: error.stack,
    });
    const wrapped = new Error("PDF parsing is unavailable in this runtime. Please upload a DOCX/TXT CV or try again later.");
    wrapped.cause = error;
    throw wrapped;
  }
}

async function buildProfileDetailsBlock({ jobs, sourcePayload }) {
  const fallback = buildRawProfileBlock({ jobs, sourcePayload });

  if (!geminiApiKey) {
    console.warn("[gemini] GEMINI_API_KEY missing; using fallback profile block.");
    return fallback;
  }

  const prompt = buildGeminiPrompt({ jobs, sourcePayload });
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
  console.info("[gemini] Generating profile details", {
    model: geminiModel,
    sourceType: sourcePayload.type,
    promptCharacters: prompt.length,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          topP: 0.9,
          maxOutputTokens: 8192,
        },
      }),
    });
    const rawText = await response.text();
    console.info("[gemini] Response received", {
      status: response.status,
      ok: response.ok,
      characters: rawText.length,
      preview: rawText.slice(0, 500),
    });

    if (!response.ok) {
      throw new Error(`Gemini failed: ${response.status} ${rawText.slice(0, 240)}`);
    }

    const data = parseJsonOrThrow(rawText, "Gemini response");
    const generated = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
    console.info("[gemini] Profile details generated", {
      outputCharacters: generated?.length || 0,
    });
    return generated || fallback;
  } catch (error) {
    console.error("[gemini] Falling back to raw profile block", {
      message: error.message,
      stack: error.stack,
    });
    return `${fallback}\n\nAI generation note: ${error.message}`;
  }
}

async function generateLatexResume({ templateId, templateCode, profile, jobDetails, sourceType }) {
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const prompt = buildLatexResumePrompt({
    templateId,
    templateCode,
    profile,
    jobDetails,
    sourceType,
  });
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

  console.info("[gemini] Generating LaTeX resume", {
    model: geminiModel,
    templateId,
    sourceType,
    promptCharacters: prompt.length,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.25,
        topP: 0.85,
        maxOutputTokens: 20000,
      },
    }),
  });

  const rawText = await response.text();
  console.info("[gemini] LaTeX response received", {
    status: response.status,
    ok: response.ok,
    characters: rawText.length,
    preview: rawText.slice(0, 500),
  });

  if (!response.ok) {
    throw new Error(`Gemini failed: ${response.status} ${rawText.slice(0, 240)}`);
  }

  const data = parseJsonOrThrow(rawText, "Gemini LaTeX response");
  const generated = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
  const latex = stripMarkdownCodeFence(generated || "");
  if (!latex) {
    throw new Error("Gemini returned an empty LaTeX response.");
  }

  return latex;
}

function buildLatexResumePrompt({ templateId, templateCode, profile, jobDetails, sourceType }) {
  const profileDetails = profile?.profile_details || "";
  const jobRequirements = extractJobRequirements(jobDetails);

  return [
    "You are an expert resume writer and LaTeX editor.",
    "Return only complete LaTeX code. Do not wrap the answer in markdown fences. Do not add explanations.",
    "Use the provided LaTeX template as the exact visual/style base. Keep the same document class, packages, custom commands, and overall structure where possible.",
    "Replace the sample content with the candidate's real profile details. Do not invent employers, schools, dates, degrees, certifications, phone numbers, links, or claims.",
    "Tailor the resume toward the target job using ATS-friendly language and keywords from the job requirements.",
    "Make experience bullets specific and impact-focused, but grounded in the candidate profile.",
    "If a field is missing from the profile, omit it cleanly instead of creating fake data.",
    "Escape LaTeX special characters correctly.",
    "When using itemize with enumitem options, write standalone starts as \\begin{itemize}[leftmargin=0.15in, label={}] with no extra closing brace after the option bracket.",
    "",
    "Selected template:",
    templateId,
    "",
    "Job input source:",
    sourceType,
    "",
    "Extracted target job requirements to use. If any field is empty because the user pasted plain text, infer it conservatively from the full job description:",
    JSON.stringify(jobRequirements, null, 2),
    "",
    "Full job details JSON:",
    JSON.stringify(jobDetails, null, 2),
    "",
    "Candidate profile row from Supabase:",
    JSON.stringify({
      name: profile?.name || "",
      email: profile?.email || "",
      job: profile?.job || null,
      cv_details: profile?.cv_details || null,
    }, null, 2),
    "",
    "Candidate profile_details text from Supabase:",
    profileDetails || "No profile_details text is available.",
    "",
    "LaTeX template to fill:",
    templateCode,
  ].join("\n");
}

function extractJobRequirements(jobDetails) {
  const experience = [
    jobDetails?.experience_years_min !== null && jobDetails?.experience_years_min !== undefined ? `${jobDetails.experience_years_min}+ years minimum` : "",
    jobDetails?.experience_years_max !== null && jobDetails?.experience_years_max !== undefined ? `${jobDetails.experience_years_max} years maximum/preferred` : "",
  ].filter(Boolean);

  return {
    job_title: jobDetails?.job_title || "",
    company_name: jobDetails?.company_name || "",
    job_description: jobDetails?.job_description || "",
    experience: experience.join(", ") || "Not explicitly provided",
    education_level: Array.isArray(jobDetails?.education_level) ? jobDetails.education_level : [],
    certifications: Array.isArray(jobDetails?.certifications) ? jobDetails.certifications : [],
    skills: Array.isArray(jobDetails?.skills) ? jobDetails.skills : [],
    seniority: jobDetails?.job_seniority_level || "",
    employment_type: jobDetails?.job_employment_type || "",
    industries: jobDetails?.job_industries || "",
  };
}

function stripMarkdownCodeFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:latex|tex)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function buildGeminiPrompt({ jobs, sourcePayload }) {
  return [
    "You are writing a detailed professional profile note for a recruiting/resume product.",
    "Return only one coherent block of plain text with clear section headings.",
    "Write all professional experiences in bullet points with specific detail.",
    "Create a large education section using all education data available.",
    "Include a concise skills/talent summary based on the user's chosen job niches.",
    "Do not invent employers, schools, dates, degrees, or claims that are not present.",
    "",
    `User-selected job/talent niches: ${jobs.join(", ")}`,
    "",
    sourcePayload.type === "linkedin"
      ? `LinkedIn profile JSON:\n${JSON.stringify(sourcePayload.profile, null, 2)}`
      : `CV upload metadata:\n${JSON.stringify({
          fileName: sourcePayload.fileName,
          mimeType: sourcePayload.mimeType,
          publicUrl: sourcePayload.publicUrl,
        }, null, 2)}\n\nExtracted CV text:\n${sourcePayload.extractedText || "No text could be extracted from this CV."}`,
  ].join("\n");
}

function buildRawProfileBlock({ jobs, sourcePayload }) {
  if (sourcePayload.type === "linkedin") {
    const profile = sourcePayload.profile || {};
    const basic = profile.basic_info || {};
    const education = Array.isArray(profile.education) ? profile.education : [];
    const experience = Array.isArray(profile.experience) ? profile.experience : [];

    return [
      "PROFILE SUMMARY",
      `${basic.fullname || "Unknown profile"}${basic.headline ? ` - ${basic.headline}` : ""}`,
      "",
      "JOB AND TALENT NICHES",
      jobs.map((job) => `- ${job}`).join("\n"),
      "",
      "EDUCATION DETAILS",
      education.length
        ? education.map(formatEducation).join("\n\n")
        : "- No education entries were returned from LinkedIn.",
      "",
      "EXPERIENCE DETAILS",
      experience.length
        ? experience.map(formatExperience).join("\n\n")
        : "- No experience entries were returned from LinkedIn.",
      "",
      "SOURCE",
      `LinkedIn: ${basic.profile_url || profile.profileUrl || sourcePayload.username}`,
    ].join("\n");
  }

  return [
    "PROFILE SUMMARY",
    "Profile generated from uploaded CV.",
    "",
    "JOB AND TALENT NICHES",
    jobs.map((job) => `- ${job}`).join("\n"),
    "",
    "CV DETAILS",
    `File: ${sourcePayload.fileName}`,
    `Public URL: ${sourcePayload.publicUrl}`,
    "",
    "EXTRACTED CV TEXT",
    sourcePayload.extractedText || "No text could be extracted from this CV.",
  ].join("\n");
}

function formatEducation(item) {
  return [
    `- School: ${item.school || "Unknown"}`,
    item.degree ? `  Degree: ${item.degree}` : "",
    item.field_of_study ? `  Field: ${item.field_of_study}` : "",
    item.duration ? `  Duration/details: ${item.duration}` : "",
    item.grade ? `  Grade: ${item.grade}` : "",
    item.activities ? `  Activities: ${item.activities}` : "",
    item.description ? `  Description: ${normalizeWhitespace(item.description)}` : "",
  ].filter(Boolean).join("\n");
}

function formatExperience(item) {
  return [
    `- ${item.title || "Role"}${item.company ? ` at ${item.company}` : ""}`,
    item.duration ? `  Duration: ${item.duration}` : "",
    item.location ? `  Location: ${item.location}` : "",
    item.employment_type ? `  Type: ${item.employment_type}` : "",
    item.description ? `  Details: ${normalizeWhitespace(item.description)}` : "",
    Array.isArray(item.skills) && item.skills.length ? `  Skills: ${item.skills.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
