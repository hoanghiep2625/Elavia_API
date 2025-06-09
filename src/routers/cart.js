import { Router } from "express";
import {
  addToCart,
  removeFromCart,
  updateCartQuantity,
  getCart,
  clearCart,
  getCartQuantity,
} from "../controllers/cart.js";
import { checkAuth } from "../middlewares/checkAuth.js";
const router = Router();

router.post("/add", checkAuth, addToCart);
router.post("/remove", checkAuth, removeFromCart);
router.put("/update", checkAuth, updateCartQuantity);
router.get("/", checkAuth, getCart);
router.get("/clear", checkAuth, clearCart);
router.get("/quantity", checkAuth, getCartQuantity);

export default router;
