import { Router } from "express";
import { login, register, info, logout } from "../controllers/auth.js";
import { checkAuth } from "../middlewares/checkAuth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/info", checkAuth, info);

export default router;
