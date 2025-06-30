import mongoose, { Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const loginDetailSchema = new mongoose.Schema(
  {
    device: String,
    platform: String,
    loginType: String,
    ip: String,
  },
  { _id: false }
);

const loginHistorySchema = new mongoose.Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "user", unique: true },
    logins: {
      type: Map,
      of: loginDetailSchema,
      default: {},
    },
  },
  { timestamps: false, versionKey: false }
);
loginHistorySchema.plugin(mongoosePaginate);
export default mongoose.model("LoginHistory", loginHistorySchema);
