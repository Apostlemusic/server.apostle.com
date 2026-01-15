import express from 'express'
import {
  createSong,
  updateSong,
  deleteSongs,
  likeSong,
  getAllSongs,
  getMyLikedSongs,
  getSongById,
  getSongByTrackId,
  getSongLyrics,
  searchSongs,
  getSongsByCategory,
  getLikedSongs,
  hideSong,
  unhideSong,
  newPlayList,
  addToPlayList,
  deletePlayList,
  removeTrackFromPlayList,
  getUserAllPlayList,
  getUserPlayList,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllCategory,
  getCategory,
  createGenre,
  updateGenre,
  deleteGenre,
  getAllGenre,
  getGenre,
  uploadMiddleware,
  recordPlayback,
  getDiscover,
} from '../controllers/content.controllers.js'
import AuthenticateUser, { AuthenticateAdmin } from '../middleware/auth.js'
import { requireDb } from '../middleware/requireDb.js'

const router = express.Router()

router.use(requireDb)

// ===== SONGS =====
router.post('/songs', AuthenticateUser, uploadMiddleware, createSong)
router.put('/songs', AuthenticateUser, uploadMiddleware, updateSong)
router.delete('/songs', AuthenticateUser, deleteSongs)
router.post('/songs/like', AuthenticateUser, likeSong)
router.get('/songs', AuthenticateUser, getAllSongs)
router.get('/songs/liked', AuthenticateUser, getMyLikedSongs)
router.get('/songs/:id', getSongById)
router.get('/songs/track/:trackId', AuthenticateUser, getSongByTrackId)
router.get('/songs/:id/lyrics', AuthenticateUser, getSongLyrics)
router.get('/songs/search/:query', AuthenticateUser, searchSongs)
router.get('/songs/category/:category', AuthenticateUser, getSongsByCategory)
router.get('/songs/liked', AuthenticateUser, getLikedSongs)
router.post('/songs/hide', AuthenticateUser, hideSong)
router.post('/songs/unhide', AuthenticateUser, unhideSong)

// ===== PLAYLISTS =====
router.post('/playlists', AuthenticateUser, newPlayList)
router.post('/playlists/add', AuthenticateUser, addToPlayList)
router.delete('/playlists', AuthenticateUser, deletePlayList)
router.post('/playlists/remove-track', AuthenticateUser, removeTrackFromPlayList)
router.get('/playlists', AuthenticateUser, getUserAllPlayList)
router.get('/playlists/:_id', AuthenticateUser, getUserPlayList)

// ===== CATEGORIES =====
router.post('/categories', AuthenticateAdmin, uploadMiddleware, createCategory)
router.put('/categories', AuthenticateAdmin, uploadMiddleware, updateCategory)
router.delete('/categories', AuthenticateAdmin, deleteCategory)
router.get('/categories', getAllCategory)
router.get('/categories/:categorySlug', getCategory)

// ===== GENRES =====
router.post('/genres', AuthenticateAdmin, uploadMiddleware, createGenre)
router.put('/genres', AuthenticateAdmin, uploadMiddleware, updateGenre)
router.delete('/genres', AuthenticateAdmin, deleteGenre)
router.get('/genres', getAllGenre)
router.get('/genres/:genreSlug', getGenre)

// ===== DISCOVER / PLAYS =====
router.post('/plays', AuthenticateUser, recordPlayback)
router.get('/discover', AuthenticateUser, getDiscover)

export default router
