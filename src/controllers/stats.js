import Order from "../models/order.js";
import Product from "../models/product.js";
import ProductVariant from "../models/productVariant.js";
import User from "../models/user.js";
import Category from "../models/categories.js";
import moment from "moment-timezone";

export const getDashboardStats = async (req, res) => {
  try {
    const { type = "this_month", from, to, limit = 5, threshold = 5 } = req.query;
    const now = moment().tz("Asia/Ho_Chi_Minh");
    let start, end;

    // ===== Xác định khoảng thời gian =====
    if (type === "today") {
      start = now.clone().startOf("day").toDate();
      end = now.clone().endOf("day").toDate();
    } else if (type === "this_week") {
      start = now.clone().startOf("isoWeek").toDate();
      end = now.clone().endOf("isoWeek").toDate();
    } else if (type === "this_month") {
      start = now.clone().startOf("month").toDate();
      end = now.clone().endOf("month").toDate();
    } else if (type === "this_year") {
      start = now.clone().startOf("year").toDate();
      end = now.clone().endOf("year").toDate();
    } else if (type === "custom_range" && from && to) {
      start = moment.tz(from, "Asia/Ho_Chi_Minh").startOf("day").toDate();
      end = moment.tz(to, "Asia/Ho_Chi_Minh").endOf("day").toDate();
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || moment(start).isAfter(moment(end))) {
        return res.status(400).json({ message: "Invalid date range" });
      }
    } else {
      return res.status(400).json({ message: "Invalid type or missing range" });
    }

     
    // doanh thu & số đơn hàng thực tế
    const orderMatchReal = {
      shippingStatus: { $in: ["Đã nhận hàng"] },
      createdAt: { $gte: start, $lt: end },
    };
     //doanh thu & số đơn hàng dự kiến
    const orderMatchForecast = {
      paymentStatus: { $in: ["Đã thanh toán"] },
      shippingStatus: { $in: ["Đã xác nhận", "Đang giao hàng", "Giao hàng thành công", "Đã nhận hàng"] },
      createdAt: { $gte: start, $lt: end },
    };

    
    let groupStage = {};
    let sortStage = {};
    let projectStage = {};

    if (type === "today") {
      groupStage = {
        _id: {
          label: {
            $dateToString: { format: "%Hh %d/%m", date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" },
          },
        },
        totalRevenue: { $sum: "$finalAmount" },
        totalOrders: { $sum: 1 },
      };
      sortStage = { "_id.label": 1 };
      projectStage = { _id: 0, label: "$_id.label", totalRevenue: 1, totalOrders: 1 };
    } else if (type === "this_week") {
      groupStage = {
        _id: {
          day: {
            $dateToString: { format: "%u", date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" }, 
          },
        },
        totalRevenue: { $sum: "$finalAmount" },
        totalOrders: { $sum: 1 },
      };
      sortStage = { "_id.day": 1 };
      projectStage = {
        _id: 0,
        label: {
          $switch: {
            branches: [
              { case: { $eq: ["$_id.day", "1"] }, then: "Thứ 2" },
              { case: { $eq: ["$_id.day", "2"] }, then: "Thứ 3" },
              { case: { $eq: ["$_id.day", "3"] }, then: "Thứ 4" },
              { case: { $eq: ["$_id.day", "4"] }, then: "Thứ 5" },
              { case: { $eq: ["$_id.day", "5"] }, then: "Thứ 6" },
              { case: { $eq: ["$_id.day", "6"] }, then: "Thứ 7" },
              { case: { $eq: ["$_id.day", "7"] }, then: "Chủ nhật" },
            ],
            default: "Không xác định",
          },
        },
        totalRevenue: 1,
        totalOrders: 1,
      };
    } else if (type === "this_month") {
      groupStage = {
        _id: {
          label: { $dateToString: { format: "%d/%m", date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } },
        },
        totalRevenue: { $sum: "$finalAmount" },
        totalOrders: { $sum: 1 },
      };
      sortStage = { "_id.label": 1 };
      projectStage = { _id: 0, label: "$_id.label", totalRevenue: 1, totalOrders: 1 };
    } else if (type === "this_year") {
      groupStage = {
        _id: { month: { $month: { date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } } },
        totalRevenue: { $sum: "$finalAmount" },
        totalOrders: { $sum: 1 },
      };
      sortStage = { "_id.month": 1 };
      projectStage = {
        _id: 0,
        label: {
          $concat: ["Tháng ", { $toString: "$_id.month" }],
        },
        totalRevenue: 1,
        totalOrders: 1,
      };
    } else if (type === "custom_range") {
      const diffDays = moment(end).diff(moment(start), "days");
      let fmt = "%d/%m";
      if (diffDays > 30 && diffDays <= 180) fmt = "Tuần %V/%Y";
      else if (diffDays > 180) fmt = "%m/%Y";

      groupStage = {
        _id: {
          label: { $dateToString: { format: fmt, date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } },
        },
        totalRevenue: { $sum: "$finalAmount" },
        totalOrders: { $sum: 1 },
      };
      sortStage = { "_id.label": 1 };
      projectStage = { _id: 0, label: "$_id.label", totalRevenue: 1, totalOrders: 1 };
    }

    const sales = await Order.aggregate([
      { $match: orderMatchReal },
      { $group: groupStage },
      { $sort: sortStage },
      { $project: projectStage },
    ]);

    // Bổ sung dữ liệu đầy đủ cho tuần/năm
    let finalSales = sales;
    if (type === "this_week") {
      const fullWeek = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
      finalSales = fullWeek.map((day) => sales.find((s) => s.label === day) || { label: day, totalRevenue: 0, totalOrders: 0 });
    } else if (type === "this_year") {
      const fullYear = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);
      finalSales = fullYear.map((month) => sales.find((s) => s.label === month) || { label: month, totalRevenue: 0, totalOrders: 0 });
    }

    // ===== Tổng doanh thu & đơn hàng =====
    const [totalRevenue] = await Order.aggregate([{ $match: orderMatchReal }, { $group: { _id: null, total: { $sum: "$finalAmount" }, count: { $sum: 1 } } }]);
    // dự báo doanh thu
    const [forecastRevenue] = await Order.aggregate([{ $match: orderMatchForecast }, { $group: { _id: null, total: { $sum: "$finalAmount" }, count: { $sum: 1 } } }]);

    // ===== Top Products =====
    const topProducts = await Order.aggregate([
      { $match: orderMatchReal },
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
        $lookup: { from: "productvariants", localField: "_id", foreignField: "_id", as: "variant" },
      },
      { $unwind: "$variant" },
      {
        $lookup: { from: "products", localField: "variant.productId", foreignField: "_id", as: "product" },
      },
      { $unwind: "$product" },
      {
        $project: { _id: 0, productName: "$product.name", image: { $arrayElemAt: ["$product.images", 0] }, quantitySold: 1, revenue: 1 },
      },
    ]);

    // ===== Top Customers =====
    const topCustomers = await Order.aggregate([
      { $match: orderMatchReal },
      {
        $group: {
          _id: "$user._id",
          email: { $first: "$user.email" },
          totalSpent: { $sum: "$finalAmount" },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: parseInt(limit) },
    ]);

    // ===== Inventory Alert =====
    const inventoryAlert = await ProductVariant.find({
      "sizes.stock": { $lte: parseInt(threshold) },
    }).populate("productId").lean();

    // ===== User Growth =====
    const userGrowth = await User.aggregate([
      { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // ===== Sales Breakdown =====
    let groupIdBreakdown = {};
    if (type === "this_year" || type === "custom_range") {
      groupIdBreakdown = { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
    } else {
      groupIdBreakdown = { day: { $dayOfMonth: "$createdAt" }, month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
    }

    const salesBreakdown = await Order.aggregate([
      { $match: orderMatchReal },
      { $group: { _id: groupIdBreakdown, totalRevenue: { $sum: "$finalAmount" }, orderCount: { $sum: 1 } } },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    // ===== RESPONSE =====
    res.json({
      totalRevenue: totalRevenue?.total || 0,
      expectedRevenue: forecastRevenue?.total || 0,
      totalOrders: totalRevenue?.count || 0,
      forecastOrders: forecastRevenue?.count || 0,
      sales: finalSales.length > 0 ? finalSales : [{ label: "Không có dữ liệu", totalRevenue: 0, totalOrders: 0 }],
      topProducts,
      topCustomers,
      inventoryAlert,
      userGrowth,
      salesBreakdown,
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    res.status(500).json({ message: error.message });
  }
};


export const getStats = async (req, res) => {
  try {
    const { type = "this_month", from, to } = req.query;
    const now = moment().tz("Asia/Ho_Chi_Minh"); // Thời gian hiện tại với múi giờ Việt Nam
    let start, end;

    // Xác định thời gian dựa trên type
    if (type === "today") {
      start = now.clone().startOf("day").toDate();
      end = now.clone().endOf("day").toDate();
    } else if (type === "this_week") {
      start = now.clone().startOf("isoWeek").toDate();
      end = now.clone().endOf("isoWeek").toDate();
    } else if (type === "this_month") {
      start = now.clone().startOf("month").toDate();
      end = now.clone().endOf("month").toDate();
    } else if (type === "this_year") {
      start = now.clone().startOf("year").toDate();
      end = now.clone().endOf("year").toDate();
    } else if (type === "custom_range" && from && to) {
      start = moment.tz(from, "Asia/Ho_Chi_Minh").startOf("day").toDate();
      end = moment.tz(to, "Asia/Ho_Chi_Minh").endOf("day").toDate();
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || moment(start).isAfter(moment(end))) {
        return res.status(400).json({ message: "Invalid date range" });
      }
    } else {
      return res.status(400).json({ message: "Invalid type or missing range" });
    }

    

    // Match dựa trên thời gian (không lọc trạng thái)
    const timeMatch = {
      createdAt: { $gte: start, $lt: end },
    };

    // Tính totalOrders dựa trên thời gian, không lọc trạng thái
    const totalOrders = await Order.countDocuments(timeMatch);

    const totalUsers = await User.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalCategories = await Category.countDocuments();

    // Lấy danh sách đơn hàng trong khoảng thời gian đã xác định
    const orders = await Order.find(timeMatch);
    const totalRevenue = orders.reduce((sum, order) => sum + (order.finalAmount || 0), 0);

    const outOfStockProducts = await ProductVariant.countDocuments({
      "sizes.stock": { $eq: 0 },
    });

    // Thống kê cả paymentStatus và shippingStatus
    const orderStatusStats = await Order.aggregate([
      { $match: timeMatch },
      {
        $facet: {
          paymentStats: [
            { $group: { _id: "$paymentStatus", count: { $sum: 1 } } },
          ],
          shippingStats: [
            { $group: { _id: "$shippingStatus", count: { $sum: 1 } } },
          ],
        },
      },
      {
        $project: {
          statuses: {
            $concatArrays: ["$paymentStats", "$shippingStats"],
          },
        },
      },
      { $unwind: "$statuses" },
      { $group: { _id: "$statuses._id", count: { $sum: "$statuses.count" } } },
      { $match: { _id: { $ne: null } } }, // Loại bỏ các giá trị null
    ]);

    if (orderStatusStats.length === 0) {
      orderStatusStats.push({ _id: "Không có dữ liệu", count: orders.length });
    }

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
    const userRoles = await User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]);

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
    const productByCategory = await Product.aggregate([{ $group: { _id: "$categoryId", count: { $sum: 1 } } }]);

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