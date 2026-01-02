// Middleware to ensure the database is connected before handling DB-backed routes
export function requireDb(req, res, next) {
  const connected = req.app && req.app.locals && req.app.locals.dbConnected;
  if (connected) return next();
  return res.status(503).json({ success: false, message: 'Database not connected' });
}

export default { requireDb };