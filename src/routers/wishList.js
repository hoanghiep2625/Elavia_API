import { Router } from "express";
import {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
} from "../controllers/wishList.js";

import { checkAuth } from "../middlewares/checkAuth.js";

const router = Router();

router.use(checkAuth);

router.get("/", getWishlist);
router.post("/:productVariantId", addToWishlist);
router.post("/remove/:productVariantId", removeFromWishlist);
export default router;
