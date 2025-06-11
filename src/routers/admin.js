import { Router } from "express";
import {
  createProduct,
  deleteProduct,
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
  checkAuthAdmin,
  getAdminProfile,
} from "../middlewares/checkAuthAdmin.js";
import { getAllOrders, getOrderById, getOrders } from "../controllers/order.js";
import {
  getStats,
  getUserStats,
  getProductStats,
} from "../controllers/stats.js";

const router = Router();

router.use(checkAuthAdmin);

router.post("/info", getAdminProfile);

router.get("/products", getProducts);
router.post("/products", createProduct);
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
router.delete("/variants/:id", deleteProductVariant);
router.get("/variants/:id", getProductVariantById);

router.get("/orders/:userId", getOrders); //lấy order của user
router.get("/orders", getAllOrders);
router.get("/orders/:id", getOrderById);

router.get("/stats", getStats);
router.get("/stats/users", getUserStats);
router.get("/stats/products", getProductStats);

export default router;
