import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    productVariantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String, required: true },
      },
    ],
    updatedCount: { type: Number, default: 0 },
    reply: {
      comment: { type: String },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
      repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending", 
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", 
    },
    approvedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

reviewSchema.index(
  { userId: 1, orderId: 1, productVariantId: 1 },
  { unique: true }
); 

export default mongoose.model("Review", reviewSchema);