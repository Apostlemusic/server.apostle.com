import ArtistModel from '../model/Artist.js'
import SongModel from '../model/Song.js'
import AlbumModel from '../model/Album.js'
import mongoose from 'mongoose'
import UserModel from '../model/User.js'
import OtpModel from '../model/Otp.js'
import { generateOtp } from '../middleware/utils.js'
import { activationEmail, forgotPasswordEmail } from '../middleware/emailTemplate.js'
import RecentPlaysModel from '../model/RecentPlays.js'
import PlaybackModel from '../model/Playback.js'
import CategoryModel from '../model/Categories.js'
import GenreModel from '../model/Genre.js'
import PlayListModel from '../model/PlayList.js'
import { toSlug, titleCase, normalizeArray, ensureCategoriesExist, ensureGenresExist, generateApostleId, getUserKey } from '../middleware/utils.js'

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
		const artistsWithCounts = artists.map(a => ({
			...(typeof a.toObject === 'function' ? a.toObject() : a),
			likesCount: a.likes?.length || 0,
			followersCount: a.followers?.length || 0,
		}))
		res.status(200).json({ success: true, artists: artistsWithCounts })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching artists', error: err.message })
	}
}

export const getArtistById = async (req, res) => {
	try {
		const id = String(req.params.id || '').trim()
		const isObjectId = mongoose.Types.ObjectId.isValid(id)

		const artist = isObjectId
			? await ArtistModel.findById(id)
			: await ArtistModel.findOne({ $or: [{ artistId: id }, { userId: id }] })

		if (!artist) {
			return res.status(404).json({ success: false, message: 'Artist not found' })
		}

		const artistKey = artist.artistId || artist.userId
		const [songs, albums] = await Promise.all([
			SongModel.find({ $or: [{ userId: artist.userId }, { artists: artistKey }] }),
			AlbumModel.find({ artistUserId: artist.userId }),
		])
		const songsWithCounts = await attachListenCountsToSongs(songs)

		const artistObj = typeof artist.toObject === 'function' ? artist.toObject() : artist
		artistObj.likesCount = artist.likes?.length || 0
		artistObj.followersCount = artist.followers?.length || 0

		res.status(200).json({
			success: true,
			artist: artistObj,
			songs: songsWithCounts,
			albums,
		})
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching artist', error: err.message })
	}
}

export const getArtistByName = async (req, res) => {
	try {
		const name = String(req.params.name || '').trim()
		if (!name) return res.status(400).json({ success: false, message: 'Artist name is required' })

		const artist = await ArtistModel.findOne({ name: new RegExp(`^${name}$`, 'i') })
		if (!artist) return res.status(404).json({ success: false, message: 'Artist not found' })

		const artistKey = artist.artistId || artist.userId
		const [songs, albums] = await Promise.all([
			SongModel.find({ $or: [{ userId: artist.userId }, { artists: artistKey }] }),
			AlbumModel.find({ artistUserId: artist.userId }),
		])
		const songsWithCounts = await attachListenCountsToSongs(songs)

		const artistObj = typeof artist.toObject === 'function' ? artist.toObject() : artist
		artistObj.likesCount = artist.likes?.length || 0
		artistObj.followersCount = artist.followers?.length || 0

		res.status(200).json({ success: true, artist: artistObj, songs: songsWithCounts, albums })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching artist by name', error: err.message })
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

export const searchArtists = async (req, res) => {
	try {
		const q = String(req.query.q || req.query.query || '').trim()
		if (!q) return res.status(400).json({ success: false, message: 'Search query is required' })
		const limit = Math.min(Number(req.query.limit || 10), 50)
		const rx = new RegExp(q, 'i')
		const artists = await ArtistModel.find({ name: rx }).limit(limit)
		const results = artists.map(a => ({
			artistId: a.artistId,
			name: a.name,
			profileImg: a.profileImg,
			type: a.type,
		}))
		return res.status(200).json({ success: true, artists: results })
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Error searching artists', error: err.message })
	}
}

// ===== Artist content management: Songs =====
function requireArtist(req, res) {
	const user = req.user
	if (!user) return { error: res.status(401).json({ success: false, message: 'Authentication required' }) }
	if (user.role !== 'artist') return { error: res.status(403).json({ success: false, message: 'Artist account required' }) }
	const userKey = getUserKey(user)
	const userKeys = [userKey, String(user._id)].filter(Boolean)
	return { user, userKey, userKeys }
}

function normalizeArtistIds(input) {
	if (!input) return []
	const arr = Array.isArray(input) ? input : [input]
	const ids = arr
		.map((item) => {
			if (typeof item === 'string') return item.trim()
			if (item && typeof item === 'object') return String(item.artistId || item.id || '').trim()
			return ''
		})
		.filter(Boolean)
	return [...new Set(ids)]
}

async function attachListenCountsToSongs(songs) {
	const list = Array.isArray(songs) ? songs : [songs]
	if (list.length === 0) return []
	const ids = list.map(s => s._id).filter(Boolean)
	const agg = await PlaybackModel.aggregate([
		{ $match: { itemType: 'song', itemId: { $in: ids } } },
		{ $group: { _id: '$itemId', count: { $sum: 1 } } },
	])
	const map = new Map(agg.map(a => [String(a._id), a.count]))
	return list.map((song) => {
		const obj = typeof song?.toObject === 'function' ? song.toObject() : song
		const entries = Object.entries(obj || {})
		const nextEntries = []
		let inserted = false
		for (const [key, value] of entries) {
			nextEntries.push([key, value])
			if (key === 'trackUrl') {
				nextEntries.push(['listensCount', map.get(String(song._id)) || 0])
				inserted = true
			}
		}
		if (!inserted) {
			nextEntries.push(['listensCount', map.get(String(song._id)) || 0])
		}
		return Object.fromEntries(nextEntries)
	})
}

export const uploadSong = async (req, res) => {
	const { user, userKey, error } = requireArtist(req, res); if (error) return
	try {
		const profile = await ArtistModel.findOne({ userId: { $in: [userKey, String(user._id)].filter(Boolean) } })
		const primaryArtistId = profile?.artistId
		const collaboratorIds = normalizeArtistIds(req.body?.artistIds ?? req.body?.collaborators ?? req.body?.artists)
		const artists = primaryArtistId
			? [primaryArtistId, ...collaboratorIds.filter((id) => id !== primaryArtistId)]
			: collaboratorIds

		const payload = { ...req.body, userId: userKey, hidden: false, artists }
		// Generate sequential trackId if missing
		if (!payload.trackId) {
			payload.trackId = await generateApostleId({ role: 'artist', type: 'TRK' })
		}
		const categorySlugs = normalizeArray(payload.category)
		const genreSlugs = normalizeArray(payload.genre)
		const podcastSlug = toSlug('podcast')
		const isPodcast = categorySlugs.includes(podcastSlug) || genreSlugs.includes(podcastSlug)
		payload.category = await ensureCategoriesExist(payload.category, { contentType: isPodcast ? 'podcast' : undefined })
		payload.genre = await ensureGenresExist(payload.genre)
		if (!payload.contentType) {
			payload.contentType = isPodcast ? 'podcast' : 'song'
		}
		const song = new SongModel(payload)
		await song.save()
		res.status(201).json({ success: true, song })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error uploading song', error: err.message })
	}
}

export const editSong = async (req, res) => {
	const { user, userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const { songId, ...rest } = req.body
		const song = await SongModel.findById(songId)
		if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
		if (!userKeys.includes(String(song.userId))) return res.status(403).json({ success: false, message: 'Not owner of song' })
		const categorySlugs = rest.category ? normalizeArray(rest.category) : (song.category || [])
		const genreSlugs = rest.genre ? normalizeArray(rest.genre) : (song.genre || [])
		const podcastSlug = toSlug('podcast')
		const isPodcast = categorySlugs.includes(podcastSlug) || genreSlugs.includes(podcastSlug)
		if (rest.category) {
			rest.category = await ensureCategoriesExist(rest.category, { contentType: isPodcast ? 'podcast' : undefined })
		}
		if (rest.genre) {
			rest.genre = await ensureGenresExist(rest.genre)
		}
		if (rest.artistIds || rest.collaborators || rest.artists) {
			const profile = await ArtistModel.findOne({ userId: { $in: userKeys } })
			const primaryArtistId = profile?.artistId
			const collaboratorIds = normalizeArtistIds(rest.artistIds ?? rest.collaborators ?? rest.artists)
			song.artists = primaryArtistId
				? [primaryArtistId, ...collaboratorIds.filter((id) => id !== primaryArtistId)]
				: collaboratorIds
		}
		const { artistIds: _aIgnored, collaborators: _cIgnored, ...restPayload } = rest
		Object.assign(song, restPayload)
		if (rest.contentType) {
			song.contentType = rest.contentType
		} else if (rest.category || rest.genre) {
			song.contentType = isPodcast ? 'podcast' : 'song'
		}
		await song.save()
		res.status(200).json({ success: true, song })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error editing song', error: err.message })
	}
}

export const removeSong = async (req, res) => {
	const { userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const { songId } = req.body
		const song = await SongModel.findById(songId)
		if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
		if (!userKeys.includes(String(song.userId))) return res.status(403).json({ success: false, message: 'Not owner of song' })
		await song.deleteOne()
		res.status(200).json({ success: true, message: 'Song removed' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error removing song', error: err.message })
	}
}

export const hideSong = async (req, res) => {
	const { userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const { songId } = req.body
		const song = await SongModel.findById(songId)
		if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
		if (!userKeys.includes(String(song.userId))) return res.status(403).json({ success: false, message: 'Not owner of song' })
		song.hidden = true
		await song.save()
		res.status(200).json({ success: true, song })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error hiding song', error: err.message })
	}
}

export const unhideSong = async (req, res) => {
	const { userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const { songId } = req.body
		const song = await SongModel.findById(songId)
		if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
		if (!userKeys.includes(String(song.userId))) return res.status(403).json({ success: false, message: 'Not owner of song' })
		song.hidden = false
		await song.save()
		res.status(200).json({ success: true, song })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error unhiding song', error: err.message })
	}
}

export const getMySongs = async (req, res) => {
	const { userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const profile = await ArtistModel.findOne({ userId: { $in: userKeys } })
		const artistKey = profile?.artistId
		const songs = await SongModel.find({
			$or: [
				{ userId: { $in: userKeys } },
				...(artistKey ? [{ artists: artistKey }] : []),
			],
		})
		const songsWithCounts = await attachListenCountsToSongs(songs)
		res.status(200).json({ success: true, songs: songsWithCounts })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching my songs', error: err.message })
	}
}

// ===== Artist content management: Albums =====
export const uploadAlbum = async (req, res) => {
	const { user, userKey, error } = requireArtist(req, res); if (error) return
	try {
		const profile = await ArtistModel.findOne({ userId: { $in: [userKey, String(user._id)].filter(Boolean) } })
		const primaryArtistId = profile?.artistId

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

		const payload = { ...req.body, artistUserId: userKey, hidden: false }
		// Generate sequential albumId
		payload.albumId = await generateApostleId({ role: 'artist', type: 'ALB' })
		payload.category = await ensureCategoriesExist(payload.category)
		payload.genre = await ensureGenresExist(payload.genre)

		// If songs are provided, create them and attach to album
		const songs = Array.isArray(payload.songs) ? payload.songs : []
		let trackIds = []
		if (songs.length > 0) {
			for (const s of songs) {
				// basic validation for required song fields
				const required = ['trackUrl', 'title', 'author', 'trackImg']
				for (const key of required) {
					if (!s[key]) {
						return res.status(400).json({ success: false, message: `Song field \`${key}\` is required` })
					}
				}
				const collaboratorIds = normalizeArtistIds(s?.artistIds ?? s?.collaborators ?? s?.artists)
				const artists = primaryArtistId
					? [primaryArtistId, ...collaboratorIds.filter((id) => id !== primaryArtistId)]
					: collaboratorIds
				const songPayload = {
					...s,
					userId: userKey,
					hidden: false,
					artists,
				}
				// Generate trackId if missing
				if (!songPayload.trackId) {
					songPayload.trackId = await generateApostleId({ role: 'artist', type: 'TRK' })
				}
				// If song has taxonomy, normalize and ensure exist
				songPayload.category = await ensureCategoriesExist(songPayload.category || payload.category)
				songPayload.genre = await ensureGenresExist(songPayload.genre || payload.genre)
				if (!songPayload.contentType) {
					const podcastSlug = toSlug('podcast')
					const isPodcast = (songPayload.category || []).includes(podcastSlug) || (songPayload.genre || []).includes(podcastSlug)
					songPayload.contentType = isPodcast ? 'podcast' : 'song'
				}
				const song = new SongModel(songPayload)
				await song.save()
				trackIds.push(song.trackId)
			}
		} else {
			// No songs array provided; require at least one trackId in payload for album consistency
			const providedTrackIds = Array.isArray(payload.tracksId) ? payload.tracksId : []
			if (providedTrackIds.length === 0) {
				return res.status(400).json({ success: false, message: 'Album must include at least one song (provide `songs` array or `tracksId` list).' })
			}
			trackIds = providedTrackIds
		}

		const albumPayload = { ...payload }
		albumPayload.tracksId = trackIds
		// Do not persist raw songs array in album document
		delete albumPayload.songs

		const album = new AlbumModel(albumPayload)
		await album.save()
		res.status(201).json({ success: true, album })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error uploading album', error: err.message })
	}
}

export const editAlbum = async (req, res) => {
	const { userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const { albumId, ...rest } = req.body
		const album = await AlbumModel.findById(albumId)
		if (!album) return res.status(404).json({ success: false, message: 'Album not found' })
		if (!userKeys.includes(String(album.artistUserId))) return res.status(403).json({ success: false, message: 'Not owner of album' })
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
	const { userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const { albumId } = req.body
		const album = await AlbumModel.findById(albumId)
		if (!album) return res.status(404).json({ success: false, message: 'Album not found' })
		if (!userKeys.includes(String(album.artistUserId))) return res.status(403).json({ success: false, message: 'Not owner of album' })
		await album.deleteOne()
		res.status(200).json({ success: true, message: 'Album removed' })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error removing album', error: err.message })
	}
}

export const hideAlbum = async (req, res) => {
	const { userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const { albumId } = req.body
		const album = await AlbumModel.findById(albumId)
		if (!album) return res.status(404).json({ success: false, message: 'Album not found' })
		if (!userKeys.includes(String(album.artistUserId))) return res.status(403).json({ success: false, message: 'Not owner of album' })
		album.hidden = true
		await album.save()
		res.status(200).json({ success: true, album })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error hiding album', error: err.message })
	}
}

export const unhideAlbum = async (req, res) => {
	const { userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const { albumId } = req.body
		const album = await AlbumModel.findById(albumId)
		if (!album) return res.status(404).json({ success: false, message: 'Album not found' })
		if (!userKeys.includes(String(album.artistUserId))) return res.status(403).json({ success: false, message: 'Not owner of album' })
		album.hidden = false
		await album.save()
		res.status(200).json({ success: true, album })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error unhiding album', error: err.message })
	}
}

export const getMyAlbums = async (req, res) => {
	const { userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const albums = await AlbumModel.find({ artistUserId: { $in: userKeys } })
		res.status(200).json({ success: true, albums })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching my albums', error: err.message })
	}
}

// Upload a single song directly into an existing album (generate trackId and update album.tracksId)
export const uploadSongToAlbum = async (req, res) => {
	const { userKey, userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const { albumId, ...songInput } = req.body
		if (!albumId) return res.status(400).json({ success: false, message: 'albumId is required' })
		const album = await AlbumModel.findById(albumId)
		if (!album) return res.status(404).json({ success: false, message: 'Album not found' })
		if (!userKeys.includes(String(album.artistUserId))) return res.status(403).json({ success: false, message: 'Not owner of album' })

		// Basic required song fields (trackId optional - will be generated)
		const required = ['trackUrl', 'title', 'author', 'trackImg']
		for (const key of required) {
			if (!songInput[key]) {
				return res.status(400).json({ success: false, message: `Song field \`${key}\` is required` })
			}
		}

		// taxonomy helpers
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

		const profile = await ArtistModel.findOne({ userId: { $in: userKeys } })
		const primaryArtistId = profile?.artistId
		const collaboratorIds = normalizeArtistIds(songInput?.artistIds ?? songInput?.collaborators ?? songInput?.artists)
		const artists = primaryArtistId
			? [primaryArtistId, ...collaboratorIds.filter((id) => id !== primaryArtistId)]
			: collaboratorIds
		const songPayload = {
			...songInput,
			userId: userKey,
			hidden: false,
			artists,
		}
		// Generate trackId if missing
		if (!songPayload.trackId) {
			songPayload.trackId = await generateApostleId({ role: 'artist', type: 'TRK' })
		}
		// Normalize taxonomy (fallback to album's taxonomy if not provided)
		songPayload.category = await ensureCategoriesExist(songPayload.category || album.category)
		songPayload.genre = await ensureGenresExist(songPayload.genre || album.genre)

		const song = new SongModel(songPayload)
		await song.save()

		album.tracksId = Array.isArray(album.tracksId) ? album.tracksId : []
		if (!album.tracksId.includes(song.trackId)) album.tracksId.push(song.trackId)
		await album.save()

		res.status(201).json({ success: true, song, album })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error uploading song to album', error: err.message })
	}
}

// ===== Artist profile updates =====
export const getArtistProfile = async (req, res) => {
	const { user, userKey, userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const profile = await ArtistModel.findOne({ userId: { $in: userKeys } })
		if (!profile) return res.status(404).json({ success: false, message: 'Artist profile not found' })
		const artistObj = profile && typeof profile.toObject === 'function' ? profile.toObject() : profile
		artistObj.email = user.email
		artistObj.userId = userKey
		res.status(200).json({ success: true, artist: artistObj })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error fetching profile', error: err.message })
	}
}
export const getArtistStats = async (req, res) => {
	const { user, userKey, userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const profile = await ArtistModel.findOne({ userId: { $in: userKeys } })

		// Basic counts (my content)
		const [
			songsCount,
			albumsCount,
			playlistsCount,
			hiddenSongsCount,
			hiddenAlbumsCount,
		] = await Promise.all([
			SongModel.countDocuments({ userId: { $in: userKeys } }),
			AlbumModel.countDocuments({ artistUserId: { $in: userKeys } }),
			PlayListModel.countDocuments({ userId: { $in: userKeys } }),
			SongModel.countDocuments({ userId: { $in: userKeys }, hidden: true }),
			AlbumModel.countDocuments({ artistUserId: { $in: userKeys }, hidden: true }),
		])

		// Likes totals for my songs/albums
		const [songLikesAgg, albumLikesAgg] = await Promise.all([
			SongModel.aggregate([
				{ $match: { userId: { $in: userKeys } } },
				{ $project: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
				{ $group: { _id: null, total: { $sum: '$likesCount' } } }
			]),
			AlbumModel.aggregate([
				{ $match: { artistUserId: { $in: userKeys } } },
				{ $project: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
				{ $group: { _id: null, total: { $sum: '$likesCount' } } }
			]),
		])
		const songLikesTotal = songLikesAgg[0]?.total || 0
		const albumLikesTotal = albumLikesAgg[0]?.total || 0

		// Top categories and genres across my songs
		const [topCategories, topGenres] = await Promise.all([
			SongModel.aggregate([
				{ $match: { userId: { $in: userKeys } } },
				{ $unwind: '$category' },
				{ $group: { _id: '$category', count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 10 }
			]),
			SongModel.aggregate([
				{ $match: { userId: { $in: userKeys } } },
				{ $unwind: '$genre' },
				{ $group: { _id: '$genre', count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 10 }
			]),
		])

		res.status(200).json({
			success: true,
			artistEmail: user.email,
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
	const { userKeys, error } = requireArtist(req, res); if (error) return
	try {
		const profile = await ArtistModel.findOne({ userId: { $in: userKeys } })
		if (!profile) return res.status(404).json({ success: false, message: 'Artist profile not found' })
		const updates = {}
		if (req.body?.name !== undefined) updates.name = req.body.name
		if (req.body?.about !== undefined) updates.about = req.body.about
		if (req.body?.description !== undefined) updates.description = req.body.description
		if (req.body?.type !== undefined) updates.type = req.body.type
		const img = req.body?.profileImg ?? req.body?.imageUrl
		if (img !== undefined) {
			updates.profileImg = typeof img === 'string' ? img.trim() : img
		}
		Object.assign(profile, updates)
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

		const apostleId = await generateApostleId({ role: 'artist' })
		const user = new UserModel({ email, password, name, role: 'artist', apostleId })
		await user.save()

		// Create artist profile linked to user
		const artistId = await generateApostleId({ role: 'artist', type: 'ART' })
		const profile = new ArtistModel({ userId: user.apostleId || String(user._id), artistId, type: type || 'artist', name: name || 'Artist' })
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
		const isProd = process.env.NODE_ENV === 'production'
		const cookieOptions = (maxAge) => ({
			httpOnly: true,
			sameSite: isProd ? 'None' : 'Lax',
			secure: isProd,
			maxAge,
		})

		res.cookie('apostolicaccesstoken', accessToken, cookieOptions(15 * 60 * 1000))
		res.cookie('apostolictoken', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000))
		res.status(201).json({ success: true, artist: { id: profile.artistId || profile._id, userId: user.apostleId || user._id, name: profile.name }, accessToken, refreshToken, message: 'Artist created. Activation OTP sent to email.' })
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
		const isProd = process.env.NODE_ENV === 'production'
		const cookieOptions = (maxAge) => ({
			httpOnly: true,
			sameSite: isProd ? 'None' : 'Lax',
			secure: isProd,
			maxAge,
		})

		res.cookie('apostolicaccesstoken', accessToken, cookieOptions(15 * 60 * 1000))
		res.cookie('apostolictoken', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000))
		// Fetch artist profile for convenience
		const profile = await ArtistModel.findOne({ userId: { $in: [user.apostleId, String(user._id)].filter(Boolean) } })
		const artistObj = profile && typeof profile.toObject === 'function' ? profile.toObject() : profile
		if (artistObj) artistObj.email = user.email
		res.status(200).json({ success: true, artist: artistObj, artistEmail: user.email, accessToken, refreshToken })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Artist login error', error: err.message })
	}
}

export const deleteMyAccount = async (req, res) => {
	const { user, userKey, userKeys, error } = requireArtist(req, res); if (error) return
	try {

		await Promise.all([
			ArtistModel.deleteMany({ userId: { $in: userKeys } }),
			SongModel.deleteMany({ userId: { $in: userKeys } }),
			AlbumModel.deleteMany({ artistUserId: { $in: userKeys } }),
			PlayListModel.deleteMany({ userId: { $in: userKeys } }),
			RecentPlaysModel.deleteMany({ userId: { $in: userKeys } }),
			PlaybackModel.deleteMany({ userId: user._id }),
			OtpModel.deleteMany({ $or: [{ userId: { $in: userKeys } }, { email: user.email }] }),
		])

		await UserModel.deleteOne({ _id: user._id })

		res.clearCookie('apostolicaccesstoken')
		res.clearCookie('apostolictoken')
		res.clearCookie('accessToken')
		res.clearCookie('refreshToken')

		res.status(200).json({ success: true, message: 'Account deleted', userId: userKey })
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error deleting account', error: err.message })
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
	getArtistByName,
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
	getArtistProfile,
	editArtistProfile,
}
