import SongModel from '../model/Song.js'
import SequenceModel from '../model/Sequence.js'
import PlayListModel from '../model/PlayList.js'
import CategoryModel from '../model/Categories.js'
import GenreModel from '../model/Genre.js'
import PlaybackModel from '../model/Playback.js'
import mongoose from 'mongoose'

// Middleware placeholder for uploads (Cloudinary URLs provided by frontend)
export const uploadMiddleware = (req, res, next) => next()

// Helpers: normalize and ensure taxonomy (categories/genres) exist
const toSlug = (str = '') => {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
}

const titleCase = (str = '') => {
  return String(str)
    .trim()
    .toLowerCase()
    .split(/[-\s_]+/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}

const normalizeArray = (input) => {
  if (!input) return []
  const arr = Array.isArray(input) ? input : [input]
  const slugs = arr
    .map(v => toSlug(v))
    .filter(v => v && v.length > 0)
  // de-duplicate while preserving order
  return [...new Set(slugs)]
}

const ensureCategoriesExist = async (categories) => {
  const slugs = normalizeArray(categories)
  for (const slug of slugs) {
    const existing = await CategoryModel.findOne({ slug })
    if (!existing) {
      await new CategoryModel({ name: titleCase(slug), slug }).save()
    }
  }
  return slugs
}

const ensureGenresExist = async (genres) => {
  const slugs = normalizeArray(genres)
  for (const slug of slugs) {
    const existing = await GenreModel.findOne({ slug })
    if (!existing) {
      // Genre name has unique constraint; derive consistent titleCase from slug
      await new GenreModel({ name: titleCase(slug), slug }).save()
    }
  }
  return slugs
}

// ===== SONGS =====
export const createSong = async (req, res) => {
  try {
    // Frontend provides Cloudinary URLs (trackUrl, trackImg, previewUrl) and metadata
    const payload = { ...req.body }
    // set owner from authenticated user
    if (req.user && req.user._id) {
      payload.userId = req.user._id
    }
    // Generate sequential trackId if missing
    if (!payload.trackId) {
      const seq = await SequenceModel.findOneAndUpdate(
        { name: 'song' },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      )
      const padded = String(seq.value).padStart(6, '0')
      payload.trackId = `TRK-${padded}`
    }
    // normalize and ensure categories/genres exist; store slugs in song
    payload.category = await ensureCategoriesExist(payload.category)
    payload.genre = await ensureGenresExist(payload.genre)
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
    if (!req.user || String(song.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not owner of song' })
    }
    // if categories/genres provided, normalize and ensure they exist
    if (rest.category) {
      song.category = await ensureCategoriesExist(rest.category)
    }
    if (rest.genre) {
      song.genre = await ensureGenresExist(rest.genre)
    }
    // assign remaining properties
    const { category: _cIgnored, genre: _gIgnored, ...others } = rest
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
    const ownerId = req.user && req.user._id
    if (!ownerId) return res.status(401).json({ success: false, message: 'Authentication required' })
    const result = await SongModel.deleteMany({ _id: { $in: ids }, userId: ownerId })
    res.status(200).json({ success: true, message: 'Songs deleted' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting songs', error: err.message })
  }
}

export const likeSong = async (req, res) => {
  try {
    const { songId } = req.body
    const userId = req.user && req.user._id
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' })
    const song = await SongModel.findById(songId)
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
    song.likes = song.likes || []
    const idx = song.likes.indexOf(userId)
    if (idx === -1) song.likes.push(userId)
    else song.likes.splice(idx, 1)
    await song.save()
    res.status(200).json({ success: true, likes: song.likes })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error toggling like', error: err.message })
  }
}

export const getAllSongs = async (req, res) => {
  try {
    const songs = await SongModel.find()
    res.status(200).json({ success: true, songs })
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

    const song = await SongModel.findById(id)
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' })

    // Auto-record playback if user is authenticated (no-op otherwise)
    await logPlayback(req, 'song', song._id)

    const lyricsParsed = (song.lyrics || '').split(/\r?\n/).filter(l => l.trim().length > 0)
    res.status(200).json({ success: true, song, lyricsParsed })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching song', error: err.message })
  }
}

export const getSongByTrackId = async (req, res) => {
  try {
    const { trackId } = req.params
    const song = await SongModel.findOne({ trackId })
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' })

    // Auto-record playback (this route is already behind AuthenticateUser)
    await logPlayback(req, 'song', song._id)

    res.status(200).json({ success: true, song })
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
    res.status(200).json({ success: true, songs })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error searching songs', error: err.message })
  }
}

export const getSongsByCategory = async (req, res) => {
  try {
    const { category } = req.params
    const songs = await SongModel.find({ category: { $in: [category] } })
    res.status(200).json({ success: true, songs })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching songs by category', error: err.message })
  }
}

export const getLikedSongs = async (req, res) => {
  try {
    const userId = req.query.userId
    const songs = await SongModel.find({ likes: userId })
    res.status(200).json({ success: true, songs })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching liked songs', error: err.message })
  }
}

export const getMyLikedSongs = async (req, res) => {
  try {
    const userId = req.user && req.user._id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }

    const songs = await SongModel.find({ likes: userId })
    res.status(200).json({ success: true, songs })
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
    if (req.user && String(song.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not owner of song' })
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
    if (req.user && String(song.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not owner of song' })
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
    const { name, userId } = req.body
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
    pl.tracksId = (pl.tracksId || []).filter(t => t !== trackId)
    await pl.save()
    res.status(200).json({ success: true, playList: pl })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error removing track', error: err.message })
  }
}

export const getUserAllPlayList = async (req, res) => {
  try {
    const userId = req.query.userId
    const pls = await PlayListModel.find({ userId })
    res.status(200).json({ success: true, playLists: pls })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching playlists', error: err.message })
  }
}

export const getUserPlayList = async (req, res) => {
  try {
    const pl = await PlayListModel.findById(req.params._id)
    if (!pl) return res.status(404).json({ success: false, message: 'Playlist not found' })
    res.status(200).json({ success: true, playList: pl })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching playlist', error: err.message })
  }
}

// ===== CATEGORIES =====
export const createCategory = async (req, res) => {
  try {
    const { name, imageUrl } = req.body
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required' })

    const payload = {
      name: titleCase(name),
      slug: toSlug(name),
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
    const { categorySlug, name, imageUrl } = req.body
    if (!categorySlug) return res.status(400).json({ success: false, message: 'categorySlug is required' })

    const updates = {}
    if (name) {
      updates.name = titleCase(name)
      updates.slug = toSlug(name)
    }
    if (imageUrl !== undefined) updates.imageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : imageUrl

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
    const cats = await CategoryModel.find()
    res.status(200).json({ success: true, categories: cats })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching categories', error: err.message })
  }
}

export const getCategory = async (req, res) => {
  try {
    const cat = await CategoryModel.findOne({ slug: req.params.categorySlug })
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' })
    res.status(200).json({ success: true, category: cat })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching category', error: err.message })
  }
}

// ===== GENRES =====
export const createGenre = async (req, res) => {
  try {
    const { name, imageUrl } = req.body
    if (!name) return res.status(400).json({ success: false, message: 'Genre name is required' })

    const payload = {
      name: titleCase(name),
      slug: toSlug(name),
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
    const genres = await GenreModel.find()
    res.status(200).json({ success: true, genres })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching genres', error: err.message })
  }
}

export const getGenre = async (req, res) => {
  try {
    const g = await GenreModel.findOne({ slug: req.params.genreSlug })
    if (!g) return res.status(404).json({ success: false, message: 'Genre not found' })
    res.status(200).json({ success: true, genre: g })
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
    if (!['song', 'album', 'category'].includes(normalizedType)) {
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
        const categoryIds = agg.filter(a => a._id.itemType === 'category').map(a => a._id.itemId)

        const songs = songIds.length ? await SongModel.find({ _id: { $in: songIds } }) : []
        const cats = categoryIds.length ? await CategoryModel.find({ _id: { $in: categoryIds } }) : []

        const idToSong = new Map(songs.map(s => [String(s._id), s]))
        const idToCat = new Map(cats.map(c => [String(c._id), c]))

        const items = []
        for (const a of agg) {
          const id = String(a._id.itemId)
          if (a._id.itemType === 'song' && idToSong.get(id)) {
            items.push({ type: 'song', playedAt: a.playedAt, item: idToSong.get(id) })
          } else if (a._id.itemType === 'category' && idToCat.get(id)) {
            items.push({ type: 'category', playedAt: a.playedAt, item: idToCat.get(id) })
          }
          // album support can be added once AlbumModel exists
        }

        return res.status(200).json({ success: true, section: 'jump-back-in', items })
      }

      case 'new-releases': {
        const items = await SongModel.find().sort({ createdAt: -1, _id: -1 }).limit(limit)
        return res.status(200).json({ success: true, section: 'new-releases', items })
      }

      case 'most-liked': {
        const items = await SongModel.aggregate([
          { $addFields: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
          { $sort: { likesCount: -1 } },
          { $limit: limit },
        ])
        return res.status(200).json({ success: true, section: 'most-liked', items })
      }

      case 'most-listened': {
        const normalizedType = type === 'audio' ? 'song' : (type || 'song')
        const agg = await PlaybackModel.aggregate([
          { $match: { itemType: normalizedType } },
          { $group: { _id: '$itemId', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: limit },
        ])

        const ids = agg.map(a => a._id)
        let docs = []
        if (normalizedType === 'song') {
          docs = await SongModel.find({ _id: { $in: ids } })
        } else if (normalizedType === 'category') {
          docs = await CategoryModel.find({ _id: { $in: ids } })
        }
        const map = new Map(docs.map(d => [String(d._id), d]))
        const items = agg.map(a => ({ type: normalizedType, count: a.count, item: map.get(String(a._id)) })).filter(x => x.item)

        return res.status(200).json({ success: true, section: 'most-listened', items })
      }

      default:
        return res.status(400).json({ success: false, message: 'Unknown section' })
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching discover', error: err.message })
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
}
