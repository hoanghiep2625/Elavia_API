import cron from "node-cron";
import axios from "axios";
import mongoose from "mongoose";
import Order from "../models/order.js";
import { autoConfirmDeliveredOrders } from "./order.js";
import dotenv from "dotenv";

dotenv.config();

// Validate environment variables
const requiredEnvVars = ["MONGO_URI", "URL"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing environment variable: ${envVar}`);
    process.exit(1);
  }
}

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout for initial connection
    });
    console.log("🔗 Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

// Reconnect logic
const ensureDBConnection = async () => {
  if (mongoose.connection.readyState !== 1) {
    console.log("🔄 Attempting to reconnect to MongoDB...");
    await connectDB();
  }
};

// Axios instance with retry logic
const apiClient = axios.create({
  baseURL: process.env.URL_CRONJOB,
  timeout: 10000, // 10s timeout
});

// Process MoMo order
const processMoMoOrder = async (order) => {
  try {
    const response = await apiClient.post("/api/orders/momo/transaction", {
      orderId: order.orderId,
    });
    console.log(`🔍 MoMo API response for ${order.orderId}:`, response.data);

    switch (response.data.resultCode) {
      case 0:
        if (!order.paymentDetails) {
          await Order.updateOne(
            { orderId: order.orderId },
            {
              $set: {
                paymentStatus: "Đã thanh toán",
                paymentDetails: {
                  momoTransactionId: response.data.transId,
                  responseData: response.data,
                },
              },
            }
          );
          console.log(`✅ MoMo order ${order.orderId} paid successfully`);
        }
        break;
      case 1005:
        await Order.updateOne(
          { orderId: order.orderId },
          { $set: { paymentStatus: "Huỷ do quá thời gian thanh toán" } }
        );
        console.log(`❌ MoMo order ${order.orderId} expired`);
        break;
      case 1002:
        await Order.updateOne(
          { orderId: order.orderId },
          { $set: { paymentStatus: "Giao dịch bị từ chối do nhà phát hành" } }
        );
        console.log(`❌ MoMo order ${order.orderId} rejected by issuer`);
        break;
      default:
        console.log(`🟡 MoMo order ${order.orderId} still pending`);
    }
  } catch (error) {
    console.error(
      `⚠️ Error processing MoMo order ${order.orderId}:`,
      error.message
    );
  }
};

// Process ZaloPay order
const processZaloPayOrder = async (order) => {
  try {
    const response = await apiClient.post("/api/orders/zalopay/transaction", {
      app_trans_id: order.orderId,
    });
    console.log(`🔍 ZaloPay API response for ${order.orderId}:`, response.data);

    switch (response.data.return_code) {
      case 1:
        if (!order.paymentDetails) {
          await Order.updateOne(
            { orderId: order.orderId },
            {
              $set: {
                paymentStatus: "Đã thanh toán",
                paymentDetails: {
                  zalopayTransactionId: response.data.zp_trans_id,
                  responseData: response.data,
                },
              },
            }
          );
          console.log(`✅ ZaloPay order ${order.orderId} paid successfully`);
        }
        break;
      case 3:
        console.log(`🟡 ZaloPay order ${order.orderId} still pending`);
        break;
      default:
        await Order.updateOne(
          { orderId: order.orderId },
          { $set: { paymentStatus: "Huỷ do quá thời gian thanh toán" } }
        );
        console.log(`❌ ZaloPay order ${order.orderId} expired`);
    }
  } catch (error) {
    console.error(
      `⚠️ Error processing ZaloPay order ${order.orderId}:`,
      error.message
    );
  }
};

// Main cron job
const checkPaymentStatus = async () => {
  console.log("🔄 Checking payment status...");

  await ensureDBConnection();

  try {
    const pendingOrders = await Order.find({
      $or: [
        { paymentMethod: "MoMo", paymentStatus: "Chờ thanh toán" },
        { paymentMethod: "zalopay", paymentStatus: "Chờ thanh toán" },
      ],
    }).lean(); // Use lean for better performance

    console.log(`🔎 Found ${pendingOrders.length} orders to check`);

    if (pendingOrders.length === 0) {
      console.log("✅ No orders to check");
    } else {
      // Process orders concurrently with controlled concurrency
      const concurrencyLimit = 10;
      const chunks = [];
      for (let i = 0; i < pendingOrders.length; i += concurrencyLimit) {
        chunks.push(pendingOrders.slice(i, i + concurrencyLimit));
      }

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map((order) =>
            order.paymentMethod === "MoMo"
              ? processMoMoOrder(order)
              : processZaloPayOrder(order)
          )
        );
      }
    }

    // Kiểm tra và tự động xác nhận đơn hàng đã giao thành công sau 48h
    console.log("🔄 Checking delivered orders for auto-confirmation...");
    const confirmResult = await autoConfirmDeliveredOrders();
    if (confirmResult.success) {
      console.log(
        `✅ Auto-confirmed ${confirmResult.confirmedOrdersCount} delivered orders`
      );
    } else {
      console.error(`❌ Error auto-confirming orders: ${confirmResult.error}`);
    }
  } catch (error) {
    console.error("⚠️ Error querying orders:", error.message);
  }
};

// Initialize DB and start cron job
(async () => {
  await connectDB();
  cron.schedule("*/1 * * * *", checkPaymentStatus, {
    timezone: "Asia/Ho_Chi_Minh", // Adjust to your timezone
  });
  console.log("🚀 Cron job started");
})();
