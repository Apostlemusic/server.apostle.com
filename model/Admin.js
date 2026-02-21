import mongoose from "mongoose";
import crypto from 'crypto'
import bcryptjs from 'bcryptjs'
import jsonwebtoken from 'jsonwebtoken'

const AdminSchema = new mongoose.Schema({
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
    apostleId: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
    },
    phoneNumber: {
        type: String,
        required: [ true,  'Phone number is required' ],
        unique: [ true, 'Phone number already exist' ]
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
},
{timestamps: true}
)

AdminSchema.pre('save', async function(next){
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

AdminSchema.methods.matchPassword = async function(password){
    return await bcryptjs.compare(password, this.password)
}

AdminSchema.methods.getAccessToken = function(){
    return jsonwebtoken.sign({ id: this._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRE})
}

AdminSchema.methods.getRefreshToken = function(){
    return jsonwebtoken.sign({ id: this._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE})
}

AdminSchema.methods.getResetPasswordToken = function(){
    const resetToken = crypto.randomBytes(20).toString('hex');

    this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex')
    this.resetPasswordExpire = Date.now() + 10 * (60 * 1000)

    return resetToken
}


const AdminModel =  mongoose.model('admin', AdminSchema);
export default AdminModel