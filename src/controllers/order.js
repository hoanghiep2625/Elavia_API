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
    if (_user) query["user.name"] = { $regex: _user, $options: "i" };
    if (_phone) query["user.phone"] = { $regex: _phone, $options: "i" };
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

    return res.status(200).json(order);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, user } = req.body;

    if (!status && !user) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp thông tin cần cập nhật" });
    }

    // Xây dựng object update
    const updateData = {};
    if (status) updateData.status = status;
    if (user && typeof user === "object") {
      // Chỉ cập nhật các trường name, phone, address nếu có
      if (user.name) updateData["user.name"] = user.name;
      if (user.phone) updateData["user.phone"] = user.phone;
      if (user.address) updateData["user.address"] = user.address;
    }

    const order = await Order.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).populate("items.productVariantId");

    if (!order) {
      return res.status(404).json({ message: "Đơn hàng không tồn tại" });
    }

    return res.status(200).json({
      message: "Cập nhật đơn hàng thành công",
      data: order,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
