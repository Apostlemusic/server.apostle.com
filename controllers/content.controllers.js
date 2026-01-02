import SongModel from '../model/Song.js'
import PlayListModel from '../model/PlayList.js'
import CategoryModel from '../model/Categories.js'
import GenreModel from '../model/Genre.js'

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
    const song = await SongModel.findById(req.params.id)
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' })
    res.status(200).json({ success: true, song })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching song', error: err.message })
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
    const cat = new CategoryModel(req.body)
    await cat.save()
    res.status(201).json({ success: true, category: cat })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating category', error: err.message })
  }
}

export const updateCategory = async (req, res) => {
  try {
    const { id, ...rest } = req.body
    const cat = await CategoryModel.findByIdAndUpdate(id, rest, { new: true })
    res.status(200).json({ success: true, category: cat })
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
    const g = new GenreModel(req.body)
    await g.save()
    res.status(201).json({ success: true, genre: g })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating genre', error: err.message })
  }
}

export const updateGenre = async (req, res) => {
  try {
    const { id, ...rest } = req.body
    const g = await GenreModel.findByIdAndUpdate(id, rest, { new: true })
    res.status(200).json({ success: true, genre: g })
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

export default {
  // songs
  uploadMiddleware,
  createSong,
  updateSong,
  deleteSongs,
  likeSong,
  getAllSongs,
  getSongById,
  getSongLyrics,
  searchSongs,
  getSongsByCategory,
  getLikedSongs,
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
}
