import Order from "../models/order.js";
import mongoose from "mongoose";

// API test để tạo đơn hàng fake để test hoàn tiền
export const createTestOrder = async (req, res) => {
  try {
    const { paymentMethod = "MoMo", amount = 100000 } = req.body;

    const testOrder = new Order({
      orderId: `TEST-${Date.now()}`,
      user: {
        _id: new mongoose.Types.ObjectId(),
        email: "test@example.com",
      },
      receiver: {
        type: "home",
        name: "Nguyễn Test",
        phone: "0123456789",
        address: "123 Test Street",
        cityName: "TP. Hồ Chí Minh",
        districtName: "Quận 1",
        wardName: "Phường Bến Nghé",
      },
      items: [
        {
          productVariantId: new mongoose.Types.ObjectId(),
          quantity: 1,
          size: "M",
          version: 1,
        },
      ],
      totalPrice: amount,
      shippingFee: 30000,
      discountAmount: 0,
      finalAmount: amount + 30000,
      paymentMethod: paymentMethod,
      paymentStatus: "Đã thanh toán", // Đánh dấu đã thanh toán để test hoàn tiền
      shippingStatus: "Đã xác nhận",
      paymentDetails: {
        refundRequested: false,
        refundProcessed: false,
      },
      statusHistory: [
        {
          type: "payment",
          from: "Chờ thanh toán",
          to: "Đã thanh toán",
          updatedAt: new Date(),
          note: "Test payment",
          isAutomatic: true,
        },
        {
          type: "shipping",
          from: "Chờ xác nhận",
          to: "Đã xác nhận",
          updatedAt: new Date(),
          note: "Test shipping",
          isAutomatic: true,
        },
      ],
    });

    await testOrder.save();

    return res.status(201).json({
      success: true,
      message: "Tạo đơn hàng test thành công",
      data: testOrder,
    });
  } catch (error) {
    console.error("❌ Error creating test order:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi tạo đơn hàng test",
      error: error.message,
    });
  }
};

// API test để hủy và hoàn tiền đơn hàng
export const testCancelAndRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason = "Test cancellation" } = req.body;

    // Tìm đơn hàng
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    // Gọi logic hủy đơn hàng
    const { cancelOrder } = await import("./order.js");

    // Tạo fake request object
    const fakeReq = {
      params: { orderId: orderId },
      body: { reason: reason },
      user: { _id: new mongoose.Types.ObjectId() },
    };

    const fakeRes = {
      status: (code) => ({
        json: (data) => {
          console.log(`Response ${code}:`, data);
          return res.status(code).json(data);
        },
      }),
    };

    return await cancelOrder(fakeReq, fakeRes);
  } catch (error) {
    console.error("❌ Error in test cancel and refund:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi test hủy và hoàn tiền",
      error: error.message,
    });
  }
};
