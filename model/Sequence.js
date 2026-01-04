import mongoose from 'mongoose'

const SequenceSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  value: { type: Number, required: true, default: 0 },
}, { timestamps: true })

const SequenceModel = mongoose.model('sequence', SequenceSchema)
export default SequenceModel
