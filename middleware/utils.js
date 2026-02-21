import OtpModel from "../model/Otp.js";
import SongModel from "../model/Song.js";
import CategoryModel from "../model/Categories.js";
import GenreModel from "../model/Genre.js";
import SequenceModel from "../model/Sequence.js";

export const toSlug = (str = '') => {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
}

export const titleCase = (str = '') => {
  return String(str)
    .trim()
    .toLowerCase()
    .split(/[-\s_]+/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}

export const normalizeArray = (input) => {
  if (!input) return []
  const arr = Array.isArray(input) ? input : [input]
  const slugs = arr.map(v => toSlug(v)).filter(v => v && v.length > 0)
  return [...new Set(slugs)]
}

const ROLE_CODE_MAP = {
  user: 'USR',
  admin: 'ADM',
  artist: 'ART',
  podcaster: 'POD',
}

export const getRoleCode = (role) => {
  if (!role) return ROLE_CODE_MAP.user
  const key = String(role).toLowerCase()
  return ROLE_CODE_MAP[key] || String(role).toUpperCase().slice(0, 3)
}

export const generateApostleId = async ({ role, type } = {}) => {
  const roleCode = getRoleCode(role)
  const typeCode = type ? String(type).toUpperCase() : null
  const sequenceName = `apostle:${roleCode}:${typeCode || 'ACC'}`
  const seq = await SequenceModel.findOneAndUpdate(
    { name: sequenceName },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  )
  const padded = String(seq.value).padStart(6, '0')
  return `APO-${roleCode}${typeCode ? `-${typeCode}` : ''}-${padded}`
}

export const getUserKey = (user) => {
  if (!user) return ''
  return String(user.apostleId || user._id || '')
}

export const ensureCategoriesExist = async (categories, options = {}) => {
  const slugs = normalizeArray(categories)
  const contentType = typeof options?.contentType === 'string' ? options.contentType : undefined
  const allowedTypes = new Set(['song', 'podcast', 'both'])
  const normalizedType = allowedTypes.has(contentType) ? contentType : undefined

  for (const slug of slugs) {
    const existing = await CategoryModel.findOne({ slug })
    if (!existing) {
      const payload = { name: titleCase(slug), slug }
      if (normalizedType) payload.contentType = normalizedType
      await new CategoryModel(payload).save()
      continue
    }

    if (normalizedType) {
      const current = existing.contentType || 'song'
      if (normalizedType === 'both' && current !== 'both') {
        existing.contentType = 'both'
        await existing.save()
      } else if (current !== normalizedType && current !== 'both') {
        existing.contentType = 'both'
        await existing.save()
      }
    }
  }

  return slugs
}

export const ensureGenresExist = async (genres) => {
  const slugs = normalizeArray(genres)
  for (const slug of slugs) {
    const existing = await GenreModel.findOne({ slug })
    if (!existing) {
      await new GenreModel({ name: titleCase(slug), slug }).save()
    }
  }
  return slugs
}

export async function generateOtp(userId, email) {
    const generateOtp = () => {
        // Generate a random 6-digit number
        const otp = Math.floor(1000 + Math.random() * 9000).toString(); 
        return otp;
    };

    let otp;
    let exists = true;

    while (exists) {
        otp = generateOtp();
        exists = await OtpModel.findOne({ code: otp });
    }

    const otpCode = await new OtpModel({
        userId: userId,
        code: otp,
        email: email,
    }).save();

    return otp; 
}

export async function generateUniqueCode(length) {
    const courseSlug = () => {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let slugCode = ''; 

        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            slugCode += characters[randomIndex]; 
        }

        return slugCode;
    };

    let slugCode;
    let exists = true;

    while (exists) {
        slugCode = courseSlug();
        const existingCourse = await SongModel.findOne({ trackId: slugCode });
        exists = existingCourse !== null; 
    }

    return slugCode;
}

export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }