import { Router } from "express";
import { checkAuth } from "../middlewares/checkAuth.js";
import {
  createMomoPayment,
  callBackMomoPayment,
  transactionMomoPayment,
  createZalopayPayment,
  callBackZalopayPayment,
  transactionZalopayPayment,
} from "../controllers/collectionLink.js";
import {
  createOrder,
  cancelOrder,
  getOrderById,
  getOrders,
  getPendingPaymentOrders,
} from "../controllers/order.js";
const router = Router();
router.post("/", checkAuth, createOrder);
router.post("/cancel", checkAuth, cancelOrder);
router.get("/", checkAuth, getOrders);
router.get("/get-pending-payment-orders", checkAuth, getPendingPaymentOrders);
router.get("/:id", checkAuth, getOrderById);

router.post("/momo/create", createMomoPayment);
router.post("/momo/callback", callBackMomoPayment);
router.post("/momo/transaction", transactionMomoPayment);

router.post("/zalopay/create", createZalopayPayment);
router.post("/zalopay/callback", callBackZalopayPayment);
router.post("/zalopay/transaction", transactionZalopayPayment);
export default router;
