import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const voucherSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true }, // Mã giảm giá
    description: { type: String },
    type: { type: String, enum: ["fixed", "percent"], required: true }, // fixed: giảm tiền, percent: giảm %
    value: { type: Number, required: true }, // Giá trị giảm
    minOrderValue: { type: Number, default: 0 }, // Giá trị đơn tối thiểu để áp dụng
    maxDiscount: { type: Number }, // Giảm tối đa (cho voucher %)
    quantity: { type: Number, default: 1 }, // Số lượt sử dụng còn lại
    expiresAt: { type: Date }, // Hết hạn
    isActive: { type: Boolean, default: true }, // Đang hoạt động?
    usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Người đã dùng
  },
  { timestamps: true, versionKey: false }
);

voucherSchema.plugin(mongoosePaginate);

export default mongoose.model("Voucher", voucherSchema);
