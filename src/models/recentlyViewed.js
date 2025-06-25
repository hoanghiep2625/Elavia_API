import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const recentlyViewedSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ProductVariant",
      },
    ],
  },
  { timestamps: true, versionKey: false }
);
recentlyViewedSchema.plugin(mongoosePaginate);

export default mongoose.model("RecentlyViewed", recentlyViewedSchema);
