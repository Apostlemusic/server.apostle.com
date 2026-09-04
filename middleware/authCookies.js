/**
 * Shared auth-cookie helper.
 *
 * Previously each controller inlined its own cookie options and hardcoded a
 * 15-minute maxAge for the access cookie, even though the access JWT itself is
 * signed with JWT_ACCESS_EXPIRE (1h in production). The cookie therefore died
 * long before the token it carried.
 */

const parseDuration = (value, fallbackMs) => {
    if (value == null || value === '') return fallbackMs
    const raw = String(value).trim()
    const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i.exec(raw)
    if (!match) return fallbackMs
    const amount = Number(match[1])
    const unit = (match[2] || 's').toLowerCase()
    const factor = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]
    return Math.round(amount * factor)
}

export const accessTokenMaxAge = () => parseDuration(process.env.JWT_ACCESS_EXPIRE, 60 * 60 * 1000)
export const refreshTokenMaxAge = () => parseDuration(process.env.JWT_REFRESH_EXPIRE, 7 * 24 * 60 * 60 * 1000)

/**
 * Cross-site cookies require SameSite=None + Secure. We treat the request as
 * cross-site/secure whenever it actually arrived over HTTPS, rather than relying
 * solely on NODE_ENV, which is not set in this repo's .env and silently
 * downgraded cookies to SameSite=Lax (which browsers then drop cross-site).
 */
export const buildCookieOptions = (req, maxAge) => {
    const forwardedProto = req?.headers?.['x-forwarded-proto']
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
    const isHttps = String(proto || '').split(',')[0].trim() === 'https' || req?.secure === true
    const isProd = process.env.NODE_ENV === 'production' || isHttps
    return {
        httpOnly: true,
        sameSite: isProd ? 'None' : 'Lax',
        secure: isProd,
        path: '/',
        maxAge,
    }
}

export const setAuthCookies = (req, res, accessToken, refreshToken, names = {}) => {
    const accessName = names.access || 'apostolicaccesstoken'
    const refreshName = names.refresh || 'apostolictoken'
    res.cookie(accessName, accessToken, buildCookieOptions(req, accessTokenMaxAge()))
    if (refreshToken) {
        res.cookie(refreshName, refreshToken, buildCookieOptions(req, refreshTokenMaxAge()))
    }
}

export const clearAuthCookies = (req, res, names = {}) => {
    const accessName = names.access || 'apostolicaccesstoken'
    const refreshName = names.refresh || 'apostolictoken'
    const opts = buildCookieOptions(req, 0)
    delete opts.maxAge
    res.clearCookie(accessName, opts)
    res.clearCookie(refreshName, opts)
}
