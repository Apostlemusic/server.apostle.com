import mongoose from "mongoose";

const PodcasterSchema = new mongoose.Schema({
    userId: {
        type: String
    },
    podcasterId: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
    },
    name: {
        type: String
    },
    profileImg: {
        type: String
    },
    about: {
        type: String
    },
    description: {
        type: String
    },
    followers: {
        type: Array,
        default: []
    },
    likes: {
        type: Array,
        default: []
    }
},
{ timestamps: true})

const PodcasterModel = mongoose.model('podcaster', PodcasterSchema)
export default PodcasterModel
