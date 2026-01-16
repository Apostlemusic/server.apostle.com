import OtpModel from "../model/Otp.js";
import SongModel from "../model/Song.js";
import CategoryModel from "../model/Categories.js";
import GenreModel from "../model/Genre.js";

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

export const ensureCategoriesExist = async (categories) => {
  const slugs = normalizeArray(categories)
  for (const slug of slugs) {
    const existing = await CategoryModel.findOne({ slug })
    if (!existing) {
      await new CategoryModel({ name: titleCase(slug), slug }).save()
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