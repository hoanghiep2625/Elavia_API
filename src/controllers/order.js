import Order from "../models/order.js";
export const createOrder = async (req, res) => {
  try {
    const {
      orderId,
      user,
      items,
      totalAmount,
      paymentMethod,
      orderInfo = "",
      extraData = "",
      orderGroupId = "",
      paymentUrl = "",
    } = req.body;

    const orderData = {
      orderId,
      user,
      items,
      totalAmount,
      paymentMethod,
      orderInfo,
      extraData,
      orderGroupId,
      paymentUrl,
      // Nếu là MoMo hoặc zalopay thì mặc định "Chờ thanh toán", nếu COD thì "Chờ xác nhận"
      status:
        paymentMethod === "MoMo" || paymentMethod === "zalopay"
          ? "Chờ thanh toán"
          : "Chờ xác nhận",
    };

    const order = new Order(orderData);
    await order.save();
    return res
      .status(201)
      .json({ message: "Order created successfully", order });
  } catch (error) {
    console.error("Error in createOrder:", error);
    return res
      .status(500)
      .json({ message: "Error creating order", error: error.message });
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
    const { page = 1, limit = 10 } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: {
        path: "items.productVariantId",
        model: "ProductVariant",
      },
      sort: { createdAt: -1 },
    };

    const result = await Order.paginate({}, options);

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
    const userEmail = req.user.email;
    const { page = 1, limit = 10 } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: {
        path: "items.productVariantId",
        model: "ProductVariant",
      },
      sort: { createdAt: -1 },
    };

    const result = await Order.paginate({ "user.email": userEmail }, options);

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

    return res.status(200).json(order);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};
