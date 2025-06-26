import { Router } from "express";
import {
  addToCart,
  removeFromCart,
  updateCartQuantity,
  getCart,
  clearCart,
  getCartQuantity,
  updateCart,
} from "../controllers/cart.js";
import { checkAuth } from "../middlewares/checkAuth.js";

const router = Router();

router.use(checkAuth);

router.post("/add", addToCart);
router.post("/remove", removeFromCart);
router.post("/update", updateCart);
router.put("/update", updateCartQuantity);
router.get("/", getCart);
router.get("/clear", clearCart);
router.get("/quantity", getCartQuantity);

export default router;
