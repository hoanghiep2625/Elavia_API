import crypto from "crypto";
import axios from "axios";

// MoMo Refund Configuration
const MOMO_CONFIG = {
  partnerCode: process.env.MOMO_PARTNER_CODE,
  accessKey: process.env.MOMO_ACCESS_KEY,
  secretKey: process.env.MOMO_SECRET_KEY,
  endpoint: process.env.MOMO_ENDPOINT || "https://test-payment.momo.vn", // Sandbox
  // endpoint: "https://payment.momo.vn", // Production
};

// ZaloPay Refund Configuration
const ZALOPAY_CONFIG = {
  appId: process.env.ZALOPAY_APP_ID,
  key1: process.env.ZALOPAY_KEY1,
  key2: process.env.ZALOPAY_KEY2,
  endpoint: process.env.ZALOPAY_ENDPOINT || "https://sb-openapi.zalopay.vn", // Sandbox
  // endpoint: "https://openapi.zalopay.vn", // Production
};

/**
 * Tạo chữ ký MoMo cho refund
 */
const createMoMoRefundSignature = (requestId, orderId, amount, transId) => {
  if (!MOMO_CONFIG.secretKey) {
    throw new Error("MoMo secret key không được cấu hình");
  }

  const rawSignature = `accessKey=${MOMO_CONFIG.accessKey}&amount=${amount}&description=Refund for order ${orderId}&orderId=${orderId}&partnerCode=${MOMO_CONFIG.partnerCode}&requestId=${requestId}&transId=${transId}`;
  return crypto
    .createHmac("sha256", MOMO_CONFIG.secretKey)
    .update(rawSignature)
    .digest("hex");
};

/**
 * Tạo chữ ký ZaloPay cho refund
 */
const createZaloPayRefundSignature = (data) => {
  if (!ZALOPAY_CONFIG.key1) {
    throw new Error("ZaloPay key1 không được cấu hình");
  }

  const hmac = crypto.createHmac("sha256", ZALOPAY_CONFIG.key1);
  hmac.update(data);
  return hmac.digest("hex");
};

/**
 * Hoàn tiền qua MoMo API
 */
export const refundMoMo = async (order, refundAmount = null) => {
  try {
    // Kiểm tra môi trường test - simulate hoàn tiền thành công
    const isTestEnvironment =
      MOMO_CONFIG.endpoint?.includes("test-payment.momo.vn") ||
      process.env.NODE_ENV === "development" ||
      order.orderId?.startsWith("TEST-");

    if (isTestEnvironment && !order.paymentDetails?.momoTransactionId) {
      // Simulate thành công trong test environment
      console.log("🧪 TEST MODE: Simulating MoMo refund success");
      return {
        success: true,
        refundId: `REFUND_TEST_${Date.now()}`,
        message: "Test refund simulation successful",
        amount: refundAmount || order.finalAmount,
        timestamp: new Date().toISOString(),
      };
    }

    // Validate required data cho production
    if (!order.paymentDetails?.momoTransactionId) {
      throw new Error("Không tìm thấy mã giao dịch MoMo");
    }

    const amount = refundAmount || order.finalAmount;
    const requestId = `${order.orderId}_REFUND_${Date.now()}`;
    const transId = order.paymentDetails.momoTransactionId;

    // Tạo chữ ký
    const signature = createMoMoRefundSignature(
      requestId,
      order.orderId,
      amount,
      transId
    );

    const requestBody = {
      partnerCode: MOMO_CONFIG.partnerCode,
      requestId,
      orderId: order.orderId,
      amount,
      transId,
      lang: "vi",
      description: `Hoàn tiền đơn hàng ${order.orderId}`,
      signature,
    };

    console.log("🔄 MoMo Refund Request:", {
      ...requestBody,
      signature: "***HIDDEN***",
    });

    const response = await axios.post(
      `${MOMO_CONFIG.endpoint}/v2/gateway/api/refund`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30s timeout
      }
    );

    console.log("✅ MoMo Refund Response:", response.data);

    return {
      success: response.data.resultCode === 0,
      resultCode: response.data.resultCode,
      message: response.data.message,
      refundId: response.data.refundId,
      data: response.data,
    };
  } catch (error) {
    console.error(
      "❌ MoMo Refund Error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data || error.message,
      message: "Lỗi khi gọi API hoàn tiền MoMo",
    };
  }
};

/**
 * Hoàn tiền qua ZaloPay API
 */
export const refundZaloPay = async (order, refundAmount = null) => {
  try {
    // Kiểm tra môi trường test - simulate hoàn tiền thành công
    const isTestEnvironment =
      ZALOPAY_CONFIG.endpoint?.includes("sb-openapi.zalopay.vn") ||
      process.env.NODE_ENV === "development" ||
      order.orderId?.startsWith("TEST-");

    if (isTestEnvironment && !order.paymentDetails?.zalopayTransactionId) {
      // Simulate thành công trong test environment
      console.log("🧪 TEST MODE: Simulating ZaloPay refund success");
      return {
        success: true,
        refundId: `REFUND_ZALO_TEST_${Date.now()}`,
        message: "Test refund simulation successful",
        amount: refundAmount || order.finalAmount,
        timestamp: new Date().toISOString(),
      };
    }

    // Validate required data cho production
    if (!order.paymentDetails?.zalopayTransactionId) {
      throw new Error("Không tìm thấy mã giao dịch ZaloPay");
    }

    const amount = refundAmount || order.finalAmount;
    const timestamp = Date.now();
    const uid = `${timestamp}${Math.floor(111 + Math.random() * 999)}`; // unique id

    const data = `${ZALOPAY_CONFIG.appId}|${order.paymentDetails.zalopayTransactionId}|${amount}|Hoàn tiền đơn hàng ${order.orderId}|${timestamp}`;
    const mac = createZaloPayRefundSignature(data);

    const requestBody = {
      app_id: ZALOPAY_CONFIG.appId,
      zp_trans_id: order.paymentDetails.zalopayTransactionId,
      amount,
      description: `Hoàn tiền đơn hàng ${order.orderId}`,
      timestamp,
      uid,
      mac,
    };

    console.log("🔄 ZaloPay Refund Request:", {
      ...requestBody,
      mac: "***HIDDEN***",
    });

    const response = await axios.post(
      `${ZALOPAY_CONFIG.endpoint}/v2/refund`,
      new URLSearchParams(requestBody),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 30000, // 30s timeout
      }
    );

    console.log("✅ ZaloPay Refund Response:", response.data);

    return {
      success: response.data.return_code === 1,
      returnCode: response.data.return_code,
      message: response.data.return_message,
      refundId: response.data.refund_id,
      data: response.data,
    };
  } catch (error) {
    console.error(
      "❌ ZaloPay Refund Error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data || error.message,
      message: "Lỗi khi gọi API hoàn tiền ZaloPay",
    };
  }
};

/**
 * Kiểm tra trạng thái hoàn tiền MoMo
 */
export const checkMoMoRefundStatus = async (requestId) => {
  try {
    const signature = crypto
      .createHmac("sha256", MOMO_CONFIG.secretKey)
      .update(
        `accessKey=${MOMO_CONFIG.accessKey}&orderId=${requestId}&partnerCode=${MOMO_CONFIG.partnerCode}&requestId=${requestId}`
      )
      .digest("hex");

    const requestBody = {
      partnerCode: MOMO_CONFIG.partnerCode,
      requestId,
      orderId: requestId,
      signature,
      lang: "vi",
    };

    const response = await axios.post(
      `${MOMO_CONFIG.endpoint}/v2/gateway/api/refund/query`,
      requestBody
    );

    return {
      success: response.data.resultCode === 0,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ MoMo Refund Status Check Error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Kiểm tra trạng thái hoàn tiền ZaloPay
 */
export const checkZaloPayRefundStatus = async (refundId) => {
  try {
    const timestamp = Date.now();
    const data = `${ZALOPAY_CONFIG.appId}|${refundId}|${timestamp}`;
    const mac = createZaloPayRefundSignature(data);

    const requestBody = {
      app_id: ZALOPAY_CONFIG.appId,
      refund_id: refundId,
      timestamp,
      mac,
    };

    const response = await axios.post(
      `${ZALOPAY_CONFIG.endpoint}/v2/refund/status`,
      new URLSearchParams(requestBody)
    );

    return {
      success: response.data.return_code === 1,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ ZaloPay Refund Status Check Error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Hàm chính để xử lý hoàn tiền tự động
 */
export const processAutoRefund = async (order, refundAmount = null) => {
  try {
    let result;

    switch (order.paymentMethod) {
      case "MoMo":
        result = await refundMoMo(order, refundAmount);
        break;
      case "zalopay":
        result = await refundZaloPay(order, refundAmount);
        break;
      default:
        throw new Error(
          `Phương thức thanh toán ${order.paymentMethod} không hỗ trợ hoàn tiền tự động`
        );
    }

    return result;
  } catch (error) {
    console.error("❌ Auto Refund Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};
