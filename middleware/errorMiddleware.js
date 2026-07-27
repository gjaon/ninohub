// Errors thrown before a handler runs (body-parser, CORS, multer...) carry their
// own status on the error object, not on `res`. Without this, a 413 from
// express.json() was reported to the client as a generic 500.
const statusFromError = (err) => {
  const status = Number(err?.status || err?.statusCode);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 0;
};

// body-parser's "request entity too large" tells the user nothing actionable.
const friendlyMessage = (err) => {
  if (err?.type === "entity.too.large" || err?.name === "PayloadTooLargeError") {
    return "That upload is too large to send. Remove or shrink an item and try again.";
  }
  return err?.message;
};

const errorHandler = (err, req, res, next) => {
  const statusCode =
    (res.statusCode && res.statusCode >= 400 ? res.statusCode : 0) ||
    statusFromError(err) ||
    500;
  console.error("[api:error]", {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    message: err?.message,
    details: err?.details || null,
    stack: err?.stack,
  });
  res.status(statusCode);

  res.json({
    message: friendlyMessage(err),
    stack: process.env.NODE_ENV === "development" ? err.stack : null,
  });
};

module.exports = errorHandler;
