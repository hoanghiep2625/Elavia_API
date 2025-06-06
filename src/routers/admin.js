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
  checkAuthAdmin,
  getAdminProfile,
} from "../middlewares/checkAuthAdmin.js";

import { getListUser, getUserById } from "../controllers/auth.js";

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

router.get("/variants", getProductVariants);
router.post("/variants", createProductVariant);
router.patch("/variants/:id", updateProductVariant);
router.delete("/variants/:id", deleteProductVariant);
router.get("/variants/:id", getProductVariantById);

export default router;
