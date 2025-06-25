import { Router } from "express";
import {
  getVouchers,
  applyVoucher,
  getVoucherById,
} from "../controllers/vocher.js";
import { checkAuth } from "../middlewares/checkAuth.js";

const router = Router();

router.use(checkAuth);

router.get("/", getVouchers);
router.get("/vouchers/:id", getVoucherById);
router.post("/apply", applyVoucher);

export default router;
