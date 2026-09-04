import mongoose from "mongoose";

const OtpSchema = new mongoose.Schema({
    code: {
        type: String,
        index: true
    },
    email: {
        type: String,
        index: true
    },
    userId: {
        type: String
    },
    // NOTE: `Date.now` must be passed as a function reference, not called.
    // `Date.now()` freezes the value at module load, so every OTP inherited the
    // process start time and the TTL index below deleted it within ~60s of creation.
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 3600 //1 Hour
    }
},
{ timestamps: true }
)

const OtpModel = mongoose.model('otp', OtpSchema)
export default OtpModel
