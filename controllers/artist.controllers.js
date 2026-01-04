import ArtistModel from '../model/Artist.js'
import UserModel from '../model/User.js'
import OtpModel from '../model/Otp.js'
import { generateOtp } from '../middleware/utils.js'
import { activationEmail, forgotPasswordEmail } from '../middleware/emailTemplate.js'
import SongModel from '../model/Song.js'
import AlbumModel from '../model/Album.js'
import CategoryModel from '../model/Categories.js'
import GenreModel from '../model/Genre.js'
import PlayListModel from '../model/PlayList.js'

export const uploadMiddleware = (req, res, next) => next()

// Deprecated: artist creation/update are now handled via auth + profile updates
// export const createArtist = async (req, res) => { /* deprecated */ }
// export const updateArtist = async (req, res) => { /* deprecated */ }

export const deleteArtist = async (req, res) => {
	try {
		const { artistId } = req.body
		await ArtistModel.findByIdAndDelete(artistId)
		res.status(200).json({ success: true, message: 'Artist deleted' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error deleting artist', error: err.message })
	}
}

export const followArtist = async (req, res) => {
	try {
		const { artistId, userId } = req.body
		const a = await ArtistModel.findById(artistId)
		if (!a) return res.status(404).json({ success: false, message: 'Artist not found' })
		a.followers = a.followers || []
		if (!a.followers.includes(userId)) a.followers.push(userId)
		else a.followers = a.followers.filter(f => f !== userId)
		await a.save()
		res.status(200).json({ success: true, followers: a.followers })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error toggling follow', error: err.message })
	}
}

export const likeArtist = async (req, res) => {
	try {
		const { artistId, userId } = req.body
		const a = await ArtistModel.findById(artistId)
		if (!a) return res.status(404).json({ success: false, message: 'Artist not found' })
		a.likes = a.likes || []
		if (!a.likes.includes(userId)) a.likes.push(userId)
		else a.likes = a.likes.filter(l => l !== userId)
		await a.save()
		res.status(200).json({ success: true, likes: a.likes })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error toggling like', error: err.message })
	}
}

export const getAllArtists = async (req, res) => {
	try {
		const artists = await ArtistModel.find()
		res.status(200).json({ success: true, artists })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching artists', error: err.message })
	}
}

export const getArtistById = async (req, res) => {
	try {
		const a = await ArtistModel.findById(req.params.artistId)
		if (!a) return res.status(404).json({ success: false, message: 'Artist not found' })
		res.status(200).json({ success: true, artist: a })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching artist', error: err.message })
	}
}

export const getMyArtists = async (req, res) => {
	res.status(501).json({ message: 'getMyArtists not implemented' })
}

export const getLikedArtists = async (req, res) => {
	res.status(501).json({ message: 'getLikedArtists not implemented' })
}

export const getFollowedArtists = async (req, res) => {
	res.status(501).json({ message: 'getFollowedArtists not implemented' })
}

// ===== Artist content management: Songs =====
function requireArtist(req, res) {
	const user = req.user
	if (!user) return { error: res.status(401).json({ success: false, message: 'Authentication required' }) }
	if (user.role !== 'artist') return { error: res.status(403).json({ success: false, message: 'Artist account required' }) }
	return { user }
}

export const uploadSong = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const payload = { ...req.body, userId: String(user._id), hidden: false }
		const song = new SongModel(payload)
		await song.save()
		res.status(201).json({ success: true, song })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error uploading song', error: err.message })
	}
}

export const editSong = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const { songId, ...rest } = req.body
		const song = await SongModel.findById(songId)
		if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
		if (String(song.userId) !== String(user._id)) return res.status(403).json({ success: false, message: 'Not owner of song' })
		Object.assign(song, rest)
		await song.save()
		res.status(200).json({ success: true, song })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error editing song', error: err.message })
	}
}

export const removeSong = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const { songId } = req.body
		const song = await SongModel.findById(songId)
		if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
		if (String(song.userId) !== String(user._id)) return res.status(403).json({ success: false, message: 'Not owner of song' })
		await song.deleteOne()
		res.status(200).json({ success: true, message: 'Song removed' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error removing song', error: err.message })
	}
}

export const hideSong = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const { songId } = req.body
		const song = await SongModel.findById(songId)
		if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
		if (String(song.userId) !== String(user._id)) return res.status(403).json({ success: false, message: 'Not owner of song' })
		song.hidden = true
		await song.save()
		res.status(200).json({ success: true, song })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error hiding song', error: err.message })
	}
}

export const unhideSong = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const { songId } = req.body
		const song = await SongModel.findById(songId)
		if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
		if (String(song.userId) !== String(user._id)) return res.status(403).json({ success: false, message: 'Not owner of song' })
		song.hidden = false
		await song.save()
		res.status(200).json({ success: true, song })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error unhiding song', error: err.message })
	}
}

export const getMySongs = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const songs = await SongModel.find({ userId: String(user._id) })
		res.status(200).json({ success: true, songs })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching my songs', error: err.message })
	}
}

// ===== Artist content management: Albums =====
export const uploadAlbum = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		// Helpers for taxonomy normalization and upsert
		const toSlug = (str = '') => String(str).trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, '-').replace(/_/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
		const titleCase = (str = '') => String(str).trim().toLowerCase().split(/[-\s_]+/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
		const normalizeArray = (input) => {
			if (!input) return []
			const arr = Array.isArray(input) ? input : [input]
			const slugs = arr.map(v => toSlug(v)).filter(v => v && v.length > 0)
			return [...new Set(slugs)]
		}
		const ensureCategoriesExist = async (categories) => {
			const slugs = normalizeArray(categories)
			for (const slug of slugs) {
				const existing = await CategoryModel.findOne({ slug })
				if (!existing) await new CategoryModel({ name: titleCase(slug), slug }).save()
			}
			return slugs
		}
		const ensureGenresExist = async (genres) => {
			const slugs = normalizeArray(genres)
			for (const slug of slugs) {
				const existing = await GenreModel.findOne({ slug })
				if (!existing) await new GenreModel({ name: titleCase(slug), slug }).save()
			}
			return slugs
		}

		const payload = { ...req.body, artistUserId: String(user._id), hidden: false }
		payload.category = await ensureCategoriesExist(payload.category)
		payload.genre = await ensureGenresExist(payload.genre)
		const album = new AlbumModel(payload)
		await album.save()
		res.status(201).json({ success: true, album })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error uploading album', error: err.message })
	}
}

export const editAlbum = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const { albumId, ...rest } = req.body
		const album = await AlbumModel.findById(albumId)
		if (!album) return res.status(404).json({ success: false, message: 'Album not found' })
		if (String(album.artistUserId) !== String(user._id)) return res.status(403).json({ success: false, message: 'Not owner of album' })
		// taxonomy handling
		const toSlug = (str = '') => String(str).trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, '-').replace(/_/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
		const titleCase = (str = '') => String(str).trim().toLowerCase().split(/[-\s_]+/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
		const normalizeArray = (input) => {
			if (!input) return []
			const arr = Array.isArray(input) ? input : [input]
			const slugs = arr.map(v => toSlug(v)).filter(v => v && v.length > 0)
			return [...new Set(slugs)]
		}
		const ensureCategoriesExist = async (categories) => {
			const slugs = normalizeArray(categories)
			for (const slug of slugs) {
				const existing = await CategoryModel.findOne({ slug })
				if (!existing) await new CategoryModel({ name: titleCase(slug), slug }).save()
			}
			return slugs
		}
		const ensureGenresExist = async (genres) => {
			const slugs = normalizeArray(genres)
			for (const slug of slugs) {
				const existing = await GenreModel.findOne({ slug })
				if (!existing) await new GenreModel({ name: titleCase(slug), slug }).save()
			}
			return slugs
		}
		if (rest.category) album.category = await ensureCategoriesExist(rest.category)
		if (rest.genre) album.genre = await ensureGenresExist(rest.genre)
		const { category: _cIgnored, genre: _gIgnored, ...others } = rest
		Object.assign(album, others)
		await album.save()
		res.status(200).json({ success: true, album })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error editing album', error: err.message })
	}
}

export const removeAlbum = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const { albumId } = req.body
		const album = await AlbumModel.findById(albumId)
		if (!album) return res.status(404).json({ success: false, message: 'Album not found' })
		if (String(album.artistUserId) !== String(user._id)) return res.status(403).json({ success: false, message: 'Not owner of album' })
		await album.deleteOne()
		res.status(200).json({ success: true, message: 'Album removed' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error removing album', error: err.message })
	}
}

export const hideAlbum = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const { albumId } = req.body
		const album = await AlbumModel.findById(albumId)
		if (!album) return res.status(404).json({ success: false, message: 'Album not found' })
		if (String(album.artistUserId) !== String(user._id)) return res.status(403).json({ success: false, message: 'Not owner of album' })
		album.hidden = true
		await album.save()
		res.status(200).json({ success: true, album })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error hiding album', error: err.message })
	}
}

export const unhideAlbum = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const { albumId } = req.body
		const album = await AlbumModel.findById(albumId)
		if (!album) return res.status(404).json({ success: false, message: 'Album not found' })
		if (String(album.artistUserId) !== String(user._id)) return res.status(403).json({ success: false, message: 'Not owner of album' })
		album.hidden = false
		await album.save()
		res.status(200).json({ success: true, album })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error unhiding album', error: err.message })
	}
}

export const getMyAlbums = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const albums = await AlbumModel.find({ artistUserId: String(user._id) })
		res.status(200).json({ success: true, albums })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching my albums', error: err.message })
	}
}

// ===== Artist profile updates =====
export const getArtistStats = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const userId = String(user._id)
		const profile = await ArtistModel.findOne({ userId })

		// Basic counts (my content)
		const [
			songsCount,
			albumsCount,
			playlistsCount,
			hiddenSongsCount,
			hiddenAlbumsCount,
		] = await Promise.all([
			SongModel.countDocuments({ userId }),
			AlbumModel.countDocuments({ artistUserId: userId }),
			PlayListModel.countDocuments({ userId }),
			SongModel.countDocuments({ userId, hidden: true }),
			AlbumModel.countDocuments({ artistUserId: userId, hidden: true }),
		])

		// Likes totals for my songs/albums
		const [songLikesAgg, albumLikesAgg] = await Promise.all([
			SongModel.aggregate([
				{ $match: { userId } },
				{ $project: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
				{ $group: { _id: null, total: { $sum: '$likesCount' } } }
			]),
			AlbumModel.aggregate([
				{ $match: { artistUserId: userId } },
				{ $project: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
				{ $group: { _id: null, total: { $sum: '$likesCount' } } }
			]),
		])
		const songLikesTotal = songLikesAgg[0]?.total || 0
		const albumLikesTotal = albumLikesAgg[0]?.total || 0

		// Top categories and genres across my songs
		const [topCategories, topGenres] = await Promise.all([
			SongModel.aggregate([
				{ $match: { userId } },
				{ $unwind: '$category' },
				{ $group: { _id: '$category', count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 10 }
			]),
			SongModel.aggregate([
				{ $match: { userId } },
				{ $unwind: '$genre' },
				{ $group: { _id: '$genre', count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 10 }
			]),
		])

		res.status(200).json({
			success: true,
			stats: {
				totals: {
					songs: songsCount,
					albums: albumsCount,
					playlists: playlistsCount,
					hiddenSongs: hiddenSongsCount,
					hiddenAlbums: hiddenAlbumsCount,
					songLikes: songLikesTotal,
					albumLikes: albumLikesTotal,
					followers: profile ? (profile.followers?.length || 0) : 0,
					profileLikes: profile ? (profile.likes?.length || 0) : 0,
				},
				topCategories: topCategories.map(t => ({ slug: t._id, count: t.count })),
				topGenres: topGenres.map(t => ({ slug: t._id, count: t.count })),
			}
		})
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching artist stats', error: err.message })
	}
}

export const editArtistProfile = async (req, res) => {
	const { user, error } = requireArtist(req, res); if (error) return
	try {
		const profile = await ArtistModel.findOne({ userId: String(user._id) })
		if (!profile) return res.status(404).json({ success: false, message: 'Artist profile not found' })
		Object.assign(profile, req.body)
		await profile.save()
		res.status(200).json({ success: true, artist: profile })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error updating profile', error: err.message })
	}
}

// Artist auth & account management
export const register = async (req, res) => {
	try {
		const { email, password, name, type } = req.body
		const exists = await UserModel.findOne({ email })
		if (exists) return res.status(400).json({ success: false, message: 'Email already exists' })

		const user = new UserModel({ email, password, name, role: 'artist' })
		await user.save()

		// Create artist profile linked to user
		const profile = new ArtistModel({ userId: String(user._id), type: type || 'artist', name: name || 'Artist' })
		await profile.save()

		// Send activation OTP
		try {
			const otp = await generateOtp(user._id, email)
			await activationEmail({ name: user.name || 'Artist', email, otp })
		} catch (e) {
			console.error('Failed to send activation email', e.message || e)
		}

		const accessToken = user.getAccessToken()
		const refreshToken = user.getRefreshToken()
		// Set auth cookies for browser flows (cross-site): SameSite=None + Secure
		res.cookie('apostolicaccesstoken', accessToken, {
			httpOnly: true,
			sameSite: 'None',
			secure: true,
			maxAge: 15 * 60 * 1000, // 15 minutes
		})
		res.cookie('apostolictoken', refreshToken, {
			httpOnly: true,
			sameSite: 'None',
			secure: true,
			maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
		})
		res.status(201).json({ success: true, artist: { id: profile._id, userId: user._id, name: profile.name }, accessToken, refreshToken, message: 'Artist created. Activation OTP sent to email.' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Artist register error', error: err.message })
	}
}

export const login = async (req, res) => {
	try {
		const { email, password } = req.body
		const user = await UserModel.findOne({ email })
		if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' })

		const match = await user.matchPassword(password)
		if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' })

		if (user.role !== 'artist') {
			return res.status(403).json({ success: false, message: 'Not an artist account' })
		}

		if (!user.verified) {
			return res.status(403).json({ success: false, message: 'Account not verified. Please verify your OTP to continue.' })
		}

		const accessToken = user.getAccessToken()
		const refreshToken = user.getRefreshToken()
		// Set auth cookies for browser flows (cross-site): SameSite=None + Secure
		res.cookie('apostolicaccesstoken', accessToken, {
			httpOnly: true,
			sameSite: 'None',
			secure: true,
			maxAge: 15 * 60 * 1000, // 15 minutes
		})
		res.cookie('apostolictoken', refreshToken, {
			httpOnly: true,
			sameSite: 'None',
			secure: true,
			maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
		})
		// Fetch artist profile for convenience
		const profile = await ArtistModel.findOne({ userId: String(user._id) })
		res.status(200).json({ success: true, artist: profile, accessToken, refreshToken })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Artist login error', error: err.message })
	}
}

export const verifyOtp = async (req, res) => {
	try {
		const source = (req.body && typeof req.body === 'object') ? req.body : (req.query || {})
		const email = source?.email
		let otp = source?.otp ?? source?.code
		if (!email || !otp) return res.status(400).json({ success: false, message: 'email and otp are required' })
		otp = String(otp).trim()
		const record = await OtpModel.findOne({ email, code: otp })
		if (!record) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' })
		const user = await UserModel.findOne({ email })
		if (user) {
			user.verified = true
			user.role = user.role || 'artist'
			await user.save()
		}
		await OtpModel.deleteMany({ email })
		res.status(200).json({ success: true, message: 'OTP verified' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Artist verifyOtp error', error: err.message })
	}
}

export const resendOtp = async (req, res) => {
	try {
		const { email } = req.body
		const user = await UserModel.findOne({ email })
		if (!user) return res.status(404).json({ success: false, message: 'User not found' })
		const otp = await generateOtp(user._id, email)
		await activationEmail({ name: user.name || 'Artist', email, otp })
		res.status(200).json({ success: true, message: 'OTP resent' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Artist resendOtp error', error: err.message })
	}
}

export const forgotPassword = async (req, res) => {
	try {
		const { email } = req.body
		const user = await UserModel.findOne({ email })
		if (!user) return res.status(404).json({ success: false, message: 'User not found' })
		const otp = await generateOtp(user._id, email)
		await forgotPasswordEmail({ name: user.name || 'Artist', email, otp })
		res.status(200).json({ success: true, message: 'Password reset OTP sent' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Artist forgotPassword error', error: err.message })
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
		res.status(500).json({ success: false, message: 'Artist resetPassword error', error: err.message })
	}
}

export const isVerified = async (req, res) => {
	try {
		const source = (req.body && typeof req.body === 'object') ? req.body : (req.query || {})
		const email = source?.email
		if (!email) return res.status(400).json({ success: false, message: 'email is required' })
		const user = await UserModel.findOne({ email })
		if (!user) return res.status(404).json({ success: false, message: 'User not found' })
		if (user.role !== 'artist') return res.status(403).json({ success: false, message: 'Not an artist account' })
		res.status(200).json({ success: true, verified: !!user.verified })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Artist isVerified error', error: err.message })
	}
}

export default {
	uploadMiddleware,
	deleteArtist,
	followArtist,
	likeArtist,
	getAllArtists,
	getArtistById,
	getMyArtists,
	getLikedArtists,
	getFollowedArtists,
  register,
  login,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  isVerified,
	uploadSong,
	editSong,
	removeSong,
	hideSong,
	unhideSong,
	getMySongs,
	uploadAlbum,
	editAlbum,
	removeAlbum,
	hideAlbum,
	unhideAlbum,
	getMyAlbums,
	editArtistProfile,
}
