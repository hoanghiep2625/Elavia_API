import { Router } from "express";
import {
  getProductVariants,
  getProductVariantById,
  getColorsByProductVariantId,
  getColorsByProductId,
  getRelatedVariantsByVariant,
  getAllUniqueProductsFromVariants,
  getVariantByColor,
  getAllRepresentativeVariants,
} from "../controllers/productVariant.js";
import { getRecentlyViewedProducts } from "../controllers/productVariant.js";
import { checkAuth } from "../middlewares/checkAuth.js";

const router = Router();

router.get("/", getProductVariants);
router.get("/recently-viewed", checkAuth, getRecentlyViewedProducts);
router.get("/colors-variant/:id", getColorsByProductVariantId);
router.post("/colors-product/:id", getColorsByProductId);
router.get("/:variantId/related-variants", getRelatedVariantsByVariant);
router.get("/representativeVariant", getAllRepresentativeVariants);
router.get("/products-unique", getAllUniqueProductsFromVariants);
router.post("/by-color", getVariantByColor);
router.get("/:id", getProductVariantById);

export default router;
