import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    level: { type: Number, required: true, min: 1, max: 3, index: true },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("Category", categorySchema);
