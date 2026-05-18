let app;
let loadError;

try {
  app = require("../server");
} catch (error) {
  loadError = error;
  console.error("[vercel] Failed to load Express app", {
    message: error.message,
    stack: error.stack,
  });
}

module.exports = (req, res) => {
  if (loadError) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(
      [
        "Resume Boy failed to start on Vercel.",
        "",
        loadError.message,
        "",
        loadError.stack || "",
      ].join("\n")
    );
    return;
  }

  return app(req, res);
};
