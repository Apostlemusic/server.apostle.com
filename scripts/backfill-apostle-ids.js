import mongoose from 'mongoose'
import connectDB from '../connection/db.js'
import UserModel from '../model/User.js'
import AdminModel from '../model/Admin.js'
import ArtistModel from '../model/Artist.js'
import PodcasterModel from '../model/Podcaster.js'
import SongModel from '../model/Song.js'
import AlbumModel from '../model/Album.js'
import PlayListModel from '../model/PlayList.js'
import RecentPlaysModel from '../model/RecentPlays.js'
import OtpModel from '../model/Otp.js'
import { generateApostleId, toSlug } from '../middleware/utils.js'

const podcastSlug = toSlug('podcast')

const needsApostleId = (value) => {
  if (!value) return true
  return !String(value).startsWith('APO-')
}

async function backfillUsers() {
  const cursor = UserModel.find().cursor()
  let updated = 0
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    if (!needsApostleId(doc.apostleId)) continue
    doc.apostleId = await generateApostleId({ role: doc.role || 'user' })
    await doc.save()
    updated += 1
  }
  return updated
}

async function backfillAdmins() {
  const cursor = AdminModel.find().cursor()
  let updated = 0
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    if (!needsApostleId(doc.apostleId)) continue
    doc.apostleId = await generateApostleId({ role: 'admin' })
    await doc.save()
    updated += 1
  }
  return updated
}

async function backfillArtists() {
  const cursor = ArtistModel.find().cursor()
  let updated = 0
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    if (!needsApostleId(doc.artistId)) continue
    doc.artistId = await generateApostleId({ role: 'artist', type: 'ART' })
    await doc.save()
    updated += 1
  }
  return updated
}

async function backfillPodcasters() {
  const cursor = PodcasterModel.find().cursor()
  let updated = 0
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    if (!needsApostleId(doc.podcasterId)) continue
    doc.podcasterId = await generateApostleId({ role: 'podcaster', type: 'POD' })
    await doc.save()
    updated += 1
  }
  return updated
}

async function backfillAlbums() {
  const cursor = AlbumModel.find().cursor()
  let updated = 0
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    if (!needsApostleId(doc.albumId)) continue
    doc.albumId = await generateApostleId({ role: 'artist', type: 'ALB' })
    await doc.save()
    updated += 1
  }
  return updated
}

async function backfillSongsAndReferences() {
  const cursor = SongModel.find().cursor()
  let updated = 0
  const trackIdMap = new Map()

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    if (!needsApostleId(doc.trackId)) continue

    const oldTrackId = doc.trackId
    const category = Array.isArray(doc.category) ? doc.category : []
    const genre = Array.isArray(doc.genre) ? doc.genre : []
    const isPodcast = doc.contentType === 'podcast' || category.includes(podcastSlug) || genre.includes(podcastSlug)
    const typeCode = isPodcast ? 'POD' : 'TRK'

    let role = 'artist'
    if (doc.userId) {
      const user = await UserModel.findById(doc.userId).select('role')
      role = user?.role || role
    }

    doc.trackId = await generateApostleId({ role, type: typeCode })
    await doc.save()
    updated += 1

    if (oldTrackId) {
      trackIdMap.set(String(oldTrackId), String(doc.trackId))
    }
  }

  if (trackIdMap.size > 0) {
    const oldIds = Array.from(trackIdMap.keys())

    const albumCursor = AlbumModel.find({ tracksId: { $in: oldIds } }).cursor()
    for (let album = await albumCursor.next(); album != null; album = await albumCursor.next()) {
      const tracks = Array.isArray(album.tracksId) ? album.tracksId : []
      album.tracksId = tracks.map((id) => trackIdMap.get(String(id)) || id)
      await album.save()
    }

    const playlistCursor = PlayListModel.find({ tracksId: { $in: oldIds } }).cursor()
    for (let playlist = await playlistCursor.next(); playlist != null; playlist = await playlistCursor.next()) {
      const tracks = Array.isArray(playlist.tracksId) ? playlist.tracksId : []
      playlist.tracksId = tracks.map((id) => trackIdMap.get(String(id)) || id)
      await playlist.save()
    }
  }

  return { updated, updatedRefs: trackIdMap.size }
}

async function buildUserIdMap() {
  const users = await UserModel.find().select('_id apostleId').lean()
  const map = new Map()
  for (const user of users) {
    if (user?.apostleId) {
      map.set(String(user._id), String(user.apostleId))
    }
  }
  return map
}

async function replaceUserIdField(model, field, idMap) {
  if (!idMap || idMap.size === 0) return 0
  const legacyIds = Array.from(idMap.keys())
  const cursor = model.find({ [field]: { $in: legacyIds } }).cursor()
  let updated = 0
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const current = String(doc[field] || '')
    const next = idMap.get(current)
    if (!next) continue
    doc[field] = next
    await doc.save()
    updated += 1
  }
  return updated
}

async function run() {
  await connectDB()

  const results = {}
  results.users = await backfillUsers()
  results.admins = await backfillAdmins()
  results.artists = await backfillArtists()
  results.podcasters = await backfillPodcasters()
  results.albums = await backfillAlbums()
  const songResult = await backfillSongsAndReferences()
  results.songs = songResult.updated
  results.trackIdRemaps = songResult.updatedRefs

  const userIdMap = await buildUserIdMap()
  results.artistUserIds = await replaceUserIdField(ArtistModel, 'userId', userIdMap)
  results.podcasterUserIds = await replaceUserIdField(PodcasterModel, 'userId', userIdMap)
  results.songUserIds = await replaceUserIdField(SongModel, 'userId', userIdMap)
  results.albumArtistUserIds = await replaceUserIdField(AlbumModel, 'artistUserId', userIdMap)
  results.playlistUserIds = await replaceUserIdField(PlayListModel, 'userId', userIdMap)
  results.recentPlaysUserIds = await replaceUserIdField(RecentPlaysModel, 'userId', userIdMap)
  results.otpUserIds = await replaceUserIdField(OtpModel, 'userId', userIdMap)

  console.log('Backfill complete:', results)
}

run()
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
