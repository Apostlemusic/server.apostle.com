import jwt from 'jsonwebtoken';
import UserModel from '../model/User.js';
import AdminModel from '../model/Admin.js';

export const AuthenticateUser = async (req, res, next) => {
    const accessToken = req.cookies.apostolicaccesstoken;
    const refreshToken = req.cookies.apostolictoken;

    // console.log('TOKENS', accessToken, refreshToken);

    if (accessToken) {
        try {
            // Validate the access token
            const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
            const user = await UserModel.findById(decoded.id);
            if (!user) {
                return res.status(403).json({ success: false, data: 'Invalid token' });
            }
            req.user = user;
            return next();
        } catch (error) {
            if (error.name !== 'TokenExpiredError') {
                return res.status(403).json({ success: false, data: 'Invalid access token' });
            }
            // If TokenExpiredError, fall through to handle the refresh token
        }
    }

    // Handle missing or expired access token
    if (refreshToken) {
        try {
            const decodedRefresh = jwt.verify(refreshToken, process.env.JWT_SECRET);
            const user = await UserModel.findById(decodedRefresh.id);
            if (!user) {
                return res.status(403).json({ success: false, data: 'Invalid refresh token' });
            }

            // Generate a new access token
            const newAccessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
            res.cookie('apostolicaccesstoken', newAccessToken, {
                httpOnly: true,
                sameSite: 'None',
                secure: true,
                maxAge: 15 * 60 * 1000, // 15 minutes
            });
            req.user = user;
            return next();
        } catch (refreshError) {
            return res.status(403).json({ success: false, data: 'Invalid refresh token' });
        }
    }

    // Both tokens are invalid or missing
    return res.status(401).json({ success: false, data: 'Authentication required' });
};


export const AuthenticateAdmin = async (req, res, next) => {
    const accessToken = req.cookies.apostolicadminaccesstoken;
    const refreshToken = req.cookies.apostolicadmintoken;

    //console.log('TOKENS', accessToken, refreshToken);

    if (accessToken) {
        try {
            // Validate the access token
            const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
            const user = await AdminModel.findById(decoded.id);
            req.user = user;
            return next();
        } catch (error) {
            if (error.name !== 'TokenExpiredError') {
                return res.status(403).json({ success: false, data: 'Invalid access token' });
            }
            // If TokenExpiredError, fall through to handle the refresh token
        }
    }

    // Handle missing or expired access token
    if (refreshToken) {
        try {
            const decodedRefresh = jwt.verify(refreshToken, process.env.JWT_SECRET);
            const user = await AdminModel.findById(decodedRefresh.id);
            //console.log('object', decodedRefresh, user)
            if (!user) {
                return res.status(403).json({ success: false, data: 'Invalid refresh token' });
            }

            // Generate a new access token
            const newAccessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
            res.cookie('apostolicadminaccesstoken', newAccessToken, {
                httpOnly: true,
                sameSite: 'None',
                secure: true,
                maxAge: 15 * 60 * 1000, // 15 minutes
            });
            req.user = user;
            return next();
        } catch (refreshError) {
            console.log('ERROR', refreshError)
            return res.status(403).json({ success: false, data: 'Invalid refresh token' });
        }
    }

    // Both tokens are invalid or missing
    return res.status(401).json({ success: false, data: 'Please Login' });
};
