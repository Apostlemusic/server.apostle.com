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

// Admin server stats
router.get('/stats', AuthenticateAdmin, controllers.getServerStats)



//PUT ROUTES

export default router
