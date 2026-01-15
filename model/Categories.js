import mongoose from "mongoose";

const CategoriesSchema = new mongoose.Schema({
    name: {
        type: String
    },
    slug: {
        type: String
    },
    categoryImg: {
        type: String
    },
    imageUrl: { type: String }
},
{ timestamps: true},
)

const CategoryModel = mongoose.model('categories', CategoriesSchema)
export default CategoryModel