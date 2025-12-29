import AdminModel from '../model/Admin.js'
import OtpModel from '../model/Otp.js'
import { generateOtp } from '../middleware/utils.js'
import { forgotPasswordEmail, activationEmail } from '../middleware/emailTemplate.js'

export const register = async (req, res) => {
	try {
		const { email, password, name, phoneNumber } = req.body
		const exists = await AdminModel.findOne({ email })
		if (exists) return res.status(400).json({ success: false, message: 'Email already exists' })

		const admin = new AdminModel({ email, password, name, phoneNumber })
		await admin.save()

		const accessToken = admin.getAccessToken()
		const refreshToken = admin.getRefreshToken()
		res.status(201).json({ success: true, admin: { id: admin._id, email: admin.email, name: admin.name }, accessToken, refreshToken })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Admin register error', error: err.message })
	}
}

export const login = async (req, res) => {
	try {
		const { email, password } = req.body
		const admin = await AdminModel.findOne({ email })
		if (!admin) return res.status(401).json({ success: false, message: 'Invalid credentials' })

		const match = await admin.matchPassword(password)
		if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' })

		const accessToken = admin.getAccessToken()
		const refreshToken = admin.getRefreshToken()
		res.status(200).json({ success: true, admin: { id: admin._id, email: admin.email, name: admin.name }, accessToken, refreshToken })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Admin login error', error: err.message })
	}
}

export const verifyOtp = async (req, res) => {
	res.status(501).json({ message: 'verifyOtp handler not implemented' })
}

export const resendOtp = async (req, res) => {
	try {
		const { email, otp } = req.body
		const record = await OtpModel.findOne({ email, code: otp })
		if (!record) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' })
		const admin = await AdminModel.findOne({ email })
		if (admin) {
			// you might set a verified flag later; keep as stub
		}
		await OtpModel.deleteMany({ email })
		res.status(200).json({ success: true, message: 'OTP verified' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'verifyOtp error', error: err.message })
	}
}

export const forgotPassword = async (req, res) => {
	try {
		const { email } = req.body
		const admin = await AdminModel.findOne({ email })
		if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' })
		const otp = await generateOtp(admin._id, email)
		await activationEmail({ name: admin.name || 'Admin', email, otp })
		res.status(200).json({ success: true, message: 'OTP resent' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'resendOtp error', error: err.message })
	}
}

export const resetPassword = async (req, res) => {
	try {
		const { email } = req.body
		const admin = await AdminModel.findOne({ email })
		if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' })
		const otp = await generateOtp(admin._id, email)
		await forgotPasswordEmail({ name: admin.name || 'Admin', email, otp })
		res.status(200).json({ success: true, message: 'Password reset OTP sent' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'forgotPassword error', error: err.message })
	}
}

export const logout = async (req, res) => {
	try {
		const { email, otp, newPassword } = req.body
		const record = await OtpModel.findOne({ email, code: otp })
		if (!record) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' })
		const admin = await AdminModel.findOne({ email })
		if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' })
		admin.password = newPassword
		await admin.save()
		await OtpModel.deleteMany({ email })
		res.status(200).json({ success: true, message: 'Password reset successful' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'resetPassword error', error: err.message })
	}
}

export default {
	register,
	login,
	verifyOtp,
	resendOtp,
	forgotPassword,
	resetPassword,
	logout,
}
