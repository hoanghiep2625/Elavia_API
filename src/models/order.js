import mongoose, { version } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

export const OrderItemSchema = new Schema(
  {
    productVariantId: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
    },
    size: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      required: true,
    },
    reviewed: { type: Boolean, default: false },
  },
  { _id: false }
);

// Schema lưu thông tin thanh toán qua MoMo (nếu áp dụng)
const PaymentDetailsSchema = new Schema(
  {
    momoTransactionId: { type: String },
    responseData: { type: Schema.Types.Mixed }, // Lưu toàn bộ dữ liệu trả về từ MoMo nếu cần
    // Các trường theo dõi hoàn tiền khi người dùng huỷ sau khi đã thanh toán
    refundRequested: { type: Boolean, default: false },
    refundProcessed: { type: Boolean, default: false },
    refundRequestedAt: { type: Date },
    refundRequestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    refundStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    refundTransactionId: { type: String }, // ID giao dịch hoàn tiền
    refundAmount: { type: Number }, // Số tiền hoàn
    refundProcessedAt: { type: Date }, // Thời gian xử lý hoàn tiền
    refundNote: { type: String }, // Ghi chú hoàn tiền
  },
  { _id: false }
);

// Schema đơn hàng chính
export const OrderSchema = new Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      _id: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      email: {
        type: String,
        required: true,
      },
    },
    receiver: {
      type: { type: String, enum: ["home", "company"] },
      name: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      cityName: String,
      districtName: String,
      wardName: String,
    },
    items: [OrderItemSchema],
    totalPrice: {
      type: Number,
      required: true,
    },
    shippingFee: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    finalAmount: {
      type: Number,
      required: true,
    },
    voucher: {
      code: { type: String },
      type: { type: String, enum: ["fixed", "percent"] },
      value: { type: Number },
      maxDiscount: { type: Number },
    },
    paymentMethod: {
      type: String,
      enum: ["COD", "MoMo", "zalopay"],
      required: true,
    },
    paymentUrl: {
      type: String,
    },
    paymentDetails: PaymentDetailsSchema,
    // Trạng thái thanh toán
    paymentStatus: {
      type: String,
      enum: [
        "Chờ thanh toán", // Mặc định với MoMo/ZaloPay
        "Đã thanh toán", // Sau khi xác nhận thanh toán
        "Thanh toán khi nhận hàng", // Mặc định với COD
        "Huỷ do quá thời gian thanh toán", // Huỷ tự động nếu hết hạn thanh toán
        "Giao dịch bị từ chối do nhà phát hành", // Từ chối bởi ngân hàng/nhà phát hành
        "Người mua huỷ", // Huỷ bởi người mua
        "Người bán huỷ", // Huỷ bởi người bán
      ],
      required: true,
      default: function () {
        return this.paymentMethod === "MoMo" || this.paymentMethod === "zalopay"
          ? "Chờ thanh toán"
          : "Thanh toán khi nhận hàng";
      },
    },
    // Trạng thái giao hàng
    shippingStatus: {
      type: String,
      enum: [
        "Chờ xác nhận", // Mặc định
        "Đã xác nhận", // Khi người bán xác nhận đơn hàng
        "Đang giao hàng", // Đang trong quá trình giao hàng
        "Giao hàng thành công", // Giao hàng thành công
        "Giao hàng thất bại", // Giao hàng thất bại
        "Đã nhận hàng", // Khách hàng xác nhận đã nhận hàng
        "Khiếu nại", // Khách hàng khiếu nại
        "Đang xử lý khiếu nại", // Admin đang xử lý khiếu nại
        "Khiếu nại được giải quyết", // Khiếu nại được chấp nhận
        "Khiếu nại bị từ chối", // Khiếu nại bị từ chối
        "Người mua huỷ", // Huỷ bởi người mua
        "Người bán huỷ", // Huỷ bởi người bán
      ],
      required: true,
      default: "Chờ xác nhận",
    },
    // Thông tin khiếu nại
    complaint: {
      reason: { type: String }, // Lý do khiếu nại
      description: { type: String }, // Mô tả chi tiết
      images: [{ type: String }], // Danh sách URL hình ảnh đính kèm
      createdAt: { type: Date }, // Thời gian tạo khiếu nại
      status: {
        type: String,
        enum: ["Chờ xử lý", "Đang xử lý", "Được chấp nhận", "Bị từ chối"],
        default: "Chờ xử lý",
      },
      adminNote: { type: String }, // Ghi chú của admin
      resolution: { type: String }, // Cách giải quyết
      processedAt: { type: Date }, // Thời gian xử lý
      processedBy: { type: Schema.Types.ObjectId, ref: "User" }, // Admin xử lý
    },
    // Lịch sử thay đổi trạng thái
    statusHistory: [
      {
        type: { type: String, enum: ["payment", "shipping"], required: true }, // Loại trạng thái
        from: { type: String, required: true }, // Trạng thái cũ
        to: { type: String, required: true }, // Trạng thái mới
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" }, // Người thực hiện thay đổi
        updatedAt: { type: Date, default: Date.now }, // Thời gian thay đổi
        note: { type: String }, // Ghi chú (nếu có)
        reason: { type: String }, // Lý do thay đổi
        isAutomatic: { type: Boolean, default: false }, // Thay đổi tự động hay thủ công
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

// Tự động cập nhật trường updatedAt mỗi khi save
OrderSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});
OrderSchema.plugin(mongoosePaginate);

export default mongoose.model("Order", OrderSchema);
