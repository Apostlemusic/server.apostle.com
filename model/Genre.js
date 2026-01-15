import mongoose from "mongoose";

const GenereSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [ true, 'Genre name is required' ],
        unique: [ true, 'Genre name must be unique']
    },
    slug: {
        type: String,
    },
    genreImg: {
        type: String
    },
    imageUrl: { type: String },
},
{ timestamps: true}
)

const GenreModel = mongoose.model('genre', GenereSchema)
export default GenreModel