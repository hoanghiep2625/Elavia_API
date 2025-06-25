import cron from "node-cron";
import axios from "axios";
import mongoose from "mongoose";
import Order from "../models/order.js";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("Mongo URL không được định nghĩa!");
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🔗 Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  }
};

await connectDB();
cron.schedule("*/1 * * * *", async () => {
  console.log("🔄 Kiểm tra trạng thái thanh toán...");

  if (mongoose.connection.readyState !== 1) {
    console.error("❌ Không thể truy vấn do MongoDB chưa kết nối.");
    return;
  }

  try {
    const pendingOrders = await Order.find({
      $or: [
        { paymentMethod: "MoMo", status: "Chờ thanh toán" },
        { paymentMethod: "zalopay", status: "Chờ thanh toán" },
      ],
    });
    console.log(`🔎 Tìm thấy ${pendingOrders.length} đơn hàng cần kiểm tra.`);

    if (pendingOrders.length === 0) {
      console.log("✅ Không có đơn hàng nào cần kiểm tra.");
      return;
    }

    for (const order of pendingOrders) {
      console.log(`📦 Kiểm tra đơn hàng: ${order.orderId}`);

      try {
        if (order.paymentMethod === "MoMo") {
          const response = await axios.post(
            `${process.env.URL}/api/orders/momo/transaction`,
            {
              orderId: order.orderId,
            }
          );
          console.log(`🔍 Kết quả từ API MoMo:`, response.data);

          if (response.data.resultCode === 0) {
            if (!order.paymentDetails) {
              await Order.updateOne(
                { orderId: order.orderId },
                {
                  $set: {
                    status: "Đã thanh toán",
                    paymentDetails: {
                      momoTransactionId: response.data.transId,
                      responseData: response.data,
                    },
                  },
                }
              );
            }
            console.log(
              `✅ Đơn hàng ${order.orderId} đã thanh toán thành công!`
            );
          } else {
            if (response.data.resultCode === 1005) {
              await Order.updateOne(
                { orderId: order.orderId },
                { status: "Huỷ do quá thời gian thanh toán" }
              );
              console.log(
                `❌ Đơn hàng ${order.orderId} đã hết hạn thanh toán!`
              );
            } else {
              console.log(
                `🟡 Đơn hàng ${order.orderId} đang trong quá trình thanh toán!`
              );
            }
          }
        } else if (order.paymentMethod === "zalopay") {
          const response = await axios.post(
            `${process.env.URL}/api/orders/zalopay/transaction`,
            {
              app_trans_id: order.orderId,
            }
          );
          console.log(`🔍 Kết quả từ API ZaloPay:`, response.data);

          if (response.data.return_code === 1) {
            await Order.updateOne(
              { orderId: order.orderId },
              {
                $set: {
                  status: "Đã thanh toán",
                  paymentDetails: {
                    zalopayTransactionId: response.data.zp_trans_id,
                    responseData: response.data,
                  },
                },
              }
            );
            console.log(
              `✅ Đơn hàng ZaloPay ${order.orderId} đã thanh toán thành công!`
            );
          } else if (response.data.return_code === 3) {
            console.log(
              `🟡 Đơn hàng ZaloPay ${order.orderId} đang chờ thanh toán`
            );
          } else {
            console.log("kkkkkskkfdsksdfksdfk:", response.data.return_code);

            await Order.updateOne(
              { orderId: order.orderId },
              { status: "Huỷ do quá thời gian thanh toán" }
            );
            console.log(
              `❌ Đơn hàng ZaloPay ${order.orderId} đã hết hạn thanh toán!`
            );
          }
        }
      } catch (error) {
        console.error(
          `⚠️ Lỗi khi kiểm tra đơn hàng ${order.orderId}:`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error("⚠️ Lỗi khi truy vấn đơn hàng:", error.message);
  }
});
