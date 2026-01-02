import mongoose from "mongoose";
import crypto from 'crypto'
import bcryptjs from 'bcryptjs'
import jsonwebtoken from 'jsonwebtoken'

const UserSchema = new mongoose.Schema({
    name: {
        type: String
    },
    password: {
        type: String
    },
    email: {
        type: String,
        required: [ true,  'Email address is required' ],
        unique: [ true, 'Email address already exist' ]
    },
    phoneNumber: {
        type: String,
    },
    role: {
        type: String,
        enum: ['user','artist','admin'],
        default: 'user'
    },
    verified: {
        type: Boolean,
        default: false
    },
    blocked: {
        type: Boolean,
        default: false
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
},
{timestamps: true}
)

UserSchema.pre('save', async function(next){
    if(!this.isModified('password')) {
        return next();
    };
  
    try {
        const salt = await bcryptjs.genSalt(10);
        this.password = await bcryptjs.hash(this.password, salt)
        next()
    } catch (error) {
        next(error)
    }
})

UserSchema.methods.matchPassword = async function(password){
    return await bcryptjs.compare(password, this.password)
}

UserSchema.methods.getAccessToken = function(){
    return jsonwebtoken.sign({ id: this._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRE})
}

UserSchema.methods.getRefreshToken = function(){
    return jsonwebtoken.sign({ id: this._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE})
}

UserSchema.methods.getResetPasswordToken = function(){
    const resetToken = crypto.randomBytes(20).toString('hex');

    this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex')
    this.resetPasswordExpire = Date.now() + 10 * (60 * 1000)

    return resetToken
}


const UserModel =  mongoose.model('user', UserSchema);
export default UserModel