import AdminModel from '../model/Admin.js'
import OtpModel from '../model/Otp.js'
import { generateOtp } from '../middleware/utils.js'
import { forgotPasswordEmail, activationEmail } from '../middleware/emailTemplate.js'
import UserModel from '../model/User.js'
import ArtistModel from '../model/Artist.js'
import SongModel from '../model/Song.js'
import AlbumModel from '../model/Album.js'
import PlayListModel from '../model/PlayList.js'
import CategoryModel from '../model/Categories.js'
import GenreModel from '../model/Genre.js'
import RecentPlaysModel from '../model/RecentPlays.js'

// Helper to set admin auth cookies in responses
function setAdminAuthCookies(res, accessToken, refreshToken) {
  if (accessToken) {
    res.cookie('apostolicadminaccesstoken', accessToken, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
      maxAge: 15 * 60 * 1000, // 15 minutes
    })
  }
  if (refreshToken) {
    // default to 7 days if env not provided; cookie expiry is separate from JWT exp
    res.cookie('apostolicadmintoken', refreshToken, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
  }
}

export const register = async (req, res) => {
	try {
		const { email, password, name, phoneNumber } = req.body
		const exists = await AdminModel.findOne({ email })
		if (exists) return res.status(400).json({ success: false, message: 'Email already exists' })

		const admin = new AdminModel({ email, password, name, phoneNumber })
		await admin.save()

		// generate and send activation OTP for admin
		try {
			const otp = await generateOtp(admin._id, email)
			await activationEmail({ name: admin.name || 'Admin', email, otp })
		} catch (e) {
			console.error('Failed to send admin activation email', e.message || e)
		}

		const accessToken = admin.getAccessToken()
		const refreshToken = admin.getRefreshToken()
		setAdminAuthCookies(res, accessToken, refreshToken)
		res.status(201).json({ success: true, admin: { id: admin._id, email: admin.email, name: admin.name }, accessToken, refreshToken, message: 'Admin created. Activation OTP sent to email.' })
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
		setAdminAuthCookies(res, accessToken, refreshToken)
		res.status(200).json({ success: true, admin: { id: admin._id, email: admin.email, name: admin.name }, accessToken, refreshToken })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Admin login error', error: err.message })
	}
}

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body
    if (!email || !otp) return res.status(400).json({ success: false, message: 'email and otp are required' })
    const record = await OtpModel.findOne({ email, code: otp })
    if (!record) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' })
    const admin = await AdminModel.findOne({ email })
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' })
    // Mark verified if the schema supports it; otherwise just acknowledge
    // Optionally add a field isVerified in Admin model; here we no-op if absent
    // @ts-ignore
    if (typeof admin.isVerified !== 'undefined') {
      admin.isVerified = true
      await admin.save()
    }
    await OtpModel.deleteMany({ email })
    res.status(200).json({ success: true, message: 'OTP verified' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'verifyOtp error', error: err.message })
  }
}

export const resendOtp = async (req, res) => {
	try {
		const { email } = req.body
		if (!email) return res.status(400).json({ success: false, message: 'email is required' })
		const admin = await AdminModel.findOne({ email })
		if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' })
		const otp = await generateOtp(admin._id, email)
		await activationEmail({ name: admin.name || 'Admin', email, otp })
		res.status(200).json({ success: true, message: 'Activation OTP resent' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'resendOtp error', error: err.message })
	}
}

export const forgotPassword = async (req, res) => {
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

export const resetPassword = async (req, res) => {
	try {
		const { email, otp, newPassword } = req.body
		if (!email || !otp || !newPassword) return res.status(400).json({ success: false, message: 'email, otp and newPassword are required' })
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

export const logout = async (req, res) => {
	try {
		// Clear admin auth cookies
		res.clearCookie('apostolicadminaccesstoken', { httpOnly: true, sameSite: 'None', secure: true })
		res.clearCookie('apostolicadmintoken', { httpOnly: true, sameSite: 'None', secure: true })
		res.status(200).json({ success: true, message: 'Logged out' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'logout error', error: err.message })
	}
}

// ===== Admin Stats =====
export const getServerStats = async (req, res) => {
	try {
		// Basic counts
		const [
			usersCount,
			artistsCount,
			songsCount,
			albumsCount,
			playlistsCount,
			categoriesCount,
			genresCount,
			hiddenSongsCount,
			hiddenAlbumsCount,
		] = await Promise.all([
			UserModel.countDocuments(),
			ArtistModel.countDocuments(),
			SongModel.countDocuments(),
			AlbumModel.countDocuments(),
			PlayListModel.countDocuments(),
			CategoryModel.countDocuments(),
			GenreModel.countDocuments(),
			SongModel.countDocuments({ hidden: true }),
			AlbumModel.countDocuments({ hidden: true }),
		])

		// Likes totals
		const [songLikesAgg, albumLikesAgg] = await Promise.all([
			SongModel.aggregate([
				{ $project: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
				{ $group: { _id: null, total: { $sum: '$likesCount' } } }
			]),
			AlbumModel.aggregate([
				{ $project: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
				{ $group: { _id: null, total: { $sum: '$likesCount' } } }
			]),
		])
		const songLikesTotal = songLikesAgg[0]?.total || 0
		const albumLikesTotal = albumLikesAgg[0]?.total || 0

		// Top categories and genres by number of songs
		const [topCategories, topGenres] = await Promise.all([
			SongModel.aggregate([
				{ $unwind: '$category' },
				{ $group: { _id: '$category', count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 10 }
			]),
			SongModel.aggregate([
				{ $unwind: '$genre' },
				{ $group: { _id: '$genre', count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 10 }
			]),
		])

		// Recent plays totals
		const recentPlaysAgg = await RecentPlaysModel.aggregate([
			{ $project: { playCount: { $size: { $ifNull: ['$recentPlays', []] } } } },
			{ $group: { _id: null, total: { $sum: '$playCount' } } }
		])
		const recentPlaysTotal = recentPlaysAgg[0]?.total || 0

		res.status(200).json({
			success: true,
			stats: {
				totals: {
					users: usersCount,
					artists: artistsCount,
					songs: songsCount,
					albums: albumsCount,
					playlists: playlistsCount,
					categories: categoriesCount,
					genres: genresCount,
					hiddenSongs: hiddenSongsCount,
					hiddenAlbums: hiddenAlbumsCount,
					songLikes: songLikesTotal,
					albumLikes: albumLikesTotal,
					recentPlays: recentPlaysTotal,
				},
				topCategories: topCategories.map(t => ({ slug: t._id, count: t.count })),
				topGenres: topGenres.map(t => ({ slug: t._id, count: t.count })),
			}
		})
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching server stats', error: err.message })
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
	getServerStats,
}
