import User from "../models/user.js";
import Product from "../models/product.js";
import Category from "../models/categories.js";
import Order from "../models/order.js";
import ProductVariant from "../models/productVariant.js";

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
