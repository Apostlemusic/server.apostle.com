

import express from 'express'
import * as controllers from '../controllers/artist.controllers.js'
import { uploadMiddleware } from '../controllers/artist.controllers.js'
import { validateRegister, validateLogin, validateForgotPassword, validateResetPassword } from '../middleware/validators.js'

import { AuthenticateUser, AuthenticateAdmin } from '../middleware/auth.js'
import { requireDb } from '../middleware/requireDb.js'

const router = express.Router()

router.use(requireDb)

//POST ROUTES
router.post('/deleteArtist', AuthenticateAdmin, uploadMiddleware, controllers.deleteArtist)
router.post('/followArtist', AuthenticateUser, uploadMiddleware, controllers.followArtist)
router.post('/likeArtist', AuthenticateUser, uploadMiddleware, controllers.likeArtist)

// Artist auth
router.post('/register', validateRegister, controllers.register)
router.post('/login', validateLogin, controllers.login)
router.post('/verifyOtp', controllers.verifyOtp)
router.post('/resendOtp', controllers.resendOtp)
router.post('/forgotPassword', validateForgotPassword, controllers.forgotPassword)
router.post('/resetPassword', validateResetPassword, controllers.resetPassword)
router.get('/isVerified', controllers.isVerified)


//GET ROUTES

router.get('/getAllArtists', AuthenticateUser, controllers.getAllArtists)
router.get('/getArtistById/:artistId', controllers.getArtistById)
router.get('/getMyArtists', AuthenticateAdmin, controllers.getMyArtists)
router.get('/getLikedArtists', AuthenticateUser, controllers.getLikedArtists)
router.get('/getFollowedArtists', AuthenticateUser, controllers.getFollowedArtists)

// Artist content management - Songs
router.post('/song/upload', AuthenticateUser, uploadMiddleware, controllers.uploadSong)
router.post('/song/edit', AuthenticateUser, uploadMiddleware, controllers.editSong)
router.post('/song/remove', AuthenticateUser, controllers.removeSong)
router.post('/song/hide', AuthenticateUser, controllers.hideSong)
router.post('/song/unhide', AuthenticateUser, controllers.unhideSong)
router.get('/song/my', AuthenticateUser, controllers.getMySongs)

// Artist content management - Albums
router.post('/album/upload', AuthenticateUser, uploadMiddleware, controllers.uploadAlbum)
router.post('/album/edit', AuthenticateUser, uploadMiddleware, controllers.editAlbum)
router.post('/album/remove', AuthenticateUser, controllers.removeAlbum)
router.post('/album/hide', AuthenticateUser, controllers.hideAlbum)
router.post('/album/unhide', AuthenticateUser, controllers.unhideAlbum)
router.get('/album/my', AuthenticateUser, controllers.getMyAlbums)

// Artist dashboard stats
router.get('/dashboard/stats', AuthenticateUser, controllers.getArtistStats)

// Artist profile edit
router.post('/profile/edit', AuthenticateUser, uploadMiddleware, controllers.editArtistProfile)

//PUT ROUTES

export default router
