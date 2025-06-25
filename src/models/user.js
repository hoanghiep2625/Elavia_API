import mongoose, { Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const locationSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const shippingAddressSchema = new Schema({
  receiver_name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  city: {
    type: locationSchema,
    required: true,
  },
  district: {
    type: locationSchema,
    required: true,
  },
  commune: {
    type: locationSchema,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
});

const registerSchema = new Schema(
  {
    first_name: {
      type: String,
      required: true,
      minLength: 1,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true,
    },
    date: {
      type: String,
    },
    sex: {
      type: String,
      enum: ["0", "1"],
      required: true,
    },
    shipping_addresses: {
      type: [shippingAddressSchema],
      default: [],
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["1", "3"],
      default: "1",
    },
    refreshToken: { type: String, default: "" },
    verificationCode: String,
    isVerified: { type: Boolean, default: false },
    verificationExpires: { type: Date, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

registerSchema.plugin(mongoosePaginate);

export default mongoose.model("user", registerSchema);
