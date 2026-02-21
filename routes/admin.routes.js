import express from 'express'
import * as controllers from '../controllers/admin.controllers.js'
import { validateRegister, validateLogin, validateForgotPassword, validateResetPassword } from '../middleware/validators.js'
import { requireDb } from '../middleware/requireDb.js'
import { AuthenticateAdmin } from '../middleware/auth.js'

const router = express.Router()

// Admin auth routes require DB connectivity
router.use(requireDb)


//POST
router.post('/register', validateRegister, controllers.register)
router.post('/login', validateLogin, controllers.login)
router.post('/verifyOtp', controllers.verifyOtp)
router.post('/resendOtp', controllers.resendOtp)
router.post('/forgotPassword', validateForgotPassword, controllers.forgotPassword)
router.post('/resetPassword', validateResetPassword, controllers.resetPassword)
router.post('/logout', controllers.logout)
router.delete('/account', AuthenticateAdmin, controllers.deleteMyAccount)

// Admin server stats
router.get('/stats', AuthenticateAdmin, controllers.getServerStats)

// Admin profile
router.get('/profile/me', AuthenticateAdmin, controllers.getAdminProfile)

// ===== Podcast Categories (Admin) =====
router.post('/categories/podcasts', AuthenticateAdmin, controllers.createPodcastCategory)
router.put('/categories/podcasts', AuthenticateAdmin, controllers.updatePodcastCategory)
router.delete('/categories/podcasts', AuthenticateAdmin, controllers.deletePodcastCategory)
router.get('/categories/podcasts', AuthenticateAdmin, controllers.getPodcastCategories)
router.get('/categories/podcasts/:categorySlug', AuthenticateAdmin, controllers.getPodcastCategory)



//PUT ROUTES

export default router
