import express from 'express'
import * as controllers from '../controllers/auth.controllers.js'
import { validateRegister, validateLogin, validateForgotPassword, validateResetPassword } from '../middleware/validators.js'

const router = express.Router()


//POST
router.post('/register', validateRegister, controllers.register)
router.post('/login', validateLogin, controllers.login)
router.post('/verifyOtp', controllers.verifyOtp)
router.post('/resendOtp', controllers.resendOtp)
router.post('/forgotPassword', validateForgotPassword, controllers.forgotPassword)
router.post('/resetPassword', validateResetPassword, controllers.resetPassword)
router.post('/verifyToken', controllers.verifyToken)
router.post('/logout', controllers.logout)


//router.post('/deleteAll', controllers.deleteAll)


//PUT ROUTES

export default router
