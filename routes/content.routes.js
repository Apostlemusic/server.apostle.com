import express from 'express'
import controllers, { uploadMiddleware } from '../controllers/content.controllers.js'
import { AuthenticateUser, AuthenticateAdmin } from '../middleware/auth.js'
import { requireDb } from '../middleware/requireDb.js'

const router = express.Router()

router.use(requireDb)

// ===== SONGS =====
router.post('/songs', AuthenticateUser, uploadMiddleware, controllers.createSong)
router.put('/songs', AuthenticateUser, uploadMiddleware, controllers.updateSong)
router.delete('/songs', AuthenticateUser, controllers.deleteSongs)
router.post('/songs/like', AuthenticateUser, controllers.likeSong)
router.get('/songs', AuthenticateUser, controllers.getAllSongs)
router.get('/songs/:id', AuthenticateUser, controllers.getSongById)
router.get('/songs/track/:trackId', AuthenticateUser, controllers.getSongByTrackId)
router.get('/songs/:id/lyrics', AuthenticateUser, controllers.getSongLyrics)
router.get('/songs/search/:query', AuthenticateUser, controllers.searchSongs)
router.get('/songs/category/:category', AuthenticateUser, controllers.getSongsByCategory)
router.get('/songs/liked', AuthenticateUser, controllers.getLikedSongs)
router.post('/songs/hide', AuthenticateUser, controllers.hideSong)
router.post('/songs/unhide', AuthenticateUser, controllers.unhideSong)

// ===== PLAYLISTS =====
router.post('/playlists', AuthenticateUser, controllers.newPlayList)
router.post('/playlists/add', AuthenticateUser, controllers.addToPlayList)
router.delete('/playlists', AuthenticateUser, controllers.deletePlayList)
router.post('/playlists/remove-track', AuthenticateUser, controllers.removeTrackFromPlayList)
router.get('/playlists', AuthenticateUser, controllers.getUserAllPlayList)
router.get('/playlists/:_id', AuthenticateUser, controllers.getUserPlayList)

// ===== CATEGORIES =====
router.post('/categories', AuthenticateAdmin, uploadMiddleware, controllers.createCategory)
router.put('/categories', AuthenticateAdmin, uploadMiddleware, controllers.updateCategory)
router.delete('/categories', AuthenticateAdmin, controllers.deleteCategory)
router.get('/categories', controllers.getAllCategory)
router.get('/categories/:categorySlug', controllers.getCategory)

// ===== GENRES =====
router.post('/genres', AuthenticateAdmin, uploadMiddleware, controllers.createGenre)
router.put('/genres', AuthenticateAdmin, uploadMiddleware, controllers.updateGenre)
router.delete('/genres', AuthenticateAdmin, controllers.deleteGenre)
router.get('/genres', controllers.getAllGenre)
router.get('/genres/:genreSlug', controllers.getGenre)

export default router
