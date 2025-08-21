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
    embedding: { type: [Number], default: [] },
    sku: { type: String, required: true },
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
    attributes: [
      {
        attribute: { type: String, required: true },
        value: { type: String, required: true },
      },
    ],
    sizes: [
      {
        size: {
          type: String,
          enum: ["S", "M", "L", "XL", "XXL"],
          required: true,
        },
        stock: { type: Number, required: true, min: 0, index: true },
        price: { type: Number, required: true, index: true },
      },
    ],
    status: {
      type: Boolean,
      default: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

productVariantSchema.plugin(mongoosePaginate);

export default mongoose.model("ProductVariant", productVariantSchema);
