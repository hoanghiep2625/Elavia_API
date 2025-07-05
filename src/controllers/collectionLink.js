import Order from "../models/order.js";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import CryptoJS from "crypto-js";
import Voucher from "../models/vocher.js";
import { getShippingFeeOrder } from "../controllers/shippingFee.js";
dotenv.config();

// ZaloPay Configuration
const zalopayConfig = {
  app_id: process.env.ZALOPAY_APP_ID,
  key1: process.env.ZALOPAY_KEY1,
  key2: process.env.ZALOPAY_KEY2,
  endpoint: process.env.ZALOPAY_ENDPOINT,
};

/**
 * Tạo thanh toán MoMo
 * Sau khi tạo đơn hàng (với paymentMethod = 'MoMo'), gọi API MoMo để lấy paymentUrl.
 */
export const createMomoPayment = async (req, res) => {
  try {
    const {
      orderId,
      items,
      totalPrice,
      receiver,
      voucherCode = "",
      orderInfo = "",
      extraData = "",
      orderGroupId = "",
    } = req.body;

    // Validate cơ bản
    if (
      !orderId ||
      !items ||
      !Array.isArray(items) ||
      items.length === 0 ||
      !receiver
    ) {
      return res
        .status(400)
        .json({ message: "Thiếu thông tin tạo đơn hàng MoMo" });
    }

    // 1. Tính phí vận chuyển
    const shippingFee = await getShippingFeeOrder(receiver);

    // 2. Tính discount nếu có
    let discountAmount = 0;
    if (voucherCode) {
      const voucher = await Voucher.findOne({ code: voucherCode });
      if (
        voucher &&
        voucher.isActive &&
        (!voucher.expiresAt || new Date(voucher.expiresAt) > new Date()) &&
        voucher.quantity > 0 &&
        totalPrice >= (voucher.minOrderValue || 0)
      ) {
        if (voucher.type === "percent") {
          discountAmount = (totalPrice * voucher.value) / 100;
          if (voucher.maxDiscount) {
            discountAmount = Math.min(discountAmount, voucher.maxDiscount);
          }
        } else if (voucher.type === "fixed") {
          discountAmount = voucher.value;
        }
      }
    }

    // 3. Tính số tiền cuối cùng
    const amount = totalPrice + shippingFee - discountAmount;
    if (amount <= 0) {
      return res
        .status(400)
        .json({ message: "Tổng tiền thanh toán không hợp lệ" });
    }

    // 4. Tạo chữ ký MoMo
    const accessKey = process.env.MOMO_ACCESSKEY;
    const secretKey = process.env.MOMO_SECRETKEY;
    const partnerCode = process.env.MOMO_PARTNER_CODE;
    const redirectUrl = `${process.env.MOMO_REDIRECT_URL}`;
    const ipnUrl = `${process.env.URL}/api/orders/momo/callback`;
    const requestType = "payWithMethod";
    const requestId = orderId;

    const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;

    const signature = crypto
      .createHmac("sha256", secretKey)
      .update(rawSignature)
      .digest("hex");

    const requestBody = {
      partnerCode,
      partnerName: "Test",
      storeId: "MomoTestStore",
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
      lang: "vi",
      requestType,
      autoCapture: true,
      extraData,
      orderGroupId,
      signature,
    };
    console.log("👉 DEBUG MoMo", {
      accessKey,
      secretKey,
      partnerCode,
      redirectUrl,
      ipnUrl,
      rawSignature,
      signature,
    });

    const response = await axios.post(
      "https://test-payment.momo.vn/v2/gateway/api/create",
      requestBody,
      { headers: { "Content-Type": "application/json" } }
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error(
      "Error in createMomoPayment:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      message: "Lỗi tạo thanh toán MoMo",
      error: error.response?.data || error.message,
    });
  }
};

/**
 * Callback từ MoMo khi có kết quả thanh toán
 * MoMo sẽ gửi dữ liệu về endpoint này
 */
export const callBackMomoPayment = async (req, res) => {
  try {
    console.log("MoMo Callback Data:", req.body);
    const { orderId, resultCode, transId, orderStatus, message } = req.body;
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (resultCode === 0) {
      order.status = "Đã thanh toán";
      order.paymentDetails = {
        momoTransactionId: transId,
        responseData: req.body,
      };
    } else {
      order.status = "Huỷ do quá thời gian thanh toán";
      order.paymentDetails = {
        momoTransactionId: transId,
        responseData: req.body,
      };
    }
    await order.save();
    return res
      .status(200)
      .json({ message: "Order updated after MoMo callback", order });
  } catch (error) {
    console.error("Error in callBackMomoPayment:", error);
    return res.status(500).json({
      message: "Error processing MoMo callback",
      error: error.message,
    });
  }
};

export const transactionMomoPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const rawSignature = `accessKey=${process.env.MOMO_ACCESSKEY}&orderId=${orderId}&partnerCode=${process.env.MOMO_PARTNER_CODE}&requestId=${orderId}`;
    const signature = crypto
      .createHmac("sha256", process.env.MOMO_SECRETKEY)
      .update(rawSignature)
      .digest("hex");

    const requestBody = JSON.stringify({
      partnerCode: process.env.MOMO_PARTNER_CODE,
      requestId: orderId,
      orderId,
      signature,
      lang: "vi",
    });

    const options = {
      method: "POST",
      url: "https://test-payment.momo.vn/v2/gateway/api/query",
      headers: { "Content-Type": "application/json" },
      data: requestBody,
    };

    let result = await axios(options);
    return res.status(200).json(result.data);
  } catch (error) {
    console.error(
      "Error in transactionMomoPayment:",
      error.response ? error.response.data : error.message
    );
    return res.status(500).json({
      message: "Error checking MoMo transaction",
      error: error.response ? error.response.data : error.message,
    });
  }
};

/**
 * Tạo thanh toán ZaloPay
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const createZalopayPayment = async (req, res) => {
  try {
    const {
      orderId,
      receiver,
      items,
      totalPrice,
      voucherCode,
      orderInfo = "",
    } = req.body;

    // Validate bắt buộc
    if (!orderId || !receiver || !items || !totalPrice) {
      return res.status(400).json({ message: "Thiếu thông tin đơn hàng" });
    }

    // Tính phí vận chuyển
    const shippingFee = await getShippingFeeOrder(receiver);

    // Tính giảm giá nếu có mã voucher
    let discountAmount = 0;
    if (voucherCode) {
      const voucher = await Voucher.findOne({ code: voucherCode });
      if (!voucher)
        return res.status(400).json({ message: "Mã giảm giá không hợp lệ" });
      if (!voucher.isActive || voucher.expiresAt < new Date())
        return res
          .status(400)
          .json({ message: "Voucher không hợp lệ hoặc đã hết hạn" });
      if (voucher.minOrderValue && totalPrice < voucher.minOrderValue)
        return res
          .status(400)
          .json({ message: "Không đủ điều kiện dùng voucher" });

      // Tính giảm giá
      if (voucher.type === "percent") {
        discountAmount = Math.min(
          (voucher.value / 100) * totalPrice,
          voucher.maxDiscount || Infinity
        );
      } else if (voucher.type === "fixed") {
        discountAmount = voucher.value;
      }
    }

    const finalAmount = totalPrice + shippingFee - discountAmount;
    if (finalAmount <= 0) {
      return res.status(400).json({ message: "Tổng tiền không hợp lệ" });
    }

    // Chuẩn bị dữ liệu ZaloPay
    const embed_data = {
      redirecturl: `${process.env.ZALOPAY_REDIRECT_URL}/${orderId}`,
    };

    const transID = orderId;
    const app_time = Date.now();
    const order = {
      app_id: zalopayConfig.app_id,
      app_trans_id: transID,
      app_user: transID,
      app_time,
      item: JSON.stringify([]), // hoặc truyền sản phẩm nếu muốn
      embed_data: JSON.stringify(embed_data),
      amount: finalAmount,
      callback_url: `${process.env.URL}/api/orders/zalopay/callback`,
      description: orderInfo || `Payment for order #${transID}`,
      bank_code: "",
    };

    const data =
      `${order.app_id}|${order.app_trans_id}|${order.app_user}|` +
      `${order.amount}|${order.app_time}|${order.embed_data}|${order.item}`;

    order.mac = CryptoJS.HmacSHA256(data, zalopayConfig.key1).toString();

    const result = await axios.post(zalopayConfig.endpoint, null, {
      params: order,
    });

    return res.status(200).json(result.data);
  } catch (error) {
    console.error("Error in createZalopayPayment:", error);
    return res.status(500).json({
      message: "Error creating ZaloPay payment",
      error: error.message,
    });
  }
};

/**
 * Callback từ ZaloPay khi có kết quả thanh toán
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const callBackZalopayPayment = async (req, res) => {
  let result = {};
  try {
    const { data: dataStr, mac: reqMac } = req.body;
    const mac = CryptoJS.HmacSHA256(dataStr, zalopayConfig.key2).toString();

    if (reqMac !== mac) {
      result.return_code = -1;
      result.return_message = "mac not equal";
    } else {
      const dataJson = JSON.parse(dataStr);
      const order = await Order.findOne({ orderId: dataJson.app_trans_id });

      if (order) {
        order.status = "Đã thanh toán";
        order.paymentDetails = {
          zalopayTransactionId: dataJson.zp_trans_id,
          responseData: dataJson,
        };
        await order.save();
      }

      result.return_code = 1;
      result.return_message = "success";
    }
  } catch (error) {
    console.error("Error in callBackZalopayPayment:", error);
    result.return_code = 0;
    result.return_message = error.message;
  }

  res.json(result);
};

/**
 * Kiểm tra trạng thái đơn hàng ZaloPay
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const transactionZalopayPayment = async (req, res) => {
  try {
    const { app_trans_id } = req.body;
    const postData = {
      app_id: zalopayConfig.app_id,
      app_trans_id,
    };

    const data = `${postData.app_id}|${postData.app_trans_id}|${zalopayConfig.key1}`;
    postData.mac = CryptoJS.HmacSHA256(data, zalopayConfig.key1).toString();

    const result = await axios.post(
      "https://sb-openapi.zalopay.vn/v2/query",
      null,
      {
        params: postData,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return res.status(200).json(result.data);
  } catch (error) {
    console.error("Error in checkZalopayOrderStatus:", error);
    return res.status(500).json({
      message: "Error checking ZaloPay order status",
      error: error.message,
    });
  }
};
