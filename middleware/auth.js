// JWT disabled — auth middleware is a no-op passthrough
// userId is passed directly in request body or query params
module.exports = function authMiddleware(req, res, next) {
  const userId = req.body?.userId || req.query?.userId;
  if (userId) {
    req.userId = userId;
  }
  next();
};