import express from "express";
import {
  createTestOrder,
  testCancelAndRefund,
} from "../controllers/testRefund.js";

const router = express.Router();

// API để tạo đơn hàng test
router.post("/create-test-order", createTestOrder);

// API để test hủy và hoàn tiền
router.post("/cancel-and-refund/:orderId", testCancelAndRefund);

export default router;
