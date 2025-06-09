import { Router } from "express";
import { checkAuth } from "../middlewares/checkAuth.js";
import { addRecentlyViewedProduct } from "../controllers/recentlyViewed.js";
const router = Router();

router.post(
  "/products/:productVariantId/view",
  checkAuth,
  addRecentlyViewedProduct
);
export default router;
