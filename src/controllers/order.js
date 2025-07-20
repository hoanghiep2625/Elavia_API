import Order from "../models/order.js";
import Voucher from "../models/vocher.js";
import Review from "../models/review.js";
import { getShippingFeeOrder } from "./shippingApi.js";
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
    } = req.body;

    const user = {
      _id: req.user.id,
      email: req.user.email,
    };

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
    const orderData = {
      orderId,
      user,
      receiver,
      items,
      totalPrice,
      shippingFee,
      discountAmount,
      finalAmount,
      paymentMethod,
      orderInfo,
      extraData,
      orderGroupId,
      paymentUrl,
      voucher: appliedVoucher
        ? {
          code: appliedVoucher.code,
          value: appliedVoucher.value,
          type: appliedVoucher.type,
          maxDiscount: appliedVoucher.maxDiscount,
        }
        : null,
      status:
        paymentMethod === "MoMo" || paymentMethod === "zalopay"
          ? "Chờ thanh toán"
          : "Chờ xác nhận",
    };

    const order = new Order(orderData);
    await order.save();

    if (appliedVoucher) {
      appliedVoucher.usedBy.push(req.user.id);
      appliedVoucher.quantity -= 1;
      await appliedVoucher.save();
    }

    return res.status(201).json({
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    console.error("Error in createOrder:", error);
    return res.status(500).json({
      message: "Error creating order",
      error: error.message,
    });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const { orderId, cancelBy } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }
    if (cancelBy === "buyer") {
      const allowedStatuses = [
        "Chờ xác nhận",
        "Đã thanh toán",
        "Chờ thanh toán",
        "Đã xác nhận",
      ];
      if (!allowedStatuses.includes(order.status)) {
        return res.status(400).json({
          message: "Không thể huỷ đơn hàng ở trạng thái này",
        });
      }
      order.status = "Người mua huỷ";
    } else if (cancelBy === "seller") {
      // Người bán có thể huỷ bất cứ lúc nào
      order.status = "Người bán huỷ";
    } else {
      return res.status(400).json({
        message:
          "Giá trị cancelBy không hợp lệ. Chỉ chấp nhận 'seller' hoặc 'buyer'",
      });
    }

    // Xử lý theo phương thức thanh toán
    if (order.paymentMethod === "MoMo") {
      if (order.status === "Đã thanh toán") {
        // Ghi log xử lý hoàn tiền MoMo
        console.log("Xử lý refund qua MoMo...");
        order.paymentDetails = {
          ...order.paymentDetails,
          refundRequested: true,
          refundRequestedAt: new Date(),
          refundRequestedBy: cancelBy,
        };
      }
    }
    await order.save();
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
    if (_status && _status !== "Tất cả") query.status = _status;

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
    const { _page = 1, _limit = 10, status } = req.query;

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
    if (status && status !== "Tất cả") {
      query.status = status; // Lọc theo trạng thái nếu có
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
    const order = await Order.findById(req.params.id).populate(
      "items.productVariantId"
    ); // <- dòng này để populate chi tiết biến thể

    if (!order) {
      return res.status(200).json({ message: "Đơn hàng không tồn tại" });
    }
     // Lấy danh sách review của user trong đơn hàng này
    const reviews = await Review.find({
      orderId: order._id,
      userId: req.user.id,
    });

    // Gắn review tương ứng vào từng item
    const itemsWithReview = order.items.map((item) => {
      const review = reviews.find((r) =>
        r.productVariantId.toString() === item.productVariantId._id.toString()
      );
      return {
        ...item.toObject(),
        reviewData: review || null,
      };
    });

    const result = {
      ...order.toObject(),
      items: itemsWithReview,
    };
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};
const allowedStatusTransitions = {
  "Chờ xác nhận": ["Đã xác nhận", "Người mua huỷ", "Người bán huỷ"],
  "Đã xác nhận": ["Đang giao hàng", "Người bán huỷ"],
  "Đang giao hàng": ["Giao hàng thành công", "Giao hàng thất bại"],
  "Giao hàng thất bại": ["Người bán huỷ"],

  // Các trạng thái MoMo
  "Chờ thanh toán": ["Đã thanh toán", "Huỷ do quá thời gian thanh toán"],
  "Đã thanh toán": ["Chờ xác nhận"], // Sau khi thanh toán mới được chuyển sang xử lý
  "Huỷ do quá thời gian thanh toán": [],

  // Các trạng thái cuối
  "Giao hàng thành công": [], // không được chuyển tiếp
  "Người mua huỷ": [],
  "Người bán huỷ": [],
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, receiver } = req.body;

    if (!status && !receiver) {
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
    if (status) {
      const currentStatus = order.status;
      const allowedNextStatuses = allowedStatusTransitions[currentStatus] || [];
      if (!allowedNextStatuses.includes(status)) {
        return res.status(400).json({
          message: `Không thể chuyển trạng thái từ "${currentStatus}" sang "${status}".`,
        });
      }
    }

    // 3. Chuẩn bị dữ liệu cập nhật
    const updateData = {};
    if (status) updateData.status = status;
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
