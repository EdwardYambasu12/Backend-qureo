module.exports = function doctorAuth(req, res, next) {
  const doctorId = req.body?.doctorId || req.query?.doctorId;
  if (doctorId) {
    req.doctorId = doctorId;
  }
  next();
};