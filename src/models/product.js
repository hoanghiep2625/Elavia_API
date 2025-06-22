import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    sku: { type: String, required: true, unique: true, index: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    shortDescription: { type: String },
    description: { type: String },

    // 👇 Thêm field mới: đại diện cho biến thể chính
    representativeVariantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant", // Tên model biến thể
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

productSchema.plugin(mongoosePaginate);

const Product = mongoose.model("Product", productSchema);

export default Product;
