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
  verifyCode,
  resendCode,
  setDefaultAddress,
  deleteShippingAddress

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
router.put("/address/default/:id", checkAuth, setDefaultAddress);
router.delete("/address/:id", checkAuth, deleteShippingAddress);
router.put(
  "/update-shipping-address/:addressId",
  checkAuth,
  updateShippingAddress
);
router.post("/verify", verifyCode); 
router.post("/resend-code", resendCode);
export default router;