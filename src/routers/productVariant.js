import { Router } from "express";
import {
  getProductVariants,
  getProductVariantById,
  getColorsByProductVariantId,
  getColorsByProductId,
} from "../controllers/productVariant.js";
import { getRecentlyViewedProducts } from "../controllers/productVariant.js";
import { checkAuth } from "../middlewares/checkAuth.js";

const router = Router();

router.get("/", getProductVariants);
router.get("/recently-viewed", checkAuth, getRecentlyViewedProducts);
router.get("/colors-variant/:id", getColorsByProductVariantId);
router.post("/colors-product/:id", getColorsByProductId);
router.get("/:id", getProductVariantById);

export default router;
