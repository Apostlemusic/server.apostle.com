import mongoose from "mongoose";

const AlbumSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Album name is required'] },
  albumId: { type: String, unique: true },
  artistUserId: { type: String, required: true },
  coverImg: { type: String },
  description: { type: String },
  category: { type: [String], default: [] },
  genre: { type: [String], default: [] },
  tracksId: { type: [String], default: [] },
  likes: { type: [String], default: [] },
  hidden: { type: Boolean, default: false },
}, { timestamps: true });

const AlbumModel = mongoose.model('album', AlbumSchema);
export default AlbumModel;
