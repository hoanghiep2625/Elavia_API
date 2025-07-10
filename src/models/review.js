import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    productVariantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
    images: [{ type: String }],
    updatedCount: { type: Number, default: 0 }, 
  },
  { timestamps: true, versionKey: false }
);

reviewSchema.index({ userId: 1, orderId: 1, productVariantId: 1 }, { unique: true }); // Mỗi người chỉ được đánh giá 1 lần 1 sản phẩm trong 1 đơn

export default mongoose.model("Review", reviewSchema);