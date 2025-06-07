import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

// Schema chi tiết sản phẩm trong đơn hàng
export const OrderItemSchema = new Schema(
  {
    productVariantId: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
    },
    price: {
      type: Number,
      required: true,
    },
    size: {
      type: String,
      required: true,
    },
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
      name: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
      address: {
        type: String,
        required: true,
      },
    },
    items: [OrderItemSchema],
    totalAmount: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["COD", "MoMo", "zalopay"],
      required: true,
    },
    paymentUrl: {
      type: String,
    },
    // Lưu thông tin thanh toán cho đơn hàng MoMo
    paymentDetails: PaymentDetailsSchema,
    // Trạng thái đơn hàng kết hợp cho cả COD và MoMo
    // Lưu ý: Một số trạng thái chỉ áp dụng cho MoMo hoặc COD. Logic nghiệp vụ ở tầng controller/service sẽ xử lý sao cho phù hợp.
    status: {
      type: String,
      enum: [
        // COD:
        "Chờ xác nhận", // Mặc định với COD
        "Đã xác nhận", // Khi người bán xác nhận đơn hàng
        "Người bán huỷ", // Huỷ bởi người bán
        "Người mua huỷ", // Huỷ bởi người mua
        "Đang giao hàng", // Đang trong quá trình giao hàng
        "Giao hàng thành công", // Giao hàng thành công
        "Giao hàng thất bại", // Giao hàng thất bại
        // MoMo:
        "Chờ thanh toán", // Mặc định với MoMo
        "Đã thanh toán", // Sau khi MoMo xác nhận thanh toán
        "Huỷ do quá thời gian thanh toán", // Huỷ tự động nếu hết hạn thanh toán
        // Lưu ý: "Người mua huỷ", "Người bán huỷ", "Đang giao hàng", "Giao hàng thành công" và "Giao hàng thất bại" cũng được áp dụng cho MoMo
      ],
      required: true,
      default: function () {
        return this.paymentMethod === "MoMo"
          ? "Chờ thanh toán"
          : "Chờ xác nhận";
      },
    },
  },
  { timestamps: true, versionKey: false }
);

// Tự động cập nhật trường updatedAt mỗi khi save
OrderSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});
OrderSchema.plugin(mongoosePaginate);

const Order = mongoose.model("Order", OrderSchema);
export default Order;
