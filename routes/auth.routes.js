import express from 'express'
import AuthenticateUser from '../middleware/auth.js'

const router = express.Router()

router.get('/verify-token', AuthenticateUser, (req, res) => {
  res.status(200).json({ success: true, message: 'Token is valid', user: req.user })
})

export default router