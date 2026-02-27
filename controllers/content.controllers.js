import SongModel from '../model/Song.js'
import AlbumModel from '../model/Album.js'
import ArtistModel from '../model/Artist.js'
import CategoryModel from '../model/Categories.js'
import GenreModel from '../model/Genre.js'
import PlayListModel from '../model/PlayList.js'
import PlaybackModel from '../model/Playback.js'
import mongoose from 'mongoose'
import { toSlug, titleCase, normalizeArray, ensureCategoriesExist, ensureGenresExist, generateApostleId, getRoleCode, getUserKey } from '../middleware/utils.js'

// Middleware placeholder for uploads (Cloudinary URLs provided by frontend)
export const uploadMiddleware = (req, res, next) => next()

const PODCAST_SLUG = toSlug('podcast')
const buildPodcastQuery = () => ({
  $or: [
    { contentType: 'podcast' },
    { category: { $in: [PODCAST_SLUG] } },
    { genre: { $in: [PODCAST_SLUG] } },
  ],
})

const normalizeArtistIds = (input) => {
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


const parseLyrics = (lyrics) => {
  if (!lyrics) return []
  return lyrics.split(/\r?\n/).filter((l) => l.trim().length > 0)
}

/**
 * Enriches song objects with collaborators and formatted metadata.
 * Uses the listensCount field from the model as the source of truth.
 */
const enrichSongs = async (songs) => {
  const list = Array.isArray(songs) ? songs : [songs]
  if (list.length === 0) return []

  // Extract unique artist IDs for collaborator lookup
  const extractIds = (song) => {
    const artists = Array.isArray(song?.artists) ? song.artists : []
    return artists.map((id) => String(id)).filter(Boolean)
  }
  const allArtistIds = [...new Set(list.flatMap(extractIds))]

  let artistMap = new Map()
  if (allArtistIds.length > 0) {
    const artistDocs = await ArtistModel.find({ artistId: { $in: allArtistIds } })
      .select('artistId name profileImg userId')
      .lean()
    artistMap = new Map(artistDocs.map((a) => [String(a.artistId), a]))
  }

  return list.map((song) => {
    const obj = typeof song?.toObject === 'function' ? song.toObject() : song
    const artistIds = extractIds(song)
    const collaborators = artistIds.map((id) => artistMap.get(String(id))).filter(Boolean)

    // Ensure listensCount is present (it might be missing in older docs)
    const listensCount = obj.listensCount || 0

    // Remove internal/redundant fields if necessary
    const { ...rest } = obj

    return {
      ...rest,
      listensCount,
      collaborators,
    }
  })
}

// ===== SONGS =====
export const createSong = async (req, res) => {
  try {
    // Frontend provides Cloudinary URLs (trackUrl, trackImg, previewUrl) and metadata
    const payload = { ...req.body }
    // set owner from authenticated user
    if (req.user && req.user._id) {
      payload.userId = getUserKey(req.user)
    }
    if (payload.artistIds || payload.collaborators || payload.artists) {
      payload.artists = normalizeArtistIds(payload.artistIds ?? payload.collaborators ?? payload.artists)
      delete payload.artistIds
      delete payload.collaborators
    }
    // normalize and ensure categories/genres exist; store slugs in song
    const categorySlugs = normalizeArray(payload.category)
    const genreSlugs = normalizeArray(payload.genre)
    const isPodcast = categorySlugs.includes(PODCAST_SLUG) || genreSlugs.includes(PODCAST_SLUG)
    // Generate sequential trackId if missing
    if (!payload.trackId) {
      const roleCode = getRoleCode(req.user?.role)
      const typeCode = isPodcast || payload.contentType === 'podcast' ? 'POD' : 'TRK'
      payload.trackId = await generateApostleId({ role: roleCode, type: typeCode })
    }
    payload.category = await ensureCategoriesExist(payload.category, { contentType: isPodcast ? 'podcast' : undefined })
    payload.genre = await ensureGenresExist(payload.genre)
    if (!payload.contentType) {
      payload.contentType = isPodcast ? 'podcast' : 'song'
    }
    const song = new SongModel(payload)
    await song.save()
    res.status(201).json({ success: true, song })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating song', error: err.message })
  }
}

export const updateSong = async (req, res) => {
  try {
    const { id, ...rest } = req.body
    const song = await SongModel.findById(id)
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
    // enforce ownership
    const userKeys = req.user ? [getUserKey(req.user), String(req.user._id)].filter(Boolean) : []
    if (!req.user || !userKeys.includes(String(song.userId))) {
      return res.status(403).json({ success: false, message: 'Not owner of song' })
    }
    // if categories/genres provided, normalize and ensure they exist
    const categorySlugs = rest.category ? normalizeArray(rest.category) : (song.category || [])
    const genreSlugs = rest.genre ? normalizeArray(rest.genre) : (song.genre || [])
    const isPodcast = categorySlugs.includes(PODCAST_SLUG) || genreSlugs.includes(PODCAST_SLUG)
    if (rest.category) {
      song.category = await ensureCategoriesExist(rest.category, { contentType: isPodcast ? 'podcast' : undefined })
    }
    if (rest.genre) {
      song.genre = await ensureGenresExist(rest.genre)
    }
    if (rest.contentType) {
      song.contentType = rest.contentType
    } else if (rest.category || rest.genre) {
      song.contentType = isPodcast ? 'podcast' : 'song'
    }
    // assign remaining properties
    if (rest.artistIds || rest.collaborators || rest.artists) {
      song.artists = normalizeArtistIds(rest.artistIds ?? rest.collaborators ?? rest.artists)
    }
    const { category: _cIgnored, genre: _gIgnored, contentType: _tIgnored, artistIds: _aIgnored, collaborators: _coIgnored, ...others } = rest
    Object.assign(song, others)
    await song.save()
    res.status(200).json({ success: true, song })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating song', error: err.message })
  }
}

export const deleteSongs = async (req, res) => {
  try {
    const { ids } = req.body // expect { ids: [id1, id2] }
    if (!Array.isArray(ids)) return res.status(400).json({ success: false, message: 'ids array required' })
    // enforce ownership: delete only songs owned by the requester
    const ownerKey = req.user && getUserKey(req.user)
    const ownerKeys = req.user ? [ownerKey, String(req.user._id)].filter(Boolean) : []
    if (!ownerKeys.length) return res.status(401).json({ success: false, message: 'Authentication required' })
    const result = await SongModel.deleteMany({ _id: { $in: ids }, userId: { $in: ownerKeys } })
    res.status(200).json({ success: true, message: 'Songs deleted' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting songs', error: err.message })
  }
}

export const likeSong = async (req, res) => {
  try {
    const { songId } = req.body
    const userKey = req.user && getUserKey(req.user)
    const userKeys = req.user ? [userKey, String(req.user._id)].filter(Boolean) : []
    if (!userKeys.length) return res.status(401).json({ success: false, message: 'Authentication required' })
    const song = await SongModel.findById(songId)
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
    song.likes = song.likes || []
    const likeId = userKey
    const existingIdx = song.likes.findIndex((id) => userKeys.includes(String(id)))
    if (existingIdx === -1 && likeId) song.likes.push(likeId)
    else if (existingIdx !== -1) song.likes.splice(existingIdx, 1)
    await song.save()
    res.status(200).json({ success: true, likes: song.likes })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error toggling like', error: err.message })
  }
}

export const getAllSongs = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(Number(req.query.limit || 50), 100)
    const skip = (page - 1) * limit

    const [songs, total] = await Promise.all([
      SongModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      SongModel.countDocuments(),
    ])

    const enriched = await enrichSongs(songs)
    res.status(200).json({
      success: true,
      songs: enriched,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching songs', error: err.message })
  }
}

export const getSongById = async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid song id' })
    }

    // Atomically increment listen count and get updated document
    const song = await SongModel.findByIdAndUpdate(id, { $inc: { listensCount: 1 } }, { new: true })
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' })

    // Auto-record playback for user discovery/history
    await logPlayback(req, 'song', song._id)

    const [enriched] = await enrichSongs([song])
    const lyricsParsed = parseLyrics(song.lyrics)
    res.status(200).json({ success: true, song: enriched, lyricsParsed })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching song', error: err.message })
  }
}

export const getSongByTrackId = async (req, res) => {
  try {
    const { trackId } = req.params
    const song = await SongModel.findOneAndUpdate({ trackId }, { $inc: { listensCount: 1 } }, { new: true })
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' })

    await logPlayback(req, 'song', song._id)

    const [enriched] = await enrichSongs([song])
    res.status(200).json({ success: true, song: enriched })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching song by track', error: err.message })
  }
}

export const getSongLyrics = async (req, res) => {
  try {
    const song = await SongModel.findById(req.params.id)
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
    res.status(200).json({ success: true, lyrics: song.lyrics })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching lyrics', error: err.message })
  }
}

export const searchSongs = async (req, res) => {
  try {
    const { query } = req.params
    const songs = await SongModel.find({ $text: { $search: query } })
    const enriched = await enrichSongs(songs)
    res.status(200).json({ success: true, songs: enriched })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error searching songs', error: err.message })
  }
}

export const getSongsByCategory = async (req, res) => {
  try {
    const { category } = req.params
    const songs = await SongModel.find({ category: { $in: [category] } })
    const enriched = await enrichSongs(songs)
    res.status(200).json({ success: true, songs: enriched })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching songs by category', error: err.message })
  }
}

export const getPodcasts = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 100)
    const podcasts = await SongModel.find(buildPodcastQuery())
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)

    const enriched = await enrichSongs(podcasts)
    res.status(200).json({ success: true, podcasts: enriched })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching podcasts', error: err.message })
  }
}

export const getPodcastById = async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid podcast id' })
    }

    const podcast = await SongModel.findOneAndUpdate(
      { _id: id, ...buildPodcastQuery() },
      { $inc: { listensCount: 1 } },
      { new: true }
    )
    if (!podcast) return res.status(404).json({ success: false, message: 'Podcast not found' })

    await logPlayback(req, 'podcast', podcast._id)
    const [enriched] = await enrichSongs([podcast])
    const lyricsParsed = parseLyrics(podcast.lyrics)
    res.status(200).json({ success: true, podcast: enriched, lyricsParsed })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching podcast', error: err.message })
  }
}

export const getPodcastByTrackId = async (req, res) => {
  try {
    const { trackId } = req.params
    const podcast = await SongModel.findOneAndUpdate(
      { trackId, ...buildPodcastQuery() },
      { $inc: { listensCount: 1 } },
      { new: true }
    )
    if (!podcast) return res.status(404).json({ success: false, message: 'Podcast not found' })

    await logPlayback(req, 'podcast', podcast._id)
    const [enriched] = await enrichSongs([podcast])
    res.status(200).json({ success: true, podcast: enriched })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching podcast by track', error: err.message })
  }
}

export const getLikedSongs = async (req, res) => {
  try {
    const userId = req.query.userId
    const songs = await SongModel.find({ likes: userId })
    const enriched = await enrichSongs(songs)
    res.status(200).json({ success: true, songs: enriched })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching liked songs', error: err.message })
  }
}

export const getMyLikedSongs = async (req, res) => {
  try {
    const userKeys = req.user ? [getUserKey(req.user), String(req.user._id)].filter(Boolean) : []
    if (!userKeys.length) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }

    const songs = await SongModel.find({ likes: { $in: userKeys } })
    const enriched = await enrichSongs(songs)
    res.status(200).json({ success: true, songs: enriched })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching liked songs', error: err.message })
  }
}

export const hideSong = async (req, res) => {
  try {
    const { songId } = req.body
    const song = await SongModel.findById(songId)
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
    // Optional: require ownership via req.user
    if (req.user) {
      const userKeys = [getUserKey(req.user), String(req.user._id)].filter(Boolean)
      if (!userKeys.includes(String(song.userId))) {
        return res.status(403).json({ success: false, message: 'Not owner of song' })
      }
    }
    song.hidden = true
    await song.save()
    res.status(200).json({ success: true, song })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error hiding song', error: err.message })
  }
}

export const unhideSong = async (req, res) => {
  try {
    const { songId } = req.body
    const song = await SongModel.findById(songId)
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
    if (req.user) {
      const userKeys = [getUserKey(req.user), String(req.user._id)].filter(Boolean)
      if (!userKeys.includes(String(song.userId))) {
        return res.status(403).json({ success: false, message: 'Not owner of song' })
      }
    }
    song.hidden = false
    await song.save()
    res.status(200).json({ success: true, song })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error unhiding song', error: err.message })
  }
}

// ===== PLAYLISTS =====
export const newPlayList = async (req, res) => {
  try {
    const { name } = req.body
    const userId = req.user ? (getUserKey(req.user) || req.user._id) : null
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' })

    const pl = new PlayListModel({ name, userId, tracksId: [] })
    await pl.save()
    res.status(201).json({ success: true, playList: pl })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating playlist', error: err.message })
  }
}

export const addToPlayList = async (req, res) => {
  try {
    const { playlistId, trackId } = req.body
    const pl = await PlayListModel.findById(playlistId)
    if (!pl) return res.status(404).json({ success: false, message: 'Playlist not found' })

    // Ownership check
    const userKeys = req.user ? [getUserKey(req.user), String(req.user._id)].filter(Boolean) : []
    if (!userKeys.includes(String(pl.userId))) {
      return res.status(403).json({ success: false, message: 'Not owner of playlist' })
    }

    pl.tracksId = pl.tracksId || []
    if (!pl.tracksId.includes(trackId)) pl.tracksId.push(trackId)
    await pl.save()
    res.status(200).json({ success: true, playList: pl })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error adding to playlist', error: err.message })
  }
}

export const deletePlayList = async (req, res) => {
  try {
    const { playlistId } = req.body
    const pl = await PlayListModel.findById(playlistId)
    if (!pl) return res.status(404).json({ success: false, message: 'Playlist not found' })

    const userKeys = req.user ? [getUserKey(req.user), String(req.user._id)].filter(Boolean) : []
    if (!userKeys.includes(String(pl.userId))) {
      return res.status(403).json({ success: false, message: 'Not owner of playlist' })
    }

    await PlayListModel.findByIdAndDelete(playlistId)
    res.status(200).json({ success: true, message: 'Playlist deleted' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting playlist', error: err.message })
  }
}

export const removeTrackFromPlayList = async (req, res) => {
  try {
    const { playlistId, trackId } = req.body
    const pl = await PlayListModel.findById(playlistId)
    if (!pl) return res.status(404).json({ success: false, message: 'Playlist not found' })

    const userKeys = req.user ? [getUserKey(req.user), String(req.user._id)].filter(Boolean) : []
    if (!userKeys.includes(String(pl.userId))) {
      return res.status(403).json({ success: false, message: 'Not owner of playlist' })
    }

    pl.tracksId = (pl.tracksId || []).filter(t => t !== trackId)
    await pl.save()
    res.status(200).json({ success: true, playList: pl })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error removing track', error: err.message })
  }
}

export const getUserAllPlayList = async (req, res) => {
  try {
    const userId = req.user && req.user._id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }
    const pls = await PlayListModel.find({ userId })
    res.status(200).json({ success: true, playLists: pls })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching playlists', error: err.message })
  }
}

export const getUserPlayList = async (req, res) => {
  try {
    const userId = req.user && req.user._id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }
    const pl = await PlayListModel.findById(req.params._id)
    if (!pl) return res.status(404).json({ success: false, message: 'Playlist not found' })
    if (String(pl.userId) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Not owner of playlist' })
    }
    res.status(200).json({ success: true, playList: pl })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching playlist', error: err.message })
  }
}

// ===== CATEGORIES =====
export const createCategory = async (req, res) => {
  try {
    const { name, imageUrl, contentType } = req.body
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required' })
    const normalizedName = titleCase(name)
    const slug = toSlug(name)
    const existing = await CategoryModel.findOne({ slug })
    if (existing) {
      return res.status(409).json({ success: false, message: 'Category already exists' })
    }

    const payload = {
      name: normalizedName,
      slug,
    }
    const normalizedType = typeof contentType === 'string' ? contentType.toLowerCase() : undefined
    if (['song', 'podcast', 'both'].includes(normalizedType)) {
      payload.contentType = normalizedType
    }
    if (typeof imageUrl === 'string' && imageUrl.trim()) payload.imageUrl = imageUrl.trim()

    const category = await CategoryModel.create(payload)
    res.status(201).json({ success: true, category })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating category', error: err.message })
  }
}

export const updateCategory = async (req, res) => {
  try {
    const { categorySlug, name, imageUrl, contentType } = req.body
    if (!categorySlug) return res.status(400).json({ success: false, message: 'categorySlug is required' })

    const updates = {}
    if (name) {
      updates.name = titleCase(name)
      updates.slug = toSlug(name)
    }
    if (imageUrl !== undefined) updates.imageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : imageUrl
    if (contentType !== undefined) {
      const normalizedType = typeof contentType === 'string' ? contentType.toLowerCase() : undefined
      if (!['song', 'podcast', 'both'].includes(normalizedType)) {
        return res.status(400).json({ success: false, message: 'Invalid contentType' })
      }
      updates.contentType = normalizedType
    }

    const category = await CategoryModel.findOneAndUpdate({ slug: categorySlug }, updates, { new: true })
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' })

    res.status(200).json({ success: true, category })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating category', error: err.message })
  }
}

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.body
    await CategoryModel.findByIdAndDelete(id)
    res.status(200).json({ success: true, message: 'Category deleted' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting category', error: err.message })
  }
}

export const getAllCategory = async (req, res) => {
  try {
    const requestedType = typeof req.query?.contentType === 'string' ? req.query.contentType.toLowerCase() : ''
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(Number(req.query.limit || 50), 100)
    const skip = (page - 1) * limit

    let filter = {}
    if (requestedType === 'podcast') {
      filter = { contentType: { $in: ['podcast', 'both'] } }
    } else if (requestedType === 'song') {
      filter = { contentType: { $in: ['song', 'both'] } }
    } else if (requestedType === 'both') {
      filter = { contentType: 'both' }
    }

    const [cats, total] = await Promise.all([
      CategoryModel.find(filter).skip(skip).limit(limit),
      CategoryModel.countDocuments(filter),
    ])

    res.status(200).json({
      success: true,
      categories: cats,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching categories', error: err.message })
  }
}

export const getCategory = async (req, res) => {
  try {
    const slug = String(req.params.categorySlug || '').trim()
    if (!slug) return res.status(400).json({ success: false, message: 'Category slug is required' })

    const category = await CategoryModel.findOne({ slug })
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' })
    }

    const keys = [category.slug, category.name].filter(Boolean)
    const requestedType = typeof req.query?.contentType === 'string' ? req.query.contentType.toLowerCase() : ''
    let songFilter = { category: { $in: keys } }
    if (requestedType === 'podcast') {
      songFilter = { ...songFilter, ...buildPodcastQuery() }
    } else if (requestedType === 'song') {
      songFilter = { ...songFilter, contentType: { $ne: 'podcast' } }
    }
    const songs = await SongModel.find(songFilter)
    const enriched = await enrichSongs(songs)

    res.status(200).json({ success: true, category, songs: enriched })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching category', error: err.message })
  }
}

// ===== GENRES =====
export const createGenre = async (req, res) => {
  try {
    const { name, imageUrl } = req.body
    if (!name) return res.status(400).json({ success: false, message: 'Genre name is required' })
    const normalizedName = titleCase(name)
    const slug = toSlug(name)
    const existing = await GenreModel.findOne({ slug })
    if (existing) {
      return res.status(409).json({ success: false, message: 'Genre already exists' })
    }

    const payload = {
      name: normalizedName,
      slug,
    }
    if (typeof imageUrl === 'string' && imageUrl.trim()) payload.imageUrl = imageUrl.trim()

    const genre = await GenreModel.create(payload)
    res.status(201).json({ success: true, genre })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating genre', error: err.message })
  }
}

export const updateGenre = async (req, res) => {
  try {
    const { genreSlug, name, imageUrl } = req.body
    if (!genreSlug) return res.status(400).json({ success: false, message: 'genreSlug is required' })

    const updates = {}
    if (name) {
      updates.name = titleCase(name)
      updates.slug = toSlug(name)
    }
    if (imageUrl !== undefined) updates.imageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : imageUrl

    const genre = await GenreModel.findOneAndUpdate({ slug: genreSlug }, updates, { new: true })
    if (!genre) return res.status(404).json({ success: false, message: 'Genre not found' })

    res.status(200).json({ success: true, genre })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating genre', error: err.message })
  }
}

export const deleteGenre = async (req, res) => {
  try {
    const { id } = req.body
    await GenreModel.findByIdAndDelete(id)
    res.status(200).json({ success: true, message: 'Genre deleted' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting genre', error: err.message })
  }
}

export const getAllGenre = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(Number(req.query.limit || 50), 100)
    const skip = (page - 1) * limit

    const [genres, total] = await Promise.all([
      GenreModel.find().skip(skip).limit(limit),
      GenreModel.countDocuments(),
    ])

    res.status(200).json({
      success: true,
      genres,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching genres', error: err.message })
  }
}

export const getGenre = async (req, res) => {
  try {
    const slug = String(req.params.genreSlug || '').trim()
    if (!slug) return res.status(400).json({ success: false, message: 'Genre slug is required' })

    const genre = await GenreModel.findOne({ slug })
    if (!genre) return res.status(404).json({ success: false, message: 'Genre not found' })

    const keys = [genre.slug, genre.name].filter(Boolean)
    const songs = await SongModel.find({ genre: { $in: keys } })
    const enriched = await enrichSongs(songs)

    res.status(200).json({ success: true, genre, songs: enriched })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching genre', error: err.message })
  }
}

// ===== PLAYBACK =====
export const recordPlayback = async (req, res) => {
  try {
    const userId = req.user && req.user._id
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' })

    const { itemType, itemId } = req.body
    const normalizedType = itemType === 'audio' ? 'song' : itemType
    if (!['song', 'album', 'category', 'podcast'].includes(normalizedType)) {
      return res.status(400).json({ success: false, message: 'Invalid itemType' })
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ success: false, message: 'Invalid itemId' })
    }

    await PlaybackModel.create({ userId, itemType: normalizedType, itemId })
    res.status(201).json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error recording playback', error: err.message })
  }
}

export const getDiscover = async (req, res) => {
  const section = String(req.query.section || 'jump-back-in')
  const type = req.query.type ? String(req.query.type) : undefined
  const limit = Math.min(Number(req.query.limit || 7), 50)

  try {
    switch (section) {
      case 'jump-back-in': {
        const userId = req.user && req.user._id
        if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' })

        const match = { userId: new mongoose.Types.ObjectId(userId) }
        if (type) {
          match.itemType = type === 'audio' ? 'song' : type
        }

        const agg = await PlaybackModel.aggregate([
          { $match: match },
          { $sort: { playedAt: -1 } },
          { $group: { _id: { itemType: '$itemType', itemId: '$itemId' }, playedAt: { $first: '$playedAt' } } },
          { $sort: { playedAt: -1 } },
          { $limit: limit },
        ])

        const songIds = agg.filter(a => a._id.itemType === 'song').map(a => a._id.itemId)
        const podcastIds = agg.filter(a => a._id.itemType === 'podcast').map(a => a._id.itemId)
        const albumIds = agg.filter(a => a._id.itemType === 'album').map(a => a._id.itemId)
        const categoryIds = agg.filter(a => a._id.itemType === 'category').map(a => a._id.itemId)

        const songs = songIds.length ? await SongModel.find({ _id: { $in: songIds } }) : []
        const podcasts = podcastIds.length ? await SongModel.find({ _id: { $in: podcastIds } }) : []

        const [enrichedSongs, enrichedPodcasts] = await Promise.all([
          enrichSongs(songs),
          enrichSongs(podcasts)
        ])

        const albums = albumIds.length ? await AlbumModel.find({ _id: { $in: albumIds } }) : []
        const cats = categoryIds.length ? await CategoryModel.find({ _id: { $in: categoryIds } }) : []

        const idToSong = new Map(enrichedSongs.map(s => [String(s._id), s]))
        const idToPodcast = new Map(enrichedPodcasts.map(p => [String(p._id), p]))
        const idToAlbum = new Map(albums.map(a => [String(a._id), a]))
        const idToCat = new Map(cats.map(c => [String(c._id), c]))

        const items = []
        for (const a of agg) {
          const id = String(a._id.itemId)
          if (a._id.itemType === 'song' && idToSong.get(id)) {
            items.push({ type: 'song', playedAt: a.playedAt, item: idToSong.get(id) })
          } else if (a._id.itemType === 'podcast' && idToPodcast.get(id)) {
            items.push({ type: 'podcast', playedAt: a.playedAt, item: idToPodcast.get(id) })
          } else if (a._id.itemType === 'album' && idToAlbum.get(id)) {
            items.push({ type: 'album', playedAt: a.playedAt, item: idToAlbum.get(id) })
          } else if (a._id.itemType === 'category' && idToCat.get(id)) {
            items.push({ type: 'category', playedAt: a.playedAt, item: idToCat.get(id) })
          }
        }

        return res.status(200).json({ success: true, section: 'jump-back-in', items })
      }

      case 'new-releases': {
        const items = await SongModel.find().sort({ createdAt: -1, _id: -1 }).limit(limit)
        const enriched = await enrichSongs(items)
        return res.status(200).json({ success: true, section: 'new-releases', items: enriched })
      }

      case 'most-liked': {
        const items = await SongModel.find().sort({ 'likes.length': -1 }).limit(limit) // Prefer indexed sort if possible, but aggregate was used before
        // The previous aggregate approach was better for $size, keeping it simplified for enrichSongs
        const rawItems = await SongModel.aggregate([
          { $addFields: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
          { $sort: { likesCount: -1 } },
          { $limit: limit },
        ])
        const enriched = await enrichSongs(rawItems)
        return res.status(200).json({ success: true, section: 'most-liked', items: enriched })
      }

      case 'most-listened': {
        const normalizedType = type === 'audio' ? 'song' : (type || 'song')

        // Use the new listensCount field for most-listened section if it's song/podcast
        if (normalizedType === 'song' || normalizedType === 'podcast') {
          const docs = await SongModel.find({ contentType: normalizedType })
            .sort({ listensCount: -1 })
            .limit(limit)
          const enriched = await enrichSongs(docs)
          const items = enriched.map(d => ({ type: normalizedType, count: d.listensCount, item: d }))
          return res.status(200).json({ success: true, section: 'most-listened', items })
        }

        // Fallback to playback aggregation for other types
        const agg = await PlaybackModel.aggregate([
          { $match: { itemType: normalizedType } },
          { $group: { _id: '$itemId', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: limit },
        ])

        const ids = agg.map(a => a._id)
        let docs = []
        if (normalizedType === 'album') {
          docs = await AlbumModel.find({ _id: { $in: ids } })
        } else if (normalizedType === 'category') {
          docs = await CategoryModel.find({ _id: { $in: ids } })
        }

        const map = new Map(docs.map(d => [String(d._id), d]))
        const items = agg.map(a => ({ type: normalizedType, count: a.count, item: map.get(String(a._id)) })).filter(x => x.item)

        return res.status(200).json({ success: true, section: 'most-listened', items })
      }

      case 'podcasts': {
        const items = await SongModel.find(buildPodcastQuery())
          .sort({ createdAt: -1, _id: -1 })
          .limit(limit)
        const enriched = await enrichSongs(items)
        return res.status(200).json({ success: true, section: 'podcasts', items: enriched })
      }

      default:
        return res.status(400).json({ success: false, message: 'Unknown section' })
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching discover', error: err.message })
  }
}

// ===== SEARCH =====
export const searchAll = async (req, res) => {
  try {
    const q = String(req.query.q || req.query.query || '').trim()
    if (!q) return res.status(400).json({ success: false, message: 'Search query is required' })

    const limit = Math.min(Number(req.query.limit || 10), 50)
    const rx = new RegExp(q, 'i')

    const [songs, albums, artists, categories, genres] = await Promise.all([
      SongModel.find({ $or: [{ title: rx }, { name: rx }] }).limit(limit),
      AlbumModel.find({ $or: [{ title: rx }, { name: rx }] }).limit(limit),
      ArtistModel.find({ name: rx }).limit(limit),
      CategoryModel.find({ $or: [{ name: rx }, { slug: rx }] }).limit(limit),
      GenreModel.find({ $or: [{ name: rx }, { slug: rx }] }).limit(limit),
    ])

    const enrichedSongs = await enrichSongs(songs)

    res.status(200).json({
      success: true,
      query: q,
      results: { songs: enrichedSongs, albums, artists, categories, genres },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error searching', error: err.message })
  }
}

// Auto-play logger (no-op if user not authenticated)
const logPlayback = async (req, itemType, itemId) => {
  try {
    const userId = req.user && req.user._id
    if (!userId) return
    if (!mongoose.Types.ObjectId.isValid(itemId)) return

    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000)
    await PlaybackModel.updateOne(
      { userId: new mongoose.Types.ObjectId(userId), itemType, itemId: new mongoose.Types.ObjectId(itemId), playedAt: { $gte: tenMinsAgo } },
      { $setOnInsert: { userId, itemType, itemId, playedAt: new Date() } },
      { upsert: true }
    )
  } catch (_) {
    // swallow errors to not impact main request
  }
}

export default {
  // songs
  uploadMiddleware,
  createSong,
  updateSong,
  deleteSongs,
  likeSong,
  getAllSongs,
  getSongById,
  getSongByTrackId,
  getSongLyrics,
  searchSongs,
  getSongsByCategory,
  getPodcasts,
  getPodcastById,
  getPodcastByTrackId,
  getLikedSongs,
  getMyLikedSongs,
  hideSong,
  unhideSong,
  // playlists
  newPlayList,
  addToPlayList,
  deletePlayList,
  removeTrackFromPlayList,
  getUserAllPlayList,
  getUserPlayList,
  // categories
  createCategory,
  updateCategory,
  deleteCategory,
  getAllCategory,
  getCategory,
  // genres
  createGenre,
  updateGenre,
  deleteGenre,
  getAllGenre,
  getGenre,
  // playback
  recordPlayback,
  getDiscover,
  // search
  searchAll,
}
