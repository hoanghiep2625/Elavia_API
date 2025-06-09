import { Router } from "express";
import {
  login,
  register,
  info,
  logout,
  getShippingAddressMainByUserId,
  myInfo,
  changePassword,
  addShippingAddress,
  updateUserInfo,
  updateShippingAddress,
  getShippingById,
} from "../controllers/auth.js";
import { checkAuth } from "../middlewares/checkAuth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/info", checkAuth, info);
router.get("/shipping-address/:id", checkAuth, getShippingAddressMainByUserId);
router.get("/shipping-address-by-id/:id", checkAuth, getShippingById);
router.get("/my-info", checkAuth, myInfo);
router.put("/change-password", checkAuth, changePassword);
router.post("/add-shipping-address", checkAuth, addShippingAddress);
router.put("/update-user-info", checkAuth, updateUserInfo);
router.put(
  "/update-shipping-address/:addressId",
  checkAuth,
  updateShippingAddress
);

export default router;
