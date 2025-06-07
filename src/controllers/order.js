import Order from "../models/order.js";
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
