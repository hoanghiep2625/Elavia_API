import Order from "../models/order.js";
import Product from "../models/product.js";
import ProductVariant from "../models/productVariant.js";
import User from "../models/user.js";
import Category from "../models/categories.js";

// 4. Doanh thu theo thời gian (sales chart)
export const getSalesChart = async (req, res) => {
  try {
    const { type = "this_month", from, to } = req.query;
    let match = {};

    const now = new Date();
    let start, end;

    if (type === "today") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (type === "this_week") {
      const day = now.getDay() || 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (type === "this_month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    } else if (type === "this_year") {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear() + 1, 0, 1);
    } else if (type === "custom_range" && from && to) {
      start = new Date(from);
      end = new Date(to);
    } else {
      return res.status(400).json({ message: "Invalid type or missing range" });
    }

    match.createdAt = { $gte: start, $lt: end };
    match.status = { $in: ["Giao hàng thành công", "Đã thanh toán"] };

    // Nhóm theo ngày/tháng/năm tùy theo type
    let groupId = {};
    let sortKey = {};
    let projectLabel = {};

    if (type === "this_year" || type === "custom_range") {
      groupId = { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
      sortKey = { "_id.year": 1, "_id.month": 1 };
      projectLabel = {
        $concat: [
          "Tháng ",
          { $toString: "$_id.month" },
          "/",
          { $toString: "$_id.year" },
        ],
      };
    } else if (type === "this_week") {
      groupId = {
        week: { $isoWeek: "$createdAt" },
        month: { $month: "$createdAt" },
        year: { $year: "$createdAt" },
      };
      sortKey = { "_id.year": 1, "_id.week": 1 };
      projectLabel = {
        $concat: [
          "Tuần ",
          { $toString: "$_id.week" },
          " - ",
          { $toString: "$_id.month" },
          "/",
          { $toString: "$_id.year" },
        ],
      };
    } else if (type === "this_month" || type === "today") {
      groupId = {
        day: { $dayOfMonth: "$createdAt" },
        month: { $month: "$createdAt" },
        year: { $year: "$createdAt" },
      };
      sortKey = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };
      projectLabel = {
        $concat: [
          { $toString: "$_id.day" },
          "/",
          { $toString: "$_id.month" },
        ],
      };
    }

    const sales = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          totalRevenue: { $sum: "$finalAmount" },
          totalOrders: { $sum: 1 },
        },
      },
      { $sort: sortKey },
      {
        $project: {
          _id: 0,
          label: projectLabel,
          totalRevenue: 1,
          totalOrders: 1,
        },
      },
    ]);

    res.json({ data: sales });
  } catch (error) {
    console.error("Sales Chart Error:", error);
    res.status(500).json({ message: error.message });
  }
};


// 5. Top sản phẩm bán chạy nhất
export const getTopProducts = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const topProducts = await Order.aggregate([
      { $match: { status: { $in: ["Giao hàng thành công", "Đã thanh toán"] } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productVariantId",
          quantitySold: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: "productvariants",
          localField: "_id",
          foreignField: "_id",
          as: "variant",
        },
      },
      { $unwind: "$variant" },
      {
        $lookup: {
          from: "products",
          localField: "variant.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          _id: 0,
          productName: "$product.name",
          image: { $arrayElemAt: ["$product.images", 0] },
          quantitySold: 1,
          revenue: 1,
        },
      },
    ]);
    res.json({ data: topProducts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 6. Top khách hàng mua nhiều nhất
export const getTopCustomers = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const topCustomers = await Order.aggregate([
      { $match: { status: { $in: ["Giao hàng thành công", "Đã thanh toán"] } } },
      {
        $group: {
          _id: "$user._id",
          name: { $first: "$user.name" },
          email: { $first: "$user.email" },
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$finalAmount" },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: parseInt(limit) },
    ]);
    res.json({ data: topCustomers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 7. Thống kê số lượng người dùng mới theo tháng
export const getUserGrowth = async (req, res) => {
  try {
    const userGrowth = await User.aggregate([
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);
    res.json({ data: userGrowth });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 8. Sản phẩm sắp hết hàng hoặc hết hàng
export const getInventoryAlert = async (req, res) => {
  try {
    const { threshold = 5 } = req.query;
    const variants = await ProductVariant.find({
      "sizes.stock": { $lte: parseInt(threshold) },
    })
      .populate("productId")
      .lean();
    res.json({ data: variants });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export const getSalesBreakdown = async (req, res) => {
  try {
    const { type = "this_month", from, to } = req.query;
    let match = {};
    const now = new Date();
    let start, end;

    if (type === "today") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (type === "this_week") {
      const day = now.getDay() || 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (type === "this_month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    } else if (type === "this_year") {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear() + 1, 0, 1);
    } else if (type === "custom_range" && from && to) {
      start = new Date(from);
      end = new Date(to);
    } else {
      return res.status(400).json({ message: "Invalid type or missing range" });
    }

    match.createdAt = { $gte: start, $lt: end };
    match.status = { $in: ["Giao hàng thành công", "Đã thanh toán"] };

    // Group theo ngày/tháng/năm tuỳ loại
    let groupId = {};
    if (type === "this_year" || type === "custom_range") {
      groupId = { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
    } else {
      groupId = { day: { $dayOfMonth: "$createdAt" }, month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
    }

    const breakdown = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          totalRevenue: { $sum: "$finalAmount" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    res.json({ data: breakdown });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getStats = async (req, res) => {
  try {
    // Thống kê tổng số lượng
    const totalUsers = await User.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalCategories = await Category.countDocuments();
    const totalOrders = await Order.countDocuments();

    // Tổng doanh thu
    const orders = await Order.find();
    const totalRevenue = orders.reduce(
      (sum, order) => sum + (order.totalAmount || 0),
      0
    );

    // Số lượng sản phẩm hết hàng
    const outOfStockProducts = await ProductVariant.countDocuments({
      "sizes.stock": { $eq: 0 },
    });

    // Thống kê trạng thái đơn hàng
    const orderStatusStats = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Trả về kết quả
    return res.status(200).json({
      totalUsers,
      totalProducts,
      totalCategories,
      totalOrders,
      totalRevenue,
      outOfStockProducts,
      orderStatusStats,
    });
  } catch (error) {
    console.error("Error in getStats:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getUserStats = async (req, res) => {
  try {
    // Thống kê người dùng theo vai trò
    const userRoles = await User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);

    // Thống kê địa chỉ giao hàng
    const totalShippingAddresses = await User.aggregate([
      { $unwind: "$shipping_addresses" },
      { $count: "total" },
    ]);

    return res.status(200).json({
      userRoles,
      totalShippingAddresses: totalShippingAddresses[0]?.total || 0,
    });
  } catch (error) {
    console.error("Error in getUserStats:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getProductStats = async (req, res) => {
  try {
    // Thống kê sản phẩm theo danh mục
    const productByCategory = await Product.aggregate([
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    ]);

    // Thống kê sản phẩm theo trạng thái tồn kho
    const inStockProducts = await ProductVariant.countDocuments({
      "sizes.stock": { $gt: 0 },
    });

    return res.status(200).json({
      productByCategory,
      inStockProducts,
    });
  } catch (error) {
    console.error("Error in getProductStats:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
