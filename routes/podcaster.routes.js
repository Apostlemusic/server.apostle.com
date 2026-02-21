import express from 'express'
import * as controllers from '../controllers/podcaster.controllers.js'
import { uploadMiddleware } from '../controllers/podcaster.controllers.js'
import { validateRegister, validateLogin, validateForgotPassword, validateResetPassword } from '../middleware/validators.js'
import { AuthenticateUser } from '../middleware/auth.js'
import { requireDb } from '../middleware/requireDb.js'

const router = express.Router()

router.use(requireDb)

// Podcaster social
router.post('/follow', AuthenticateUser, uploadMiddleware, controllers.followPodcaster)
router.post('/like', AuthenticateUser, uploadMiddleware, controllers.likePodcaster)

// Podcaster auth
router.post('/register', validateRegister, controllers.register)
router.post('/login', validateLogin, controllers.login)
router.post('/verifyOtp', controllers.verifyOtp)
router.post('/resendOtp', controllers.resendOtp)
router.post('/forgotPassword', validateForgotPassword, controllers.forgotPassword)
router.post('/resetPassword', validateResetPassword, controllers.resetPassword)
router.get('/isVerified', controllers.isVerified)
router.delete('/account', AuthenticateUser, controllers.deleteMyAccount)

// Podcaster directory
router.get('/getAllPodcasters', AuthenticateUser, controllers.getAllPodcasters)
router.get('/getPodcasterById/:id', controllers.getPodcasterById)
router.get('/getPodcasterByName/:name', controllers.getPodcasterByName)

// Podcaster content - Podcasts
router.post('/podcast/upload', AuthenticateUser, uploadMiddleware, controllers.uploadPodcast)
router.post('/podcast/edit', AuthenticateUser, uploadMiddleware, controllers.editPodcast)
router.post('/podcast/remove', AuthenticateUser, controllers.removePodcast)
router.post('/podcast/hide', AuthenticateUser, controllers.hidePodcast)
router.post('/podcast/unhide', AuthenticateUser, controllers.unhidePodcast)
router.get('/podcast/my', AuthenticateUser, controllers.getMyPodcasts)

// Podcaster profile
router.post('/profile/edit', AuthenticateUser, uploadMiddleware, controllers.editPodcasterProfile)
router.get('/profile/me', AuthenticateUser, controllers.getPodcasterProfile)

export default router
