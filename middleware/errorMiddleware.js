const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;
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
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : null,
  });
};

module.exports = errorHandler;
