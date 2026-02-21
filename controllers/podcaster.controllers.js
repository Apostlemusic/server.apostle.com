import PodcasterModel from '../model/Podcaster.js'
import SongModel from '../model/Song.js'
import mongoose from 'mongoose'
import UserModel from '../model/User.js'
import OtpModel from '../model/Otp.js'
import PlayListModel from '../model/PlayList.js'
import RecentPlaysModel from '../model/RecentPlays.js'
import PlaybackModel from '../model/Playback.js'
import { generateOtp } from '../middleware/utils.js'
import { activationEmail, forgotPasswordEmail } from '../middleware/emailTemplate.js'
import { toSlug, ensureCategoriesExist, ensureGenresExist, generateApostleId, getUserKey } from '../middleware/utils.js'

export const uploadMiddleware = (req, res, next) => next()

const PODCAST_SLUG = toSlug('podcast')
const buildPodcastQuery = () => ({
  $or: [
    { contentType: 'podcast' },
    { category: { $in: [PODCAST_SLUG] } },
    { genre: { $in: [PODCAST_SLUG] } },
  ],
})

function normalizeArtistIds(input) {
  if (!input) return []
  const arr = Array.isArray(input) ? input : [input]
  const ids = arr
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') return String(item.artistId || item.id || '').trim()
      return ''
    })
    .filter(Boolean)
  return [...new Set(ids)]
}

async function attachListenCountsToPodcasts(podcasts) {
  const list = Array.isArray(podcasts) ? podcasts : [podcasts]
  if (list.length === 0) return []
  const ids = list.map(p => p._id).filter(Boolean)
  const agg = await PlaybackModel.aggregate([
    { $match: { itemType: 'podcast', itemId: { $in: ids } } },
    { $group: { _id: '$itemId', count: { $sum: 1 } } },
  ])
  const map = new Map(agg.map(a => [String(a._id), a.count]))
  return list.map((podcast) => {
    const obj = typeof podcast?.toObject === 'function' ? podcast.toObject() : podcast
    const entries = Object.entries(obj || {})
    const nextEntries = []
    let inserted = false
    for (const [key, value] of entries) {
      nextEntries.push([key, value])
      if (key === 'trackUrl') {
        nextEntries.push(['listensCount', map.get(String(podcast._id)) || 0])
        inserted = true
      }
    }
    if (!inserted) {
      nextEntries.push(['listensCount', map.get(String(podcast._id)) || 0])
    }
    return Object.fromEntries(nextEntries)
  })
}

function requirePodcaster(req, res) {
  const user = req.user
  if (!user) return { error: res.status(401).json({ success: false, message: 'Authentication required' }) }
  if (user.role !== 'podcaster') return { error: res.status(403).json({ success: false, message: 'Podcaster account required' }) }
  const userKey = getUserKey(user)
  const userKeys = [userKey, String(user._id)].filter(Boolean)
  return { user, userKey, userKeys }
}

// ===== Podcaster social =====
export const followPodcaster = async (req, res) => {
  try {
    const { podcasterId, userId } = req.body
    const p = await PodcasterModel.findById(podcasterId)
    if (!p) return res.status(404).json({ success: false, message: 'Podcaster not found' })
    p.followers = p.followers || []
    if (!p.followers.includes(userId)) p.followers.push(userId)
    else p.followers = p.followers.filter(f => f !== userId)
    await p.save()
    res.status(200).json({ success: true, followers: p.followers })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error toggling follow', error: err.message })
  }
}

export const likePodcaster = async (req, res) => {
  try {
    const { podcasterId, userId } = req.body
    const p = await PodcasterModel.findById(podcasterId)
    if (!p) return res.status(404).json({ success: false, message: 'Podcaster not found' })
    p.likes = p.likes || []
    if (!p.likes.includes(userId)) p.likes.push(userId)
    else p.likes = p.likes.filter(l => l !== userId)
    await p.save()
    res.status(200).json({ success: true, likes: p.likes })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error toggling like', error: err.message })
  }
}

// ===== Podcaster directory =====
export const getAllPodcasters = async (req, res) => {
  try {
    const podcasters = await PodcasterModel.find()
    const withCounts = podcasters.map(p => ({
      ...(typeof p.toObject === 'function' ? p.toObject() : p),
      likesCount: p.likes?.length || 0,
      followersCount: p.followers?.length || 0,
    }))
    res.status(200).json({ success: true, podcasters: withCounts })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching podcasters', error: err.message })
  }
}

export const getPodcasterById = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    const isObjectId = mongoose.Types.ObjectId.isValid(id)

    const podcaster = isObjectId
      ? await PodcasterModel.findById(id)
      : await PodcasterModel.findOne({ $or: [{ podcasterId: id }, { userId: id }] })

    if (!podcaster) return res.status(404).json({ success: false, message: 'Podcaster not found' })

    const podcasts = await SongModel.find({ userId: podcaster.userId, ...buildPodcastQuery() })

    const obj = typeof podcaster.toObject === 'function' ? podcaster.toObject() : podcaster
    obj.likesCount = podcaster.likes?.length || 0
    obj.followersCount = podcaster.followers?.length || 0

    res.status(200).json({ success: true, podcaster: obj, podcasts })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching podcaster', error: err.message })
  }
}

export const getPodcasterByName = async (req, res) => {
  try {
    const name = String(req.params.name || '').trim()
    if (!name) return res.status(400).json({ success: false, message: 'Podcaster name is required' })

    const podcaster = await PodcasterModel.findOne({ name: new RegExp(`^${name}$`, 'i') })
    if (!podcaster) return res.status(404).json({ success: false, message: 'Podcaster not found' })

    const podcasts = await SongModel.find({ userId: podcaster.userId, ...buildPodcastQuery() })

    const obj = typeof podcaster.toObject === 'function' ? podcaster.toObject() : podcaster
    obj.likesCount = podcaster.likes?.length || 0
    obj.followersCount = podcaster.followers?.length || 0

    res.status(200).json({ success: true, podcaster: obj, podcasts })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching podcaster by name', error: err.message })
  }
}

// ===== Podcaster profile =====
export const getPodcasterProfile = async (req, res) => {
  const { user, userKey, userKeys, error } = requirePodcaster(req, res); if (error) return
  try {
    const profile = await PodcasterModel.findOne({ userId: { $in: userKeys } })
    if (!profile) return res.status(404).json({ success: false, message: 'Podcaster profile not found' })
    const obj = profile && typeof profile.toObject === 'function' ? profile.toObject() : profile
    if (obj) obj.userId = userKey
    res.status(200).json({ success: true, podcaster: obj })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching profile', error: err.message })
  }
}

export const editPodcasterProfile = async (req, res) => {
  const { userKeys, error } = requirePodcaster(req, res); if (error) return
  try {
    const profile = await PodcasterModel.findOne({ userId: { $in: userKeys } })
    if (!profile) return res.status(404).json({ success: false, message: 'Podcaster profile not found' })

    const updates = {}
    if (req.body?.name) updates.name = String(req.body.name).trim()
    if (req.body?.about !== undefined) updates.about = req.body.about
    if (req.body?.description !== undefined) updates.description = req.body.description
    const img = req.body?.profileImg ?? req.body?.imageUrl
    if (img !== undefined) updates.profileImg = typeof img === 'string' ? img.trim() : img

    Object.assign(profile, updates)
    await profile.save()
    res.status(200).json({ success: true, podcaster: profile })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating profile', error: err.message })
  }
}

// ===== Podcaster content: Podcasts =====
export const uploadPodcast = async (req, res) => {
  const { userKey, error } = requirePodcaster(req, res); if (error) return
  try {
    const collaboratorIds = normalizeArtistIds(req.body?.artistIds ?? req.body?.collaborators ?? req.body?.artists)
    const payload = { ...req.body, userId: userKey, hidden: false, contentType: 'podcast', artists: collaboratorIds }

    if (!payload.trackId) {
      payload.trackId = await generateApostleId({ role: 'podcaster', type: 'POD' })
    }

    const categories = await ensureCategoriesExist(payload.category, { contentType: 'podcast' })
    const genres = await ensureGenresExist(payload.genre)
    const catSet = new Set([...(categories || []), PODCAST_SLUG])
    payload.category = [...catSet]
    payload.genre = genres || []

    const podcast = new SongModel(payload)
    await podcast.save()
    res.status(201).json({ success: true, podcast })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error uploading podcast', error: err.message })
  }
}

export const editPodcast = async (req, res) => {
  const { userKeys, error } = requirePodcaster(req, res); if (error) return
  try {
    const { podcastId, ...rest } = req.body
    const podcast = await SongModel.findById(podcastId)
    if (!podcast) return res.status(404).json({ success: false, message: 'Podcast not found' })
    if (!userKeys.includes(String(podcast.userId))) return res.status(403).json({ success: false, message: 'Not owner of podcast' })

    if (rest.category) {
      const categories = await ensureCategoriesExist(rest.category, { contentType: 'podcast' })
      const catSet = new Set([...(categories || []), PODCAST_SLUG])
      podcast.category = [...catSet]
    }
    if (rest.genre) {
      podcast.genre = await ensureGenresExist(rest.genre)
    }

    podcast.contentType = 'podcast'

    const { category: _cIgnored, genre: _gIgnored, contentType: _tIgnored, ...others } = rest
    if (rest.artistIds || rest.collaborators || rest.artists) {
      podcast.artists = normalizeArtistIds(rest.artistIds ?? rest.collaborators ?? rest.artists)
    }
    const { artistIds: _aIgnored, collaborators: _coIgnored, ...restPayload } = others
    Object.assign(podcast, restPayload)

    await podcast.save()
    res.status(200).json({ success: true, podcast })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error editing podcast', error: err.message })
  }
}

export const removePodcast = async (req, res) => {
  const { userKeys, error } = requirePodcaster(req, res); if (error) return
  try {
    const { podcastId } = req.body
    const podcast = await SongModel.findById(podcastId)
    if (!podcast) return res.status(404).json({ success: false, message: 'Podcast not found' })
    if (!userKeys.includes(String(podcast.userId))) return res.status(403).json({ success: false, message: 'Not owner of podcast' })
    await podcast.deleteOne()
    res.status(200).json({ success: true, message: 'Podcast removed' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error removing podcast', error: err.message })
  }
}

export const hidePodcast = async (req, res) => {
  const { userKeys, error } = requirePodcaster(req, res); if (error) return
  try {
    const { podcastId } = req.body
    const podcast = await SongModel.findById(podcastId)
    if (!podcast) return res.status(404).json({ success: false, message: 'Podcast not found' })
    if (!userKeys.includes(String(podcast.userId))) return res.status(403).json({ success: false, message: 'Not owner of podcast' })
    podcast.hidden = true
    await podcast.save()
    res.status(200).json({ success: true, podcast })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error hiding podcast', error: err.message })
  }
}

export const unhidePodcast = async (req, res) => {
  const { userKeys, error } = requirePodcaster(req, res); if (error) return
  try {
    const { podcastId } = req.body
    const podcast = await SongModel.findById(podcastId)
    if (!podcast) return res.status(404).json({ success: false, message: 'Podcast not found' })
    if (!userKeys.includes(String(podcast.userId))) return res.status(403).json({ success: false, message: 'Not owner of podcast' })
    podcast.hidden = false
    await podcast.save()
    res.status(200).json({ success: true, podcast })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error unhiding podcast', error: err.message })
  }
}

export const getMyPodcasts = async (req, res) => {
  const { userKeys, error } = requirePodcaster(req, res); if (error) return
  try {
    const podcasts = await SongModel.find({ userId: { $in: userKeys }, ...buildPodcastQuery() })
    const podcastsWithCounts = await attachListenCountsToPodcasts(podcasts)
    res.status(200).json({ success: true, podcasts: podcastsWithCounts })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching my podcasts', error: err.message })
  }
}

// ===== Podcaster auth =====
export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body
    const exists = await UserModel.findOne({ email })
    if (exists) return res.status(400).json({ success: false, message: 'Email already exists' })

    const apostleId = await generateApostleId({ role: 'podcaster' })
    const user = new UserModel({ email, password, name, role: 'podcaster', apostleId })
    await user.save()

    const podcasterId = await generateApostleId({ role: 'podcaster', type: 'POD' })

    const profile = new PodcasterModel({ userId: user.apostleId || String(user._id), podcasterId, name: name || 'Podcaster' })
    await profile.save()

    try {
      const otp = await generateOtp(user._id, email)
      await activationEmail({ name: user.name || 'Podcaster', email, otp })
    } catch (e) {
      console.error('Failed to send activation email', e.message || e)
    }

    const accessToken = user.getAccessToken()
    const refreshToken = user.getRefreshToken()

    res.cookie('apostolicaccesstoken', accessToken, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
      maxAge: 15 * 60 * 1000,
    })
    res.cookie('apostolictoken', refreshToken, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.status(201).json({ success: true, podcaster: { id: profile.podcasterId || profile._id, userId: user.apostleId || user._id, name: profile.name }, accessToken, refreshToken, message: 'Podcaster created. Activation OTP sent to email.' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Podcaster register error', error: err.message })
  }
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await UserModel.findOne({ email })
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' })

    const match = await user.matchPassword(password)
    if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' })

    if (user.role !== 'podcaster') {
      return res.status(403).json({ success: false, message: 'Not a podcaster account' })
    }

    if (!user.verified) {
      return res.status(403).json({ success: false, message: 'Account not verified. Please verify your OTP to continue.' })
    }

    const accessToken = user.getAccessToken()
    const refreshToken = user.getRefreshToken()

    res.cookie('apostolicaccesstoken', accessToken, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
      maxAge: 15 * 60 * 1000,
    })
    res.cookie('apostolictoken', refreshToken, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    const profile = await PodcasterModel.findOne({ userId: { $in: [user.apostleId, String(user._id)].filter(Boolean) } })
    const obj = profile && typeof profile.toObject === 'function' ? profile.toObject() : profile
    if (obj) obj.email = user.email

    res.status(200).json({ success: true, podcaster: obj, podcasterEmail: user.email, accessToken, refreshToken })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Podcaster login error', error: err.message })
  }
}

export const deleteMyAccount = async (req, res) => {
  const { user, userKey, userKeys, error } = requirePodcaster(req, res); if (error) return
  try {
    await Promise.all([
      PodcasterModel.deleteMany({ userId: { $in: userKeys } }),
      SongModel.deleteMany({ userId: { $in: userKeys } }),
      PlayListModel.deleteMany({ userId: { $in: userKeys } }),
      RecentPlaysModel.deleteMany({ userId: { $in: userKeys } }),
      PlaybackModel.deleteMany({ userId: user._id }),
      OtpModel.deleteMany({ $or: [{ userId: { $in: userKeys } }, { email: user.email }] }),
    ])

    await UserModel.deleteOne({ _id: user._id })

    res.clearCookie('apostolicaccesstoken')
    res.clearCookie('apostolictoken')
    res.clearCookie('accessToken')
    res.clearCookie('refreshToken')

    res.status(200).json({ success: true, message: 'Account deleted', userId: userKey })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting account', error: err.message })
  }
}

export const verifyOtp = async (req, res) => {
  try {
    const source = (req.body && typeof req.body === 'object') ? req.body : (req.query || {})
    const email = source?.email
    let otp = source?.otp ?? source?.code
    if (!email || !otp) return res.status(400).json({ success: false, message: 'email and otp are required' })
    otp = String(otp).trim()
    const record = await OtpModel.findOne({ email, code: otp })
    if (!record) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' })
    const user = await UserModel.findOne({ email })
    if (user) {
      user.verified = true
      user.role = user.role || 'podcaster'
      await user.save()
    }
    await OtpModel.deleteMany({ email })
    res.status(200).json({ success: true, message: 'OTP verified' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Podcaster verifyOtp error', error: err.message })
  }
}

export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body
    const user = await UserModel.findOne({ email })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })
    const otp = await generateOtp(user._id, email)
    await activationEmail({ name: user.name || 'Podcaster', email, otp })
    res.status(200).json({ success: true, message: 'OTP resent' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Podcaster resendOtp error', error: err.message })
  }
}

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body
    const user = await UserModel.findOne({ email })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })
    const otp = await generateOtp(user._id, email)
    await forgotPasswordEmail({ name: user.name || 'Podcaster', email, otp })
    res.status(200).json({ success: true, message: 'Password reset OTP sent' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Podcaster forgotPassword error', error: err.message })
  }
}

export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body
    const record = await OtpModel.findOne({ email, code: otp })
    if (!record) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' })
    const user = await UserModel.findOne({ email })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })
    user.password = newPassword
    await user.save()
    await OtpModel.deleteMany({ email })
    res.status(200).json({ success: true, message: 'Password reset successful' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Podcaster resetPassword error', error: err.message })
  }
}

export const isVerified = async (req, res) => {
  try {
    const source = (req.body && typeof req.body === 'object') ? req.body : (req.query || {})
    const email = source?.email
    if (!email) return res.status(400).json({ success: false, message: 'email is required' })
    const user = await UserModel.findOne({ email })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })
    if (user.role !== 'podcaster') return res.status(403).json({ success: false, message: 'Not a podcaster account' })
    res.status(200).json({ success: true, verified: !!user.verified })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Podcaster isVerified error', error: err.message })
  }
}

export default {
  uploadMiddleware,
  followPodcaster,
  likePodcaster,
  getAllPodcasters,
  getPodcasterById,
  getPodcasterByName,
  getPodcasterProfile,
  editPodcasterProfile,
  uploadPodcast,
  editPodcast,
  removePodcast,
  hidePodcast,
  unhidePodcast,
  getMyPodcasts,
  register,
  login,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  isVerified,
}
