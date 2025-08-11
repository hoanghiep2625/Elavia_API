import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["waiting", "active", "closed"],
      default: "waiting",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
      index: true,
    },
    subject: {
      type: String,
      default: "Hỗ trợ khách hàng",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    tags: [
      {
        type: String,
        index: true,
      },
    ],
    metadata: {
      userAgent: String,
      ip: String,
      page: String,
    },
  },
  { timestamps: true, versionKey: false }
);

// Index để tối ưu query
conversationSchema.index({ userId: 1, status: 1 });
conversationSchema.index({ adminId: 1, status: 1 });
conversationSchema.index({ status: 1, lastMessageAt: -1 });

conversationSchema.plugin(mongoosePaginate);

export default mongoose.model("Conversation", conversationSchema);
