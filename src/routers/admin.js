import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  deleteProductBulkDelete,
  getProductById,
  getProducts,
  updateProduct,
} from "../controllers/product.js";
import {
  createProductVariant,
  updateProductVariant,
  deleteProductVariant,
  getProductVariants,
  getProductVariantById,
  getProductVariantsByProductId,
  deleteProductVariantBulkDelete,
} from "../controllers/productVariant.js";
import {
  createCategory,
  deleteCategory,
  getCategories,
  getCategoryById,
  updateCategory,
} from "../controllers/categories.js";

import { getListUser, getUserById, updateUser } from "../controllers/auth.js";
import {
  getAllAttributes,
  getAttribute,
  createAttribute,
  updateAttribute,
  deleteAttribute,
} from "../controllers/attributes.js";

import {
  checkAuthAdmin,
  getAdminProfile,
} from "../middlewares/checkAuthAdmin.js";
import {
  getAllOrders,
  getOrderById,
  getOrders,
  updateOrderStatus,
  getOrderStatusHistory,
  processRefund,
  getRefundRequests,
  checkRefundStatus,
  processManualRefund,
} from "../controllers/order.js";
import {
  replyReview,
  updateReply,
  deleteReply,
  deleteReview,
  getReviewsByOrder,
  getAllReviews,
  getReviewById,
  updateReviewStatus,
} from "../controllers/review.js";
import {
  getStats,
  getUserStats,
  getProductStats,
  getDashboardStats,
} from "../controllers/stats.js";
import {
  getSiteSettings,
  updateSiteSettings,
} from "../controllers/siteSettings.js";

import upload from "../middlewares/multer.js";

import {
  getVouchers,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  getVoucherById,
} from "../controllers/vocher.js";
import { get } from "mongoose";
const router = Router();

router.use(checkAuthAdmin);

router.post("/info", getAdminProfile);

router.get("/products", getProducts);
router.post("/products", createProduct);
router.delete("/products/bulk-delete", deleteProductBulkDelete);
router.delete("/products/:id", deleteProduct);
router.patch("/products/:id", updateProduct);
router.get("/products/:id", getProductById);

router.get("/users", getListUser);
router.get("/users/:id", getUserById);
router.patch("/users/:id", updateUser);

router.get("/categories", getCategories);
router.post("/categories", createCategory);
router.delete("/categories/:id", deleteCategory);
router.patch("/categories/:id", updateCategory);
router.get("/categories/:id", getCategoryById);

router.get("/variants", getProductVariants);
router.post("/variants", createProductVariant);
router.patch("/variants/:id", updateProductVariant);
router.delete("/variants/bulk-delete", deleteProductVariantBulkDelete);
router.delete("/variants/:id", deleteProductVariant);
router.get("/variants/:id", getProductVariantById);
router.get("/variants-product/:productId", getProductVariantsByProductId);

router.get("/orders/user/:userId", getOrders);
router.get("/orders/:orderId/status-history", getOrderStatusHistory);
router.get("/orders/:id", getOrderById);
router.get("/orders", getAllOrders);
router.patch("/orders/:id", updateOrderStatus);

// Routes cho hoàn tiền
router.get("/refunds", getRefundRequests);
router.patch("/refunds/:orderId", processRefund);
router.post("/refunds/:orderId/manual", processManualRefund);
router.get("/refunds/:orderId/status", checkRefundStatus);

router.get("/reviews", getAllReviews);
router.get("/reviews/:id", getReviewById);
router.put("/reviews/:id", updateReviewStatus);
router.delete("/reviews/:id", deleteReview);
router.put("/reviews/:id/reply", updateReply);
router.delete("/reviews/:id/reply", deleteReply);

router.get("/stats", getStats);
router.get("/stats/users", getUserStats);
router.get("/stats/products", getProductStats);
router.get("/dashboard", getDashboardStats);

router.post("/attributes", createAttribute);
router.patch("/attributes/:id", updateAttribute);
router.delete("/attributes/:id", deleteAttribute);
router.get("/attributes", getAllAttributes);
router.get("/attributes/:id", getAttribute);

router.get("/site-settings/singleton", getSiteSettings);
router.patch(
  "/site-settings/singleton",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "favicon", maxCount: 1 },
    { name: "banner02", maxCount: 1 },
    { name: "banner01", maxCount: 10 },
    { name: "banner03", maxCount: 10 },
  ]),
  updateSiteSettings
);
router.get("/vouchers", getVouchers);
router.get("/vouchers/:id", getVoucherById);
router.post("/vouchers", createVoucher);
router.patch("/vouchers/:id", updateVoucher);
router.delete("/vouchers/:id", deleteVoucher);

export default router;
