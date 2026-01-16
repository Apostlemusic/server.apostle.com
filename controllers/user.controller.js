import UserModel from '../model/User.js'
import OtpModel from '../model/Otp.js'
import { generateOtp } from '../middleware/utils.js'
import { forgotPasswordEmail, activationEmail } from '../middleware/emailTemplate.js'
import jwt from 'jsonwebtoken'

// Return authenticated user's profile
export const getUserProfile = async (req, res) => {
	try {
		const u = req.user
		if (!u) return res.status(401).json({ success: false, message: 'Authentication required' })
		const user = await UserModel.findById(u._id).select('-password')
		if (!user) return res.status(404).json({ success: false, message: 'User not found' })
		res.status(200).json({ success: true, user })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching profile', error: err.message })
	}
}

export const getUsers = async (req, res) => {
	try {
		const users = await UserModel.find().select('-password')
		res.status(200).json({ success: true, users })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching users', error: err.message })
	}
}

export const getUser = async (req, res) => {
	try {
		const user = await UserModel.findById(req.params.id).select('-password')
		if (!user) return res.status(404).json({ success: false, message: 'User not found' })
		res.status(200).json({ success: true, user })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching user', error: err.message })
	}
}

// ===== Auth handlers merged from auth.controllers.js =====
// Register a new user
export const register = async (req, res) => {
  try {
    const { email, password, name, phoneNumber } = req.body
    const exists = await UserModel.findOne({ email })
    if (exists) return res.status(400).json({ success: false, message: 'Email already exists' })

    const user = new UserModel({ email, password, name, phoneNumber })
    await user.save()

    try {
      const otp = await generateOtp(user._id, email)
      await activationEmail({ name: user.name || 'User', email, otp })
    } catch (e) {
      console.error('Failed to send activation email', e.message || e)
    }

    const accessToken = user.getAccessToken()
    const refreshToken = user.getRefreshToken()

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })

    res.status(201).json({
      success: true,
      user: { id: user._id, email: user.email, name: user.name },
      tokens: { accessToken, refreshToken },
      message: 'User created. Activation OTP sent to email.',
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Register error', error: err.message })
  }
}

// Login existing user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await UserModel.findOne({ email })
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' })

    const match = await user.matchPassword(password)
    if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' })

    if (!user.verified) {
      return res.status(403).json({
        success: false,
        message: 'Account not verified. Please verify your OTP to continue.',
      })
    }

    const accessToken = user.getAccessToken()
    const refreshToken = user.getRefreshToken()

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })

    res.status(200).json({
      success: true,
      user: { id: user._id, email: user.email, name: user.name },
      tokens: { accessToken, refreshToken },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Login error', error: err.message })
  }
}

export const verifyOtp = async (req, res) => {
	try {
		// Safely read inputs from body or query to avoid destructuring errors when body is undefined
		const source = (req.body && typeof req.body === 'object') ? req.body : (req.query || {})
		const email = source?.email
		let otp = source?.otp ?? source?.code

		if (!email || !otp) {
			return res.status(400).json({ success: false, message: 'email and otp are required' })
		}

		otp = String(otp).trim()

		const record = await OtpModel.findOne({ email, code: otp })
		if (!record) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' })

		// Optionally mark user as verified
		const user = await UserModel.findOne({ email })
		if (user) {
			if (!user.verified) user.verified = true
			await user.save()
		}

		// remove used OTPs for security
		await OtpModel.deleteMany({ email })
		res.status(200).json({ success: true, message: 'OTP verified' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'verifyOtp error', error: err.message })
	}
}

export const resendOtp = async (req, res) => {
	try {
		const { email } = req.body
		const user = await UserModel.findOne({ email })
		if (!user) return res.status(404).json({ success: false, message: 'User not found' })
		const otp = await generateOtp(user._id, email)
		await activationEmail({ name: user.name || 'User', email, otp })
		res.status(200).json({ success: true, message: 'OTP resent' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'resendOtp error', error: err.message })
	}
}

export const forgotPassword = async (req, res) => {
	try {
		const { email } = req.body
		const user = await UserModel.findOne({ email })
		if (!user) return res.status(404).json({ success: false, message: 'User not found' })
		const otp = await generateOtp(user._id, email)
		await forgotPasswordEmail({ name: user.name || 'User', email, otp })
		res.status(200).json({ success: true, message: 'Password reset OTP sent' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'forgotPassword error', error: err.message })
	}
}

export const resetPassword = async (req, res) => {
	try {
		const { email, otp, newPassword } = req.body
		const record = await OtpModel.findOne({ email, code: otp })
		if (!record) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' })
		const user = await UserModel.findOne({ email })
		if (!user) return res.status(404).json({ success: false, message: 'User not found' })
		user.password = newPassword
		await user.save()
		await OtpModel.deleteMany({ email })
		res.status(200).json({ success: true, message: 'Password reset successful' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'resetPassword error', error: err.message })
	}
}

export const verifyToken = async (req, res) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.headers?.authorization?.replace('Bearer ', '') ||
      req.body?.token

    if (!token) return res.status(401).json({ success: false, message: 'Token missing' })

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await UserModel.findById(decoded?.id || decoded?._id).select('-password')

    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    return res.status(200).json({
      success: true,
      valid: true,
      decoded,
      user,
      tokenSource: req.cookies?.accessToken ? 'cookie' : (req.headers?.authorization ? 'header' : 'body'),
    })
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' })
  }
}

export const logout = async (req, res) => {
  res.clearCookie('accessToken')
  res.clearCookie('refreshToken')
  res.status(200).json({ success: true, message: 'Logged out' })
}

// Check whether a user account is verified
export const isVerified = async (req, res) => {
	try {
		const source = (req.body && typeof req.body === 'object') ? req.body : (req.query || {})
		const email = source?.email
		if (!email) {
			return res.status(400).json({ success: false, message: 'email is required' })
		}

		const user = await UserModel.findOne({ email })
		if (!user) {
			return res.status(404).json({ success: false, message: 'User not found' })
		}

		return res.status(200).json({ success: true, verified: !!user.verified })
	} catch (err) {
		res.status(500).json({ success: false, message: 'isVerified error', error: err.message })
	}
}

export default {
	getUsers,
	getUser,
  getUserProfile,
	register,
	login,
	verifyOtp,
	resendOtp,
	forgotPassword,
	resetPassword,
	verifyToken,
	logout,
	isVerified,
}
