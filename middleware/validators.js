// Simple request payload validators for auth/admin flows

export function validateRegister(req, res, next) {
  const { email, password } = req.body || {}
  const errors = []
  if (!email) errors.push('email is required')
  if (!password) errors.push('password is required')
  else if (typeof password === 'string' && password.length < 6) errors.push('password must be at least 6 characters')
  if (errors.length) return res.status(400).json({ success: false, errors })
  next()
}

export function validateLogin(req, res, next) {
  const { email, password } = req.body || {}
  const errors = []
  if (!email) errors.push('email is required')
  if (!password) errors.push('password is required')
  if (errors.length) return res.status(400).json({ success: false, errors })
  next()
}

export function validateForgotPassword(req, res, next) {
  const { email } = req.body || {}
  if (!email) return res.status(400).json({ success: false, errors: ['email is required'] })
  next()
}

export function validateResetPassword(req, res, next) {
  const { email, otp, newPassword } = req.body || {}
  const errors = []
  if (!email) errors.push('email is required')
  if (!otp) errors.push('otp is required')
  if (!newPassword) errors.push('newPassword is required')
  else if (typeof newPassword === 'string' && newPassword.length < 6) errors.push('newPassword must be at least 6 characters')
  if (errors.length) return res.status(400).json({ success: false, errors })
  next()
}

export default {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
}
