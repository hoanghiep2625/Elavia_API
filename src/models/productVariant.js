import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const productVariantSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    sku: { type: String, required: true, index: true }, // SKU chung, dùng để liên kết hiển thị với sản phẩm cha
    price: { type: Number, required: true, index: true },
    color: {
      baseColor: { type: String, required: true, index: true },
      actualColor: { type: String, required: true },
      colorName: { type: String, required: true },
    },
    images: {
      main: {
        url: { type: String, required: true },
        public_id: { type: String, required: true },
      },
      hover: {
        url: { type: String, required: true },
        public_id: { type: String, required: true },
      },
      product: [
        {
          url: { type: String, required: true },
          public_id: { type: String, required: true },
        },
      ],
    },

    sizes: [
      {
        size: {
          type: String,
          enum: ["S", "M", "L", "XL", "XXL"],
          required: true,
        },
        stock: { type: Number, required: true, min: 0, index: true },
      },
    ],
    status: {
      type: Boolean,
      default: true, // true = active, false = inactive
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

productVariantSchema.plugin(mongoosePaginate);

const ProductVariant = mongoose.model("ProductVariant", productVariantSchema);

export default ProductVariant;
