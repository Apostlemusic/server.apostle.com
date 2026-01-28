import express from 'express'
import * as controllers from '../controllers/user.controller.js'
import AuthenticateUser from '../middleware/auth.js'
import { requireDb } from '../middleware/requireDb.js'
import { validateRegister, validateLogin, validateForgotPassword, validateResetPassword } from '../middleware/validators.js'

const router = express.Router()

router.use(requireDb)


//GET ROUTES
router.get('/getUsers', controllers.getUsers)
router.get('/getUser/:id', AuthenticateUser, controllers.getUser)
router.get('/profile/me', AuthenticateUser, controllers.getUserProfile)


// ===== Auth routes merged here =====
// POST auth endpoints
router.post('/register', validateRegister, controllers.register)
router.post('/login', validateLogin, controllers.login)
router.post('/verifyOtp', controllers.verifyOtp)
router.post('/resendOtp', controllers.resendOtp)
router.post('/forgotPassword', validateForgotPassword, controllers.forgotPassword)
router.post('/resetPassword', validateResetPassword, controllers.resetPassword)
router.post('/verifyToken', controllers.verifyToken)
router.post('/logout', controllers.logout)
// User playlist
router.post('/playlist', AuthenticateUser, controllers.createPlaylist)
router.get('/playlists', AuthenticateUser, controllers.getMyPlaylists)
router.get('/playlists/:id', AuthenticateUser, controllers.getMyPlaylistById)
router.put('/playlists/:id', AuthenticateUser, controllers.updatePlaylist)
router.delete('/playlists/:id', AuthenticateUser, controllers.deletePlaylist)
router.post('/playlists/:id/tracks', AuthenticateUser, controllers.addTrackToPlaylist)
router.delete('/playlists/:id/tracks/:trackId', AuthenticateUser, controllers.removeTrackFromPlaylist)
// Check verification status (email via query or body)
router.get('/isVerified', controllers.isVerified)
router.post('/isVerified', controllers.isVerified)
// Simple ping to confirm GET routes work
router.get('/ping', (req, res) => res.status(200).json({ ok: true }))

//PUT ROUTES
// If the token is valid, authMiddleware should set req.user
router.get('/verify-token', AuthenticateUser, (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Token is valid',
    user: req.user,
  })
})

export default router
