import mongoose from "mongoose";

const productVariantSnapshotSchema = new mongoose.Schema(
  {
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    product: {
      type: Object,
      required: false,
    },
    sku: { type: String, required: true },
    color: {
      baseColor: { type: String, required: true },
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
        stock: { type: Number, required: true, min: 0 },
        price: { type: Number, required: true },
      },
    ],
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model(
  "ProductVariantSnapshot",
  productVariantSnapshotSchema
);
