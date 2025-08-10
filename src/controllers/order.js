import Order from "../models/order.js";
import ProductVariantSnapshot from "../models/productVariantSnapshot.js";
import Voucher from "../models/vocher.js";
import Review from "../models/review.js";
import ProductVariant from "../models/productVariant.js";
import { getShippingFeeOrder } from "./shippingApi.js";
import mongoose from "mongoose";
import { sendOrderEmail } from "../utils/sendOrderEmail.js";
import { sendTelegramMessage } from "../utils/sendTelegram.js";
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

    // 5. Gửi email xác nhận đơn hàng
    const trackingUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/order-details/${order._id}`;
    try {
      await sendOrderEmail({
        to: user.email,
        order,
        trackingUrl,
      });
    } catch (err) {
      console.error("Gửi email thất bại:", err);
    }

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

    order.shippingStatus = "Đã nhận hàng"; // hoặc Hoàn tất
    await order.save();

    res.json({ success: true, message: "Xác nhận nhận hàng thành công" });
  } catch (error) {
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
    const { orderId, cancelBy } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }
    // Kiểm tra quyền: chỉ chủ đơn hàng mới được hủy với cancelBy === "buyer"
    if (cancelBy === "buyer") {
      if (order.user._id.toString() !== req.user.id.toString()) {
        return res
          .status(403)
          .json({ message: "Bạn không có quyền hủy đơn này" });
      }
      const allowedPaymentStatuses = [
        "Chờ xác nhận",
        "Đã thanh toán",
        "Chờ thanh toán",
      ];
      const allowedShippingStatuses = ["Chờ xác nhận", "Đã xác nhận"];
      if (
        !allowedPaymentStatuses.includes(order.paymentStatus) &&
        !allowedShippingStatuses.includes(order.shippingStatus)
      ) {
        return res.status(400).json({
          message: "Không thể huỷ đơn hàng ở trạng thái này",
        });
      }
      order.paymentStatus = "Người mua huỷ";
      order.shippingStatus = "Người mua huỷ";
    } else if (cancelBy === "seller" || cancelBy === "admin") {
      order.paymentStatus = "Người bán huỷ";
      order.shippingStatus = "Người bán huỷ";
    } else {
      return res.status(400).json({
        message:
          "Giá trị cancelBy không hợp lệ. Chỉ chấp nhận 'seller', 'admin' hoặc 'buyer'",
      });
    }

    // Cộng lại số lượng tồn kho cho từng sản phẩm/biến thể trong đơn hàng
    for (const item of order.items) {
      await ProductVariant.updateOne(
        { _id: item.productVariantId, "sizes.size": item.size },
        { $inc: { "sizes.$.stock": item.quantity } },
        { session }
      );
    }

    // Xử lý hoàn tiền nếu cần (giữ nguyên như code của bạn)
    if (order.paymentMethod === "MoMo") {
      if (order.paymentStatus === "Đã thanh toán") {
        order.paymentDetails = {
          ...order.paymentDetails,
          refundRequested: true,
          refundRequestedAt: new Date(),
          refundRequestedBy: cancelBy,
        };
      }
    }
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();
    return res.status(200).json({
      message: "Huỷ đơn hàng thành công",
      order,
    });
  } catch (error) {
    console.error("Error in cancelOrder:", error);
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
    "Người mua huỷ",
    "Người bán huỷ",
  ],
  "Đã thanh toán": ["Người mua huỷ", "Người bán huỷ"],
  "Thanh toán khi nhận hàng": [
    "Đã thanh toán", // Khi giao hàng thành công
    "Người mua huỷ",
    "Người bán huỷ",
  ],
  "Huỷ do quá thời gian thanh toán": [],
  "Người mua huỷ": [],
  "Người bán huỷ": [],
};
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
  "Giao hàng thành công": ["Đã nhận hàng", "Khiếu nại"], // Có thể khiếu nại sau khi giao thành công
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
    const { status, paymentStatus, shippingStatus, receiver } = req.body;

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

    // Xử lý paymentStatus riêng biệt
    if (paymentStatus) {
      if (
        allowedPaymentStatusTransitions[order.paymentStatus]?.includes(
          paymentStatus
        )
      ) {
        updateData.paymentStatus = paymentStatus;
      } else {
        return res.status(400).json({
          message: `Không thể chuyển trạng thái thanh toán từ "${order.paymentStatus}" sang "${paymentStatus}".`,
        });
      }
    }

    // Xử lý shippingStatus riêng biệt
    if (shippingStatus) {
      if (
        allowedShippingStatusTransitions[order.shippingStatus]?.includes(
          shippingStatus
        )
      ) {
        updateData.shippingStatus = shippingStatus;
      } else {
        return res.status(400).json({
          message: `Không thể chuyển trạng thái giao hàng từ "${order.shippingStatus}" sang "${shippingStatus}".`,
        });
      }
    }

    // Xử lý status cũ (để tương thích ngược)
    if (status) {
      // Nếu trạng thái là trạng thái thanh toán
      if (
        allowedPaymentStatusTransitions[order.paymentStatus]?.includes(status)
      ) {
        updateData.paymentStatus = status;
      } else if (
        allowedShippingStatusTransitions[order.shippingStatus]?.includes(status)
      ) {
        updateData.shippingStatus = status;
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

    // 4. Cập nhật đơn hàng
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).populate("items.productVariantId");

    return res.status(200).json({
      message: "Cập nhật đơn hàng thành công",
      data: updatedOrder,
    });
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
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            shippingStatus: "Đã nhận hàng",
            // Nếu COD thì cũng cập nhật payment status
            ...(order.paymentMethod === "COD" &&
            order.paymentStatus === "Thanh toán khi nhận hàng"
              ? { paymentStatus: "Đã thanh toán" }
              : {}),
          },
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

    // Cập nhật đơn hàng
    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          shippingStatus: "Khiếu nại",
          complaint: complaintData,
        },
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

    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          shippingStatus: newShippingStatus,
          complaint: updatedComplaint,
        },
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
