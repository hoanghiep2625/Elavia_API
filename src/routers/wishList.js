import { Router } from "express";
import { checkAuth } from "../middlewares/checkAuth.js";
import {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
} from "../controllers/wishList.js";
const router = Router();

router.get("/", checkAuth, getWishlist);
router.post("/:productVariantId", checkAuth, addToWishlist);
router.post("/remove/:productVariantId", checkAuth, removeFromWishlist);
export default router;
