import Order from "../models/order.js";
import ProductVariantSnapshot from "../models/productVariantSnapshot.js";
import Voucher from "../models/vocher.js";
import Review from "../models/review.js";
import ProductVariant from "../models/productVariant.js";
import { getShippingFeeOrder } from "./shippingApi.js";
import mongoose from "mongoose";
import { sendOrderEmail } from "../utils/sendOrderEmail.js";
import { sendTelegramMessage } from "../utils/sendTelegram.js";
import {
  processAutoRefund,
  refundMoMo,
  refundZaloPay,
  checkMoMoRefundStatus,
  checkZaloPayRefundStatus,
} from "../utils/refundAPI.js";
import axios from "axios";

// Xử lý hoàn tiền cho đơn hàng bị hủy
const processRefundForCancelledOrder = async (order, userId) => {
  try {
    // Kiểm tra trạng thái thanh toán thực tế từ API MoMo/ZaloPay
    let actualPaymentStatus = order.paymentStatus;
    let isPaymentConfirmed = false;

    if (order.paymentMethod === "MoMo") {
      try {
        // Gọi API kiểm tra trạng thái MoMo thực tế như trong cronjob
        const response = await axios.post(
          `${
            process.env.URL_CRONJOB || "http://localhost:5175"
          }/api/orders/momo/transaction`,
          {
            orderId: order.orderId,
          }
        );

        console.log(
          `🔍 MoMo payment check for ${order.orderId}:`,
          response.data
        );

        if (response.data?.resultCode === 0) {
          actualPaymentStatus = "Đã thanh toán";
          isPaymentConfirmed = true;
          console.log(`✅ MoMo payment confirmed via API for ${order.orderId}`);
        } else {
          console.log(
            `❌ MoMo payment not confirmed, resultCode: ${response.data?.resultCode}`
          );
        }
      } catch (error) {
        console.log(
          `⚠️ Không thể kiểm tra trạng thái MoMo cho ${order.orderId}:`,
          error.message
        );
      }
    } else if (order.paymentMethod === "zalopay") {
      try {
        // Gọi API kiểm tra trạng thái ZaloPay thực tế như trong cronjob
        const response = await axios.post(
          `${
            process.env.URL_CRONJOB || "http://localhost:5175"
          }/api/orders/zalopay/transaction`,
          {
            app_trans_id: order.orderId,
          }
        );

        console.log(
          `🔍 ZaloPay payment check for ${order.orderId}:`,
          response.data
        );

        if (response.data?.return_code === 1) {
          actualPaymentStatus = "Đã thanh toán";
          isPaymentConfirmed = true;
          console.log(
            `✅ ZaloPay payment confirmed via API for ${order.orderId}`
          );
        } else {
          console.log(
            `❌ ZaloPay payment not confirmed, return_code: ${response.data?.return_code}`
          );
        }
      } catch (error) {
        console.log(
          `⚠️ Không thể kiểm tra trạng thái ZaloPay cho ${order.orderId}:`,
          error.message
        );
      }
    }

    // Chỉ hoàn tiền cho đơn hàng đã thanh toán (thực tế)
    if (!isPaymentConfirmed && actualPaymentStatus !== "Đã thanh toán") {
      return {
        requiresRefund: false,
        message: `Đơn hàng chưa thanh toán thực tế qua API ${order.paymentMethod} (DB Status: ${order.paymentStatus}), không cần hoàn tiền`,
        status: "no_refund_needed",
      };
    }

    console.log(
      `✅ Xác nhận đơn hàng ${order.orderId} đã thanh toán qua API ${order.paymentMethod}, tiến hành hoàn tiền...`
    );

    const refundInfo = {
      requiresRefund: true,
      amount: order.finalAmount,
      paymentMethod: order.paymentMethod,
      refundRequestedAt: new Date(),
      refundRequestedBy: userId, // Sử dụng userId thay vì string
      orderId: order.orderId,
    };

    switch (order.paymentMethod) {
      case "MoMo":
        try {
          // Gọi trực tiếp API hoàn tiền MoMo
          const momoRefundResult = await refundMoMo({
            orderId: order.orderId,
            amount: order.finalAmount,
            description: `Hoàn tiền đơn hàng ${order.orderId}`,
          });

          if (momoRefundResult.success) {
            // Hoàn tiền thành công
            order.paymentDetails = {
              ...order.paymentDetails,
              refundRequested: true,
              refundRequestedAt: new Date(),
              refundRequestedBy: userId,
              refundStatus: "completed",
              refundAmount: order.finalAmount,
              refundTransactionId: momoRefundResult.refundId,
              refundProcessedAt: new Date(),
              refundNote: "Hoàn tiền tự động qua MoMo API",
            };

            return {
              ...refundInfo,
              message: "Hoàn tiền MoMo thành công qua API",
              status: "momo_refund_completed",
              autoRefund: true,
              refundId: momoRefundResult.refundId,
            };
          } else {
            // Hoàn tiền thất bại, chuyển sang xử lý thủ công
            order.paymentDetails = {
              ...order.paymentDetails,
              refundRequested: true,
              refundRequestedAt: new Date(),
              refundRequestedBy: userId,
              refundStatus: "pending",
              refundAmount: order.finalAmount,
              refundNote: `API hoàn tiền MoMo thất bại: ${momoRefundResult.error}`,
            };

            return {
              ...refundInfo,
              message: "API hoàn tiền MoMo thất bại. Admin sẽ xử lý thủ công.",
              status: "momo_refund_failed_manual_required",
              autoRefund: false,
              error: momoRefundResult.error,
            };
          }
        } catch (error) {
          // Lỗi khi gọi API
          order.paymentDetails = {
            ...order.paymentDetails,
            refundRequested: true,
            refundRequestedAt: new Date(),
            refundRequestedBy: userId,
            refundStatus: "failed",
            refundAmount: order.finalAmount,
            refundNote: `Lỗi khi gọi API MoMo: ${error.message}`,
          };

          return {
            ...refundInfo,
            message: "Lỗi khi gọi API MoMo hoàn tiền",
            status: "momo_refund_error",
            autoRefund: false,
            error: error.message,
          };
        }

      case "zalopay":
        try {
          // Gọi trực tiếp API hoàn tiền ZaloPay
          const zalopayRefundResult = await refundZaloPay({
            orderId: order.orderId,
            amount: order.finalAmount,
            description: `Hoàn tiền đơn hàng ${order.orderId}`,
          });

          if (zalopayRefundResult.success) {
            // Hoàn tiền thành công
            order.paymentDetails = {
              ...order.paymentDetails,
              refundRequested: true,
              refundRequestedAt: new Date(),
              refundRequestedBy: userId,
              refundStatus: "completed",
              refundAmount: order.finalAmount,
              refundTransactionId: zalopayRefundResult.refundId,
              refundProcessedAt: new Date(),
              refundNote: "Hoàn tiền tự động qua ZaloPay API",
            };

            return {
              ...refundInfo,
              message: "Hoàn tiền ZaloPay thành công qua API",
              status: "zalopay_refund_completed",
              autoRefund: true,
              refundId: zalopayRefundResult.refundId,
            };
          } else {
            // Hoàn tiền thất bại, chuyển sang xử lý thủ công
            order.paymentDetails = {
              ...order.paymentDetails,
              refundRequested: true,
              refundRequestedAt: new Date(),
              refundRequestedBy: userId,
              refundStatus: "pending",
              refundAmount: order.finalAmount,
              refundNote: `API hoàn tiền ZaloPay thất bại: ${zalopayRefundResult.error}`,
            };

            return {
              ...refundInfo,
              message:
                "API hoàn tiền ZaloPay thất bại. Admin sẽ xử lý thủ công.",
              status: "zalopay_refund_failed_manual_required",
              autoRefund: false,
              error: zalopayRefundResult.error,
            };
          }
        } catch (error) {
          // Lỗi khi gọi API
          order.paymentDetails = {
            ...order.paymentDetails,
            refundRequested: true,
            refundRequestedAt: new Date(),
            refundRequestedBy: userId,
            refundStatus: "failed",
            refundAmount: order.finalAmount,
            refundNote: `Lỗi khi gọi API ZaloPay: ${error.message}`,
          };

          return {
            ...refundInfo,
            message: "Lỗi khi gọi API ZaloPay hoàn tiền",
            status: "zalopay_refund_error",
            autoRefund: false,
            error: error.message,
          };
        }

      case "COD":
        // COD đã thanh toán có nghĩa là đã giao hàng thành công
        // Cần xử lý hoàn tiền thủ công
        order.paymentDetails = {
          ...order.paymentDetails,
          refundRequested: true,
          refundRequestedAt: new Date(),
          refundRequestedBy: userId,
          refundStatus: "pending",
          refundAmount: order.finalAmount,
          refundNote: "Đơn COD cần xử lý hoàn tiền thủ công",
        };

        return {
          ...refundInfo,
          message:
            "Đơn COD đã thanh toán cần xử lý hoàn tiền thủ công. Admin sẽ liên hệ trong 24h.",
          status: "cod_manual_refund_required",
          instructions:
            "Admin sẽ liên hệ để thỏa thuận phương thức hoàn tiền (chuyển khoản)",
        };

      default:
        return {
          ...refundInfo,
          message: "Phương thức thanh toán không xác định. Cần xử lý thủ công.",
          status: "manual_refund_required",
          instructions: "Liên hệ support để được hỗ trợ",
        };
    }
  } catch (error) {
    console.error("Error processing refund:", error);
    return {
      requiresRefund: true,
      message: "Có lỗi khi xử lý hoàn tiền. Admin sẽ xem xét thủ công.",
      status: "refund_error",
      error: error.message,
    };
  }
};

// Helper function để lưu lịch sử thay đổi trạng thái
const addStatusHistory = (
  order,
  type,
  fromStatus,
  toStatus,
  updatedBy = null,
  note = "",
  reason = "",
  isAutomatic = false
) => {
  if (!order.statusHistory) {
    order.statusHistory = [];
  }

  order.statusHistory.push({
    type,
    from: fromStatus,
    to: toStatus,
    updatedBy,
    updatedAt: new Date(),
    note,
    reason,
    isAutomatic,
  });
};
export const calculateShippingInfoFromCart = (items) => {
  const validItems = items.filter((item) => {
    return (
      item &&
      item.productVariantId &&
      item.price &&
      item.quantity &&
      !isNaN(Number(item.price))
    );
  });

  const insurance_value = validItems.reduce((sum, item) => {
    return sum + Number(item.price) * item.quantity;
  }, 0);

  const total_weight = validItems.reduce((sum, item) => {
    return sum + item.quantity * 300; // 300g mỗi sản phẩm (có thể chỉnh)
  }, 0);

  const total_height = validItems.reduce((sum, item) => {
    return sum + item.quantity * 4;
  }, 0);

  const total_length = 25;
  const total_width = 20;

  return {
    insurance_value,
    total_weight,
    total_height,
    total_length,
    total_width,
  };
};

export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      orderId,
      receiver,
      items,
      totalPrice,
      paymentMethod,
      voucherCode,
      orderInfo = "",
      extraData = "",
      orderGroupId = "",
      paymentUrl = "",
      momoTransactionId = "", // Thêm để lưu transaction ID từ MoMo
    } = req.body;

    const user = {
      _id: req.user.id,
      email: req.user.email,
    };

    // Validate cơ bản
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Giỏ hàng trống" });
    }

    if (
      !receiver ||
      !receiver.cityName ||
      !receiver.districtName ||
      !receiver.wardName
    ) {
      return res.status(400).json({ message: "Thiếu thông tin người nhận" });
    }

    // Tính toán thông tin vận chuyển
    const {
      insurance_value,
      total_weight,
      total_height,
      total_length,
      total_width,
    } = calculateShippingInfoFromCart(items);

    const shippingFee = await getShippingFeeOrder(
      receiver,
      insurance_value,
      total_weight,
      total_height,
      total_length,
      total_width
    );

    // Xử lý voucher
    let appliedVoucher = null;
    let discountAmount = 0;

    if (voucherCode) {
      const voucher = await Voucher.findOne({ code: voucherCode });

      if (!voucher) {
        return res.status(400).json({ message: "Mã giảm giá không hợp lệ" });
      }
      if (!voucher.isActive) {
        return res
          .status(400)
          .json({ message: "Mã giảm giá đã bị vô hiệu hóa" });
      }
      if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Mã giảm giá đã hết hạn" });
      }
      if (voucher.quantity <= 0) {
        return res
          .status(400)
          .json({ message: "Mã giảm giá đã hết lượt sử dụng" });
      }
      if (voucher.usedBy.includes(req.user.id)) {
        return res.status(400).json({ message: "Bạn đã sử dụng mã này rồi" });
      }
      if (totalPrice < (voucher.minOrderValue || 0)) {
        return res
          .status(400)
          .json({ message: "Không đủ điều kiện áp dụng mã giảm giá" });
      }

      appliedVoucher = voucher;

      if (voucher.type === "percent") {
        discountAmount = (totalPrice * voucher.value) / 100;
        if (voucher.maxDiscount) {
          discountAmount = Math.min(discountAmount, voucher.maxDiscount);
        }
      } else if (voucher.type === "fixed") {
        discountAmount = voucher.value;
      }
    }

    const finalAmount = totalPrice + shippingFee - discountAmount;

    if (finalAmount < 0) {
      return res.status(400).json({ message: "Tổng tiền không hợp lệ" });
    }

    // 1. Kiểm tra tồn kho và lấy version cho từng sản phẩm
    const validatedItems = [];
    for (const item of items) {
      const variant = await ProductVariant.findById(item.productVariantId);
      if (!variant) {
        return res.status(400).json({
          message: `Không tìm thấy sản phẩm với id ${item.productVariantId}`,
        });
      }

      const sizeEntry = variant.sizes.find((s) => s.size === item.size);
      if (!sizeEntry) {
        return res.status(400).json({
          message: `Không tìm thấy size ${item.size} cho sản phẩm ${variant._id}`,
        });
      }

      if (sizeEntry.stock < item.quantity) {
        return res.status(400).json({
          message: `Sản phẩm "${item.productName || variant.name}" - Size ${
            item.size
          } không đủ số lượng. Hiện còn ${sizeEntry.stock}`,
        });
      }

      // Thêm version vào item
      validatedItems.push({
        ...item,
        version: variant.version || 1, // Lưu version hiện tại của variant
      });
    }

    // Xác định trạng thái ban đầu dựa trên payment method
    const getInitialPaymentStatus = (paymentMethod) => {
      switch (paymentMethod) {
        case "MoMo":
        case "zalopay":
          return "Chờ thanh toán";
        case "COD":
        default:
          return "Thanh toán khi nhận hàng";
      }
    };
    const getInitialShippingStatus = () => "Chờ xác nhận";

    // Tạo payment details cho MoMo nếu cần
    let paymentDetails = null;
    if (paymentMethod === "MoMo" && momoTransactionId) {
      paymentDetails = {
        momoTransactionId,
        refundRequested: false,
        refundProcessed: false,
      };
    }

    const orderData = {
      orderId,
      user,
      receiver,
      items: validatedItems,
      totalPrice,
      shippingFee,
      discountAmount,
      finalAmount,
      paymentMethod,
      paymentUrl,
      paymentDetails,
      voucher: appliedVoucher
        ? {
            code: appliedVoucher.code,
            value: appliedVoucher.value,
            type: appliedVoucher.type,
            maxDiscount: appliedVoucher.maxDiscount,
          }
        : null,
      paymentStatus: getInitialPaymentStatus(paymentMethod),
      shippingStatus: getInitialShippingStatus(),
      statusHistory: [
        {
          type: "payment",
          from: "Khởi tạo",
          to: getInitialPaymentStatus(paymentMethod),
          updatedBy: req.user.id,
          updatedAt: new Date(),
          note: "Tạo đơn hàng mới",
          reason: "Khách hàng đặt hàng",
          isAutomatic: false,
        },
        {
          type: "shipping",
          from: "Khởi tạo",
          to: getInitialShippingStatus(),
          updatedBy: req.user.id,
          updatedAt: new Date(),
          note: "Tạo đơn hàng mới",
          reason: "Khách hàng đặt hàng",
          isAutomatic: false,
        },
      ],
    };

    const order = new Order(orderData);
    await order.save({ session });

    // 2. Trừ stock cho từng sản phẩm/size
    for (const item of validatedItems) {
      const updated = await ProductVariant.updateOne(
        {
          _id: item.productVariantId,
          "sizes.size": item.size,
        },
        {
          $inc: { "sizes.$.stock": -item.quantity },
        },
        { session }
      );

      if (!updated.modifiedCount) {
        throw new Error(
          `Không thể trừ stock cho sản phẩm ${item.productVariantId}, size ${item.size}`
        );
      }
    }

    // 3. Cập nhật voucher nếu có
    if (appliedVoucher) {
      appliedVoucher.usedBy.push(req.user.id);
      appliedVoucher.quantity -= 1;
      await appliedVoucher.save({ session });
    }

    // 4. Commit transaction
    await session.commitTransaction();

    // // 5. Gửi email xác nhận đơn hàng
    // const trackingUrl = `${
    //   process.env.FRONTEND_URL || "http://localhost:5173"
    // }/order-details/${order._id}`;
    // try {
    //   await sendOrderEmail({
    //     to: user.email,
    //     order,
    //     trackingUrl,
    //   });
    // } catch (err) {
    //   console.error("Gửi email thất bại:", err);
    // }

    // 6. Gửi thông báo Telegram cho admin
    // try {
    //   await sendTelegramMessage(
    //     `🛒 Đơn hàng mới!\n` +
    //       `📋 Mã đơn: ${orderId}\n` +
    //       `💰 Tổng tiền: ${finalAmount.toLocaleString("vi-VN")}đ\n` +
    //       `💳 Thanh toán: ${paymentMethod}\n` +
    //       `📧 Khách hàng: ${user.email}`
    //   );
    // } catch (err) {
    //   console.error("Gửi Telegram thất bại:", err);
    // }

    return res.status(201).json({
      message: "Tạo đơn hàng thành công",
      order,
      success: true,
    });
  } catch (error) {
    console.error("Error in createOrder:", error);

    // Rollback transaction nếu có lỗi
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    return res.status(500).json({
      message: "Lỗi khi tạo đơn hàng",
      error: error.message,
      success: false,
    });
  } finally {
    // Đảm bảo luôn đóng session
    if (session) {
      session.endSession();
    }
  }
};
export const confirmReceivedOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      orderId,
      "user._id": req.user.id,
      shippingStatus: "Giao hàng thành công",
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hoặc trạng thái không hợp lệ",
      });
    }

    const statusChanges = [];
    const updateData = {
      shippingStatus: "Đã nhận hàng",
    };

    // Thêm lịch sử thay đổi shipping status
    statusChanges.push({
      type: "shipping",
      from: "Giao hàng thành công",
      to: "Đã nhận hàng",
      updatedBy: req.user.id,
      updatedAt: new Date(),
      note: "Khách hàng xác nhận đã nhận hàng",
      reason: "Khách hàng xác nhận nhận hàng",
      isAutomatic: false,
    });

    // Nếu COD thì cũng cập nhật payment status
    if (
      order.paymentMethod === "COD" &&
      order.paymentStatus === "Thanh toán khi nhận hàng"
    ) {
      updateData.paymentStatus = "Đã thanh toán";
      statusChanges.push({
        type: "payment",
        from: "Thanh toán khi nhận hàng",
        to: "Đã thanh toán",
        updatedBy: req.user.id,
        updatedAt: new Date(),
        note: "Xác nhận thanh toán COD khi nhận hàng",
        reason: "Khách hàng xác nhận nhận hàng - Thanh toán COD",
        isAutomatic: false,
      });
    }

    await Order.updateOne(
      { _id: order._id },
      {
        $set: updateData,
        $push: { statusHistory: { $each: statusChanges } },
      }
    );

    res.json({ success: true, message: "Xác nhận nhận hàng thành công" });
  } catch (error) {
    console.error("❌ Error in confirmReceivedOrder:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};
// Lấy danh sách đơn hàng có trạng thái thanh toán là 'Chờ thanh toán'
export const getPendingPaymentOrders = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: "Bạn chưa đăng nhập",
        success: false,
      });
    }
    const orders = await Order.find({
      paymentStatus: "Chờ thanh toán",
      "user._id": req.user.id,
    })
      .populate({ path: "items.productVariantId", model: "ProductVariant" })
      .lean();
    return res.status(200).json({
      data: orders,
      total: orders.length,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi khi lấy danh sách đơn hàng chờ thanh toán",
      error: error.message,
      success: false,
    });
  }
};
export const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId, cancelBy, reason } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    const statusChanges = [];
    let newPaymentStatus, newShippingStatus;

    // Kiểm tra quyền và điều kiện hủy đơn hàng
    if (cancelBy === "buyer") {
      if (order.user._id.toString() !== req.user.id.toString()) {
        return res
          .status(403)
          .json({ message: "Bạn không có quyền hủy đơn này" });
      }

      // User chỉ được hủy khi chưa bắt đầu giao hàng
      const allowedShippingStatuses = ["Chờ xác nhận", "Đã xác nhận"];
      if (!allowedShippingStatuses.includes(order.shippingStatus)) {
        return res.status(400).json({
          message: "Không thể hủy đơn hàng khi đã bắt đầu giao hàng",
        });
      }

      newPaymentStatus = "Người mua huỷ";
      newShippingStatus = "Người mua huỷ";

      // Thêm lịch sử thay đổi
      statusChanges.push(
        {
          type: "payment",
          from: order.paymentStatus,
          to: newPaymentStatus,
          updatedBy: req.user.id,
          updatedAt: new Date(),
          note: "Người mua hủy đơn hàng",
          reason: reason || "Người mua hủy đơn hàng",
          isAutomatic: false,
        },
        {
          type: "shipping",
          from: order.shippingStatus,
          to: newShippingStatus,
          updatedBy: req.user.id,
          updatedAt: new Date(),
          note: "Người mua hủy đơn hàng",
          reason: reason || "Người mua hủy đơn hàng",
          isAutomatic: false,
        }
      );
    } else if (cancelBy === "seller" || cancelBy === "admin") {
      // Admin/Seller có thể hủy trước khi giao hàng thành công
      const allowedShippingStatuses = [
        "Chờ xác nhận",
        "Đã xác nhận",
        "Đang giao hàng",
        "Giao hàng thất bại",
      ];

      if (!allowedShippingStatuses.includes(order.shippingStatus)) {
        return res.status(400).json({
          message:
            "Không thể hủy đơn hàng ở trạng thái này. Chỉ có thể hủy trước khi giao hàng thành công.",
        });
      }

      newPaymentStatus = "Người bán huỷ";
      newShippingStatus = "Người bán huỷ";

      // Thêm lịch sử thay đổi
      statusChanges.push(
        {
          type: "payment",
          from: order.paymentStatus,
          to: newPaymentStatus,
          updatedBy: req.user?.id || null,
          updatedAt: new Date(),
          note: `${cancelBy === "admin" ? "Admin" : "Người bán"} hủy đơn hàng`,
          reason:
            reason ||
            `${cancelBy === "admin" ? "Admin" : "Người bán"} hủy đơn hàng`,
          isAutomatic: false,
        },
        {
          type: "shipping",
          from: order.shippingStatus,
          to: newShippingStatus,
          updatedBy: req.user?.id || null,
          updatedAt: new Date(),
          note: `${cancelBy === "admin" ? "Admin" : "Người bán"} hủy đơn hàng`,
          reason:
            reason ||
            `${cancelBy === "admin" ? "Admin" : "Người bán"} hủy đơn hàng`,
          isAutomatic: false,
        }
      );
    } else {
      return res.status(400).json({
        message:
          "Giá trị cancelBy không hợp lệ. Chỉ chấp nhận 'seller', 'admin' hoặc 'buyer'",
      });
    }

    // Cập nhật trạng thái đơn hàng
    order.paymentStatus = newPaymentStatus;
    order.shippingStatus = newShippingStatus;

    // Cộng lại số lượng tồn kho cho từng sản phẩm/biến thể trong đơn hàng
    for (const item of order.items) {
      await ProductVariant.updateOne(
        { _id: item.productVariantId, "sizes.size": item.size },
        { $inc: { "sizes.$.stock": item.quantity } },
        { session }
      );
    }

    // Xử lý hoàn tiền cho các đơn hàng đã thanh toán
    // Truyền user ID thay vì string cancelBy cho refundRequestedBy
    const userId = cancelBy === "buyer" ? req.user.id : null; // null cho admin/system
    const refundInfo = await processRefundForCancelledOrder(order, userId);

    // Thêm lịch sử trạng thái
    if (!order.statusHistory) {
      order.statusHistory = [];
    }
    order.statusHistory.push(...statusChanges);

    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Gửi thông báo hoàn tiền nếu cần
    if (refundInfo.requiresRefund) {
      try {
        await sendTelegramMessage(
          `💸 Yêu cầu hoàn tiền!\n` +
            `📋 Mã đơn: ${order.orderId}\n` +
            `💰 Số tiền: ${order.finalAmount.toLocaleString("vi-VN")}đ\n` +
            `💳 Phương thức: ${order.paymentMethod}\n` +
            `👤 Hủy bởi: ${
              cancelBy === "buyer" ? "Khách hàng" : "Admin/Người bán"
            }\n` +
            `📧 Email: ${order.user.email}\n` +
            `🔄 Trạng thái: ${refundInfo.message}`
        );
      } catch (err) {
        console.error("Gửi thông báo Telegram thất bại:", err);
      }
    }

    return res.status(200).json({
      message: "Huỷ đơn hàng thành công",
      order,
      refundInfo,
    });
  } catch (error) {
    console.error("Error in cancelOrder:", error);

    // Rollback transaction nếu có lỗi
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    return res.status(500).json({
      message: "Lỗi khi huỷ đơn hàng",
      error: error.message,
    });
  }
};
export const getAllOrders = async (req, res) => {
  try {
    const {
      _page = 1,
      _limit = 10,
      _sort = "createdAt",
      _order = "desc",
      _orderId,
      _user,
      _phone,
      _email,
      _address,
      _status,
    } = req.query;

    // Tạo query tìm kiếm
    const query = {};
    if (_orderId) query.orderId = { $regex: _orderId, $options: "i" };
    if (_user) query["receiver.name"] = { $regex: _user, $options: "i" };
    if (_phone) query["receiver.phone"] = { $regex: _phone, $options: "i" };
    if (_email) query["user.email"] = { $regex: _email, $options: "i" };
    if (_address) query["user.address"] = { $regex: _address, $options: "i" };
    if (_status && _status !== "Tất cả") {
      // Tìm theo paymentStatus hoặc shippingStatus
      query.$or = [{ paymentStatus: _status }, { shippingStatus: _status }];
    }

    const options = {
      page: parseInt(_page),
      limit: parseInt(_limit),
      sort: { [_sort]: _order === "desc" ? -1 : 1 },
      populate: {
        path: "items.productVariantId",
        model: "ProductVariant",
      },
    };

    const result = await Order.paginate(query, options);

    if (!result.docs || result.docs.length === 0) {
      return res.status(200).json({ message: "Không có đơn hàng nào" });
    }

    return res.status(200).json({
      data: result.docs,
      totalPages: result.totalPages,
      currentPage: result.page,
      total: result.totalDocs,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getOrders = async (req, res) => {
  try {
    const { _page = 1, _limit = 10, status, _userId } = req.query;

    const options = {
      page: parseInt(_page),
      limit: parseInt(_limit),
      populate: {
        path: "items.productVariantId",
        model: "ProductVariant",
      },
      sort: { createdAt: -1 },
    };

    const query = {};
    if (_userId) {
      query["user._id"] = _userId;
    }
    if (status && status !== "Tất cả") {
      query.$or = [{ paymentStatus: status }, { shippingStatus: status }];
    }
    const result = await Order.paginate(query, options);

    if (!result.docs || result.docs.length === 0) {
      return res.status(200).json({ message: "Không có đơn hàng nào" });
    }

    return res.status(200).json({
      data: result.docs,
      totalPages: result.totalPages,
      currentPage: result.page,
      total: result.totalDocs,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(200).json({ message: "Đơn hàng không tồn tại" });
    }
    // Lấy danh sách review của user trong đơn hàng này
    const reviews = await Review.find({
      orderId: order._id,
      userId: req.user.id,
    });

    // Trả về thông tin sản phẩm từ snapshot cho từng item (chỉ dùng snapshot, không populate Product)
    const itemsWithSnapshot = await Promise.all(
      order.items.map(async (item) => {
        // Lấy snapshot theo variantId và version
        const snapshot = await ProductVariantSnapshot.findOne({
          variantId: item.productVariantId,
          version: item.version,
        });
        const review = reviews.find(
          (r) =>
            r.productVariantId.toString() === item.productVariantId.toString()
        );
        return {
          ...item.toObject(),
          productInfo: snapshot ? snapshot.toObject() : null,
          reviewData: review || null,
        };
      })
    );

    const result = {
      ...order.toObject(),
      items: itemsWithSnapshot,
    };
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};
// Chuyển đổi trạng thái cho paymentStatus và shippingStatus
const allowedPaymentStatusTransitions = {
  "Chờ thanh toán": [
    "Đã thanh toán",
    "Huỷ do quá thời gian thanh toán",
    "Giao dịch bị từ chối do nhà phát hành",
    "Người mua huỷ",
    "Người bán huỷ",
  ],
  "Đã thanh toán": ["Người mua huỷ", "Người bán huỷ"],
  "Thanh toán khi nhận hàng": [
    "Đã thanh toán", // Khi giao hàng thành công hoặc xác nhận nhận hàng
    "Người mua huỷ",
    "Người bán huỷ",
  ],
  "Huỷ do quá thời gian thanh toán": [],
  "Giao dịch bị từ chối do nhà phát hành": [],
  "Người mua huỷ": [],
  "Người bán huỷ": [],
};
// Trạng thái cho phép admin chuyển đổi (không bao gồm khiếu nại, đã nhận hàng và các trạng thái hủy)
const allowedAdminShippingStatusTransitions = {
  "Chờ xác nhận": ["Đã xác nhận"], // Loại bỏ option hủy - chỉ hủy qua nút riêng/API riêng
  "Đã xác nhận": ["Đang giao hàng"], // Loại bỏ option hủy - chỉ hủy qua nút riêng/API riêng
  "Đang giao hàng": ["Giao hàng thành công", "Giao hàng thất bại"], // Loại bỏ option hủy - chỉ hủy qua nút riêng/API riêng
  "Giao hàng thành công": [], // Admin không thể chuyển sang "Đã nhận hàng"
  "Đã nhận hàng": [],
  "Giao hàng thất bại": [], // Không cho phép hủy từ trạng thái này - chỉ hủy qua nút riêng/API riêng
  "Khiếu nại": ["Đang xử lý khiếu nại"], // Chỉ khi user đã khiếu nại
  "Đang xử lý khiếu nại": ["Khiếu nại được giải quyết", "Khiếu nại bị từ chối"],
  "Khiếu nại được giải quyết": [],
  "Khiếu nại bị từ chối": [],
  "Người mua huỷ": [], // Trạng thái cuối - đã hủy
  "Người bán huỷ": [], // Trạng thái cuối - đã hủy
};

// Trạng thái cho phép user/system chuyển đổi (bao gồm khiếu nại và đã nhận hàng)
const allowedShippingStatusTransitions = {
  "Chờ xác nhận": ["Đã xác nhận", "Người mua huỷ", "Người bán huỷ"],
  "Đã xác nhận": ["Đang giao hàng", "Người bán huỷ", "Người mua huỷ"],
  "Đang giao hàng": [
    "Giao hàng thành công",
    "Giao hàng thất bại",
    "Khiếu nại", // Người dùng có thể khiếu nại khi đang giao hàng
    "Người bán huỷ",
    "Người mua huỷ",
  ],
  "Giao hàng thành công": ["Đã nhận hàng", "Khiếu nại"], // User có thể confirm nhận hàng hoặc khiếu nại
  "Đã nhận hàng": [],
  "Giao hàng thất bại": ["Người bán huỷ", "Người mua huỷ", "Khiếu nại"],
  "Khiếu nại": ["Đang xử lý khiếu nại"],
  "Đang xử lý khiếu nại": ["Khiếu nại được giải quyết", "Khiếu nại bị từ chối"],
  "Khiếu nại được giải quyết": [],
  "Khiếu nại bị từ chối": [],
  "Người mua huỷ": [],
  "Người bán huỷ": [],
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, shippingStatus, receiver, note, reason } =
      req.body;

    if (!status && !paymentStatus && !shippingStatus && !receiver) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp thông tin cần cập nhật" });
    }

    // 1. Tìm đơn hàng hiện tại
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Đơn hàng không tồn tại" });
    }

    // 2. Kiểm tra trạng thái được phép chuyển đổi
    const updateData = {};
    const statusChanges = []; // Mảng lưu các thay đổi trạng thái

    // Xử lý paymentStatus riêng biệt
    if (paymentStatus) {
      if (
        allowedPaymentStatusTransitions[order.paymentStatus]?.includes(
          paymentStatus
        )
      ) {
        updateData.paymentStatus = paymentStatus;
        // Lưu lịch sử thay đổi payment status
        statusChanges.push({
          type: "payment",
          from: order.paymentStatus,
          to: paymentStatus,
          updatedBy: req.user?.id || null,
          updatedAt: new Date(),
          note: note || "",
          reason: reason || "",
          isAutomatic: false,
        });
      } else {
        return res.status(400).json({
          message: `Không thể chuyển trạng thái thanh toán từ "${order.paymentStatus}" sang "${paymentStatus}".`,
        });
      }
    }

    // Xử lý shippingStatus riêng biệt - sử dụng admin transitions cho admin request
    if (shippingStatus) {
      // Kiểm tra xem có phải admin đang update không (có thể check qua role hoặc route)
      const isAdminUpdate =
        req.path.includes("/admin/") || req.user?.role === "admin";
      const allowedTransitions = isAdminUpdate
        ? allowedAdminShippingStatusTransitions
        : allowedShippingStatusTransitions;

      if (allowedTransitions[order.shippingStatus]?.includes(shippingStatus)) {
        updateData.shippingStatus = shippingStatus;

        // Xử lý đặc biệt cho COD khi giao hàng thành công
        if (
          shippingStatus === "Giao hàng thành công" &&
          order.paymentMethod === "COD" &&
          order.paymentStatus === "Thanh toán khi nhận hàng"
        ) {
          updateData.paymentStatus = "Đã thanh toán";
          // Thêm lịch sử cho cả shipping và payment
          statusChanges.push({
            type: "payment",
            from: order.paymentStatus,
            to: "Đã thanh toán",
            updatedBy: req.user?.id || null,
            updatedAt: new Date(),
            note: "Tự động cập nhật khi giao hàng thành công (COD)",
            reason: "Giao hàng thành công - Thanh toán COD",
            isAutomatic: true,
          });
        }

        // Lưu lịch sử thay đổi shipping status
        statusChanges.push({
          type: "shipping",
          from: order.shippingStatus,
          to: shippingStatus,
          updatedBy: req.user?.id || null,
          updatedAt: new Date(),
          note: note || "",
          reason: reason || "",
          isAutomatic: false,
        });
      } else {
        return res.status(400).json({
          message: `Không thể chuyển trạng thái giao hàng từ "${order.shippingStatus}" sang "${shippingStatus}".`,
        });
      }
    }

    // Xử lý status cũ (để tương thích ngược)
    if (status) {
      // Kiểm tra xem có phải admin đang update không
      const isAdminUpdate =
        req.path.includes("/admin/") || req.user?.role === "admin";
      const allowedTransitions = isAdminUpdate
        ? allowedAdminShippingStatusTransitions
        : allowedShippingStatusTransitions;

      // Nếu trạng thái là trạng thái thanh toán
      if (
        allowedPaymentStatusTransitions[order.paymentStatus]?.includes(status)
      ) {
        updateData.paymentStatus = status;
        statusChanges.push({
          type: "payment",
          from: order.paymentStatus,
          to: status,
          updatedBy: req.user?.id || null,
          updatedAt: new Date(),
          note: note || "",
          reason: reason || "",
          isAutomatic: false,
        });
      } else if (allowedTransitions[order.shippingStatus]?.includes(status)) {
        updateData.shippingStatus = status;

        // Xử lý đặc biệt cho COD khi giao hàng thành công
        if (
          status === "Giao hàng thành công" &&
          order.paymentMethod === "COD" &&
          order.paymentStatus === "Thanh toán khi nhận hàng"
        ) {
          updateData.paymentStatus = "Đã thanh toán";
          statusChanges.push({
            type: "payment",
            from: order.paymentStatus,
            to: "Đã thanh toán",
            updatedBy: req.user?.id || null,
            updatedAt: new Date(),
            note: "Tự động cập nhật khi giao hàng thành công (COD)",
            reason: "Giao hàng thành công - Thanh toán COD",
            isAutomatic: true,
          });
        }

        statusChanges.push({
          type: "shipping",
          from: order.shippingStatus,
          to: status,
          updatedBy: req.user?.id || null,
          updatedAt: new Date(),
          note: note || "",
          reason: reason || "",
          isAutomatic: false,
        });
      } else {
        return res.status(400).json({
          message: `Không thể chuyển trạng thái từ "${order.paymentStatus}" hoặc "${order.shippingStatus}" sang "${status}".`,
        });
      }
    }

    // Chỉ cập nhật receiver
    if (receiver && typeof receiver === "object") {
      if (receiver.name) updateData["receiver.name"] = receiver.name;
      if (receiver.phone) updateData["receiver.phone"] = receiver.phone;
      if (receiver.address) updateData["receiver.address"] = receiver.address;
      if (receiver.wardName)
        updateData["receiver.wardName"] = receiver.wardName;
      if (receiver.districtName)
        updateData["receiver.districtName"] = receiver.districtName;
      if (receiver.cityName)
        updateData["receiver.cityName"] = receiver.cityName;
    }

    // Xử lý cộng lại stock và hoàn tiền khi hủy đơn hàng
    const isOrderBeingCancelled =
      (updateData.paymentStatus && updateData.paymentStatus.includes("huỷ")) ||
      (updateData.shippingStatus && updateData.shippingStatus.includes("huỷ"));

    let refundInfo = null;
    if (isOrderBeingCancelled) {
      try {
        // 1. Cộng lại số lượng tồn kho cho từng sản phẩm/biến thể trong đơn hàng
        const session = await mongoose.startSession();
        session.startTransaction();

        for (const item of order.items) {
          await ProductVariant.updateOne(
            { _id: item.productVariantId, "sizes.size": item.size },
            { $inc: { "sizes.$.stock": item.quantity } },
            { session }
          );
        }

        await session.commitTransaction();
        session.endSession();
        console.log(`📦 Restored stock for cancelled order ${order.orderId}`);

        // 2. Xử lý hoàn tiền
        // Truyền user ID của admin thay vì string
        refundInfo = await processRefundForCancelledOrder(order, req.user.id);

        // Cập nhật payment details nếu có thông tin hoàn tiền
        if (refundInfo.requiresRefund && order.paymentDetails) {
          updateData.paymentDetails = order.paymentDetails;
        }

        // 3. Gửi thông báo hoàn tiền nếu cần
        if (refundInfo.requiresRefund) {
          try {
            // await sendTelegramMessage(
            //   `💸 Yêu cầu hoàn tiền (Admin)!\n` +
            //     `📋 Mã đơn: ${order.orderId}\n` +
            //     `💰 Số tiền: ${order.finalAmount.toLocaleString("vi-VN")}đ\n` +
            //     `💳 Phương thức: ${order.paymentMethod}\n` +
            //     `👤 Hủy bởi: ${req.user?.email || "Admin"}\n` +
            //     `📧 Khách hàng: ${order.user.email}\n` +
            //     `🔄 Trạng thái: ${refundInfo.message}`
            // );
            console.log("Thông báo qua tele");
          } catch (err) {
            console.error("Gửi thông báo Telegram thất bại:", err);
          }
        }
      } catch (stockError) {
        console.error("Error restoring stock for cancelled order:", stockError);
        // Không throw error để không block việc cập nhật status
      }
    }

    // Thêm lịch sử thay đổi vào updateData
    if (statusChanges.length > 0) {
      updateData.statusHistory = statusChanges;
    }

    // 4. Cập nhật đơn hàng
    let updatedOrder;
    if (statusChanges.length > 0) {
      // Nếu có thay đổi trạng thái, dùng $set và $push riêng biệt
      const { statusHistory, ...setData } = updateData;
      await Order.findByIdAndUpdate(id, {
        $set: setData,
        $push: { statusHistory: { $each: statusHistory } },
      });
      updatedOrder = await Order.findById(id).populate(
        "items.productVariantId"
      );
    } else {
      // Chỉ update thông tin khác
      updatedOrder = await Order.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      ).populate("items.productVariantId");
    }

    const response = {
      message: "Cập nhật đơn hàng thành công",
      data: updatedOrder,
    };

    // Thêm thông tin hoàn tiền vào response nếu có
    if (refundInfo) {
      response.refundInfo = refundInfo;
      if (refundInfo.requiresRefund) {
        response.message += ". " + refundInfo.message;
      }
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Lỗi cập nhật đơn hàng:", error);
    return res
      .status(500)
      .json({ message: "Có lỗi xảy ra, vui lòng thử lại sau" });
  }
};

// Tự động chuyển trạng thái "Giao hàng thành công" thành "Đã nhận hàng" sau 48h
export const autoConfirmDeliveredOrders = async () => {
  try {
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

    const ordersToConfirm = await Order.find({
      shippingStatus: "Giao hàng thành công",
      updatedAt: { $lte: fortyEightHoursAgo },
    });

    console.log(
      `🔍 Found ${ordersToConfirm.length} orders to auto-confirm delivery`
    );

    for (const order of ordersToConfirm) {
      const statusChanges = [];
      const updateData = {
        shippingStatus: "Đã nhận hàng",
      };

      // Thêm lịch sử thay đổi shipping status
      statusChanges.push({
        type: "shipping",
        from: "Giao hàng thành công",
        to: "Đã nhận hàng",
        updatedBy: null, // Tự động bởi hệ thống
        updatedAt: new Date(),
        note: "Tự động xác nhận sau 48h",
        reason: "Hệ thống tự động xác nhận nhận hàng sau 48h",
        isAutomatic: true,
      });

      // Nếu COD thì cũng cập nhật payment status
      if (
        order.paymentMethod === "COD" &&
        order.paymentStatus === "Thanh toán khi nhận hàng"
      ) {
        updateData.paymentStatus = "Đã thanh toán";
        statusChanges.push({
          type: "payment",
          from: "Thanh toán khi nhận hàng",
          to: "Đã thanh toán",
          updatedBy: null, // Tự động bởi hệ thống
          updatedAt: new Date(),
          note: "Tự động xác nhận thanh toán COD sau 48h",
          reason: "Hệ thống tự động xác nhận thanh toán COD sau 48h",
          isAutomatic: true,
        });
      }

      await Order.updateOne(
        { _id: order._id },
        {
          $set: updateData,
          $push: { statusHistory: { $each: statusChanges } },
        }
      );

      console.log(`✅ Auto-confirmed delivery for order ${order.orderId}`);
    }

    return {
      success: true,
      confirmedOrdersCount: ordersToConfirm.length,
    };
  } catch (error) {
    console.error("❌ Error in autoConfirmDeliveredOrders:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

// Khiếu nại đơn hàng khi chưa nhận được hàng
export const createComplaint = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, description } = req.body;

    // Validate input
    if (!reason || !description) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp lý do và mô tả khiếu nại",
      });
    }

    // Tìm đơn hàng và kiểm tra quyền
    const order = await Order.findOne({
      orderId,
      "user._id": req.user.id,
    });

    console.log("🔍 Debug createComplaint:");
    console.log("- orderId:", orderId);
    console.log("- userId:", req.user.id);
    console.log("- order found:", !!order);
    console.log("- order shippingStatus:", order?.shippingStatus);
    console.log("- order complaint exists:", !!order?.complaint);
    console.log("- order complaint details:", order?.complaint);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng hoặc bạn không có quyền truy cập",
      });
    }

    // Kiểm tra trạng thái có thể khiếu nại
    const allowedComplaintStatuses = [
      "Đang giao hàng",
      "Giao hàng thành công",
      "Giao hàng thất bại",
    ];

    if (!allowedComplaintStatuses.includes(order.shippingStatus)) {
      return res.status(400).json({
        success: false,
        message: `Không thể khiếu nại đơn hàng ở trạng thái "${order.shippingStatus}"`,
      });
    }

    // Kiểm tra xem đã có khiếu nại chưa
    if (order.complaint && order.complaint.reason) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng này đã được khiếu nại trước đó",
        currentComplaint: {
          reason: order.complaint.reason,
          status: order.complaint.status,
          createdAt: order.complaint.createdAt,
        },
      });
    }

    // Tạo khiếu nại
    const complaintData = {
      reason,
      description,
      createdAt: new Date(),
      status: "Chờ xử lý",
      images: req.body.images || [], // Cho phép đính kèm hình ảnh
    };

    // Tạo status history cho việc chuyển sang khiếu nại
    const statusChange = {
      type: "shipping",
      from: order.shippingStatus,
      to: "Khiếu nại",
      updatedBy: req.user.id,
      updatedAt: new Date(),
      note: `Khách hàng khiếu nại: ${reason}`,
      reason: `Khách hàng tạo khiếu nại - ${description}`,
      isAutomatic: false,
    };

    // Cập nhật đơn hàng
    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          shippingStatus: "Khiếu nại",
          complaint: complaintData,
        },
        $push: { statusHistory: statusChange },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Khiếu nại đã được gửi thành công",
      data: {
        orderId: updatedOrder.orderId,
        complaint: updatedOrder.complaint,
        shippingStatus: updatedOrder.shippingStatus,
      },
    });
  } catch (error) {
    console.error("❌ Error in createComplaint:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi gửi khiếu nại",
      error: error.message,
    });
  }
};

// Xử lý khiếu nại (cho admin)
export const processComplaint = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { action, adminNote, resolution } = req.body;

    // Validate input
    if (!action || !["accept", "reject", "processing"].includes(action)) {
      return res.status(400).json({
        success: false,
        message:
          "Hành động không hợp lệ. Chỉ chấp nhận: accept, reject, processing",
      });
    }

    // Tìm đơn hàng có khiếu nại
    const order = await Order.findOne({
      orderId,
      shippingStatus: { $in: ["Khiếu nại", "Đang xử lý khiếu nại"] },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng có khiếu nại",
      });
    }

    if (!order.complaint) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng này không có khiếu nại",
      });
    }

    // Xử lý theo action
    let newShippingStatus;
    let complaintStatus;

    switch (action) {
      case "processing":
        newShippingStatus = "Đang xử lý khiếu nại";
        complaintStatus = "Đang xử lý";
        break;
      case "accept":
        newShippingStatus = "Khiếu nại được giải quyết";
        complaintStatus = "Được chấp nhận";
        break;
      case "reject":
        newShippingStatus = "Khiếu nại bị từ chối";
        complaintStatus = "Bị từ chối";
        break;
    }

    // Cập nhật khiếu nại
    const updatedComplaint = {
      ...order.complaint,
      status: complaintStatus,
      adminNote: adminNote || "",
      resolution: resolution || "",
      processedAt: new Date(),
      processedBy: req.user.id, // Admin ID
    };

    // Tạo status history cho việc xử lý khiếu nại
    const statusChange = {
      type: "shipping",
      from: order.shippingStatus,
      to: newShippingStatus,
      updatedBy: req.user.id,
      updatedAt: new Date(),
      note: `Admin xử lý khiếu nại: ${action} - ${adminNote || ""}`,
      reason: `Xử lý khiếu nại: ${resolution || ""}`,
      isAutomatic: false,
    };

    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          shippingStatus: newShippingStatus,
          complaint: updatedComplaint,
        },
        $push: { statusHistory: statusChange },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: `Khiếu nại đã được ${
        action === "accept"
          ? "chấp nhận"
          : action === "reject"
          ? "từ chối"
          : "xử lý"
      }`,
      data: {
        orderId: updatedOrder.orderId,
        complaint: updatedOrder.complaint,
        shippingStatus: updatedOrder.shippingStatus,
      },
    });
  } catch (error) {
    console.error("❌ Error in processComplaint:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xử lý khiếu nại",
      error: error.message,
    });
  }
};

// Lấy danh sách khiếu nại (cho admin)
export const getComplaints = async (req, res) => {
  try {
    const { _page = 1, _limit = 10, status } = req.query;

    const query = {
      complaint: { $exists: true },
    };

    if (status && status !== "Tất cả") {
      query["complaint.status"] = status;
    }

    const options = {
      page: parseInt(_page),
      limit: parseInt(_limit),
      sort: { "complaint.createdAt": -1 },
      populate: {
        path: "items.productVariantId",
        model: "ProductVariant",
      },
    };

    const result = await Order.paginate(query, options);

    return res.status(200).json({
      success: true,
      data: result.docs,
      totalPages: result.totalPages,
      currentPage: result.page,
      total: result.totalDocs,
    });
  } catch (error) {
    console.error("❌ Error in getComplaints:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách khiếu nại",
      error: error.message,
    });
  }
};

// Hàm debug: Reset khiếu nại cho testing (chỉ dùng trong development)
export const resetComplaint = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      orderId,
      "user._id": req.user.id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    // Xóa khiếu nại và reset trạng thái
    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      {
        $unset: { complaint: 1 },
        $set: { shippingStatus: "Giao hàng thành công" },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Đã reset khiếu nại thành công",
      data: {
        orderId: updatedOrder.orderId,
        shippingStatus: updatedOrder.shippingStatus,
        complaint: updatedOrder.complaint,
      },
    });
  } catch (error) {
    console.error("❌ Error in resetComplaint:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi reset khiếu nại",
      error: error.message,
    });
  }
};

// API để admin xử lý hoàn tiền thủ công hoặc gọi API hoàn tiền
export const processRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      action,
      adminNote,
      refundMethod,
      refundTransactionId,
      useAutoRefund,
    } = req.body;

    // Validate input
    if (
      !action ||
      !["approve", "reject", "completed", "auto_refund"].includes(action)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Hành động không hợp lệ. Chỉ chấp nhận: approve, reject, completed, auto_refund",
      });
    }

    // Tìm đơn hàng
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    // Kiểm tra xem đơn hàng có cần hoàn tiền không
    if (!order.paymentDetails?.refundRequested) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng này không có yêu cầu hoàn tiền",
      });
    }

    // Xử lý hoàn tiền tự động qua API
    if (
      action === "auto_refund" &&
      (order.paymentMethod === "MoMo" || order.paymentMethod === "zalopay")
    ) {
      try {
        const refundResult = await processAutoRefund(order);

        if (refundResult.success) {
          // Hoàn tiền thành công
          const refundUpdates = {
            refundStatus: "Đã hoàn thành",
            refundProcessedAt: new Date(),
            refundProcessedBy: req.user.id,
            adminNote: adminNote || "Hoàn tiền tự động thành công",
            refundMethod: `${order.paymentMethod} API`,
            refundId: refundResult.refundId,
            refundCompletedAt: new Date(),
          };

          await Order.findByIdAndUpdate(order._id, {
            $set: {
              paymentDetails: {
                ...order.paymentDetails,
                ...refundUpdates,
              },
            },
          });

          // Gửi thông báo thành công
          try {
            await sendTelegramMessage(
              `✅ Hoàn tiền tự động thành công!\n` +
                `📋 Mã đơn: ${order.orderId}\n` +
                `💰 Số tiền: ${order.finalAmount.toLocaleString("vi-VN")}đ\n` +
                `💳 Phương thức: ${order.paymentMethod} API\n` +
                `🆔 Refund ID: ${refundResult.refundId}\n` +
                `👤 Xử lý bởi: ${req.user.email}\n` +
                `📧 Khách hàng: ${order.user.email}`
            );
          } catch (err) {
            console.error("Gửi thông báo Telegram thất bại:", err);
          }

          return res.status(200).json({
            success: true,
            message: "Hoàn tiền tự động thành công",
            data: {
              orderId: order.orderId,
              refundId: refundResult.refundId,
              refundAmount: order.finalAmount,
              paymentMethod: order.paymentMethod,
            },
          });
        } else {
          // Hoàn tiền thất bại
          await Order.findByIdAndUpdate(order._id, {
            $set: {
              paymentDetails: {
                ...order.paymentDetails,
                autoRefundError: refundResult.error,
                autoRefundAttemptedAt: new Date(),
                autoRefundAttemptedBy: req.user.id,
              },
            },
          });

          return res.status(400).json({
            success: false,
            message: "Hoàn tiền tự động thất bại",
            error: refundResult.error,
            suggestion: "Vui lòng xử lý hoàn tiền thủ công",
          });
        }
      } catch (error) {
        console.error("❌ Auto refund error:", error);
        return res.status(500).json({
          success: false,
          message: "Lỗi khi thực hiện hoàn tiền tự động",
          error: error.message,
        });
      }
    }

    // Xử lý hoàn tiền thủ công
    const refundUpdates = {
      refundStatus:
        action === "approve"
          ? "Đã duyệt"
          : action === "reject"
          ? "Bị từ chối"
          : "Đã hoàn thành",
      refundProcessedAt: new Date(),
      refundProcessedBy: req.user.id,
      adminNote: adminNote || "",
    };

    if (action === "completed") {
      refundUpdates.refundMethod = refundMethod;
      refundUpdates.refundTransactionId = refundTransactionId;
      refundUpdates.refundCompletedAt = new Date();
    }

    // Cập nhật payment details
    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          paymentDetails: {
            ...order.paymentDetails,
            ...refundUpdates,
          },
        },
      },
      { new: true }
    );

    // Gửi thông báo Telegram
    try {
      const statusText =
        action === "approve"
          ? "đã được duyệt"
          : action === "reject"
          ? "bị từ chối"
          : "đã hoàn thành";

      await sendTelegramMessage(
        `💸 Cập nhật hoàn tiền!\n` +
          `📋 Mã đơn: ${order.orderId}\n` +
          `💰 Số tiền: ${order.finalAmount.toLocaleString("vi-VN")}đ\n` +
          `🔄 Trạng thái: ${statusText}\n` +
          `👤 Xử lý bởi: ${req.user.email}\n` +
          `📧 Khách hàng: ${order.user.email}\n` +
          `📝 Ghi chú: ${adminNote || "Không có"}`
      );
    } catch (err) {
      console.error("Gửi thông báo Telegram thất bại:", err);
    }

    return res.status(200).json({
      success: true,
      message: `Hoàn tiền đã được ${
        action === "approve"
          ? "duyệt"
          : action === "reject"
          ? "từ chối"
          : "hoàn thành"
      }`,
      data: {
        orderId: updatedOrder.orderId,
        paymentDetails: updatedOrder.paymentDetails,
      },
    });
  } catch (error) {
    console.error("❌ Error in processRefund:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xử lý hoàn tiền",
      error: error.message,
    });
  }
};

// API để kiểm tra trạng thái hoàn tiền từ gateway
export const checkRefundStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Tìm đơn hàng
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    // Kiểm tra có refund ID không
    const refundId = order.paymentDetails?.refundId;
    if (!refundId) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng này chưa có yêu cầu hoàn tiền hoặc chưa được xử lý",
      });
    }

    let statusResult;
    switch (order.paymentMethod) {
      case "MoMo":
        statusResult = await checkMoMoRefundStatus(refundId);
        break;
      case "zalopay":
        statusResult = await checkZaloPayRefundStatus(refundId);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `Phương thức thanh toán ${order.paymentMethod} không hỗ trợ kiểm tra trạng thái hoàn tiền tự động`,
        });
    }

    if (statusResult.success) {
      // Cập nhật trạng thái nếu có thay đổi
      const currentStatus = order.paymentDetails.refundStatus;
      const newStatus =
        statusResult.data.status || statusResult.data.resultCode;

      if (currentStatus !== newStatus) {
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            "paymentDetails.refundStatus": newStatus,
            "paymentDetails.lastStatusCheck": new Date(),
            "paymentDetails.gatewayResponse": statusResult.data,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: "Kiểm tra trạng thái hoàn tiền thành công",
        data: {
          orderId: order.orderId,
          refundId,
          paymentMethod: order.paymentMethod,
          currentStatus: order.paymentDetails.refundStatus,
          gatewayStatus: newStatus,
          gatewayResponse: statusResult.data,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Không thể kiểm tra trạng thái hoàn tiền",
        error: statusResult.error,
      });
    }
  } catch (error) {
    console.error("❌ Error in checkRefundStatus:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi kiểm tra trạng thái hoàn tiền",
      error: error.message,
    });
  }
};

// API để lấy danh sách đơn hàng cần hoàn tiền
export const getRefundRequests = async (req, res) => {
  try {
    const { _page = 1, _limit = 10, status } = req.query;

    const query = {
      "paymentDetails.refundRequested": true,
    };

    if (status && status !== "Tất cả") {
      query["paymentDetails.refundStatus"] = status;
    }

    const options = {
      page: parseInt(_page),
      limit: parseInt(_limit),
      sort: { "paymentDetails.refundRequestedAt": -1 },
      populate: {
        path: "items.productVariantId",
        model: "ProductVariant",
      },
    };

    const result = await Order.paginate(query, options);

    return res.status(200).json({
      success: true,
      data: result.docs,
      totalPages: result.totalPages,
      currentPage: result.page,
      total: result.totalDocs,
    });
  } catch (error) {
    console.error("❌ Error in getRefundRequests:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách yêu cầu hoàn tiền",
      error: error.message,
    });
  }
};

// API để xử lý hoàn tiền thủ công
export const processManualRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { note } = req.body;

    // Tìm đơn hàng
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    // Kiểm tra quyền admin
    if (req.user.role != "3") {
      return res.status(403).json({
        success: false,
        message: "Chỉ admin mới có quyền xử lý hoàn tiền",
      });
    }

    // Kiểm tra trạng thái đơn hàng
    if (!order.paymentDetails?.refundRequested) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng này chưa yêu cầu hoàn tiền",
      });
    }

    if (order.paymentDetails.refundStatus === "completed") {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng này đã được hoàn tiền",
      });
    }

    // Cập nhật trạng thái đang xử lý
    order.paymentDetails.refundStatus = "processing";
    order.paymentDetails.refundNote =
      note || "Admin đang xử lý hoàn tiền thủ công";
    await order.save();

    let refundResult;

    try {
      // Gọi API hoàn tiền tương tự như logic hủy đơn hàng
      const refundInfo = await processRefundForCancelledOrder(
        order,
        req.user._id
      );

      if (refundInfo.status.includes("completed")) {
        // Hoàn tiền thành công
        await order.save(); // order đã được cập nhật trong processRefundForCancelledOrder

        return res.status(200).json({
          success: true,
          message: "Hoàn tiền thành công",
          data: {
            orderId: order.orderId,
            refundId: order.paymentDetails.refundTransactionId,
            amount: order.finalAmount,
            status: "completed",
          },
        });
      } else {
        // Hoàn tiền thất bại hoặc cần xử lý thủ công
        await order.save(); // order đã được cập nhật trong processRefundForCancelledOrder

        return res.status(400).json({
          success: false,
          message: "Hoàn tiền thất bại",
          error: refundInfo.message,
          data: {
            orderId: order.orderId,
            status: order.paymentDetails.refundStatus,
          },
        });
      }
    } catch (error) {
      // Lỗi khi gọi API
      order.paymentDetails.refundStatus = "failed";
      order.paymentDetails.refundNote = `Lỗi khi gọi API hoàn tiền: ${
        error.message
      }. ${note || ""}`;
      await order.save();

      return res.status(500).json({
        success: false,
        message: "Lỗi khi xử lý hoàn tiền",
        error: error.message,
        data: {
          orderId: order.orderId,
          status: "failed",
        },
      });
    }
  } catch (error) {
    console.error("❌ Error in processManualRefund:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi xử lý hoàn tiền",
      error: error.message,
    });
  }
};

export const getOrderStatusHistory = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
      .select("orderId user statusHistory paymentStatus shippingStatus")
      .populate("statusHistory.updatedBy", "email name");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    // Kiểm tra quyền truy cập (chỉ chủ đơn hàng hoặc admin)
    if (
      req.user.role !== "admin" &&
      order.user._id.toString() !== req.user.id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem lịch sử đơn hàng này",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        orderId: order.orderId,
        currentPaymentStatus: order.paymentStatus,
        currentShippingStatus: order.shippingStatus,
        statusHistory: order.statusHistory.sort(
          (a, b) => new Date(a.updatedAt) - new Date(b.updatedAt)
        ),
      },
    });
  } catch (error) {
    console.error("❌ Error in getOrderStatusHistory:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy lịch sử trạng thái đơn hàng",
      error: error.message,
    });
  }
};
