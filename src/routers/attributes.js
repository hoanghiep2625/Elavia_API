import { Router } from "express";
import {
  getAllAttributes,
  getAttribute
} from "../controllers/attributes.js";
import { checkAuth } from "../middlewares/checkAuth.js";

const router = Router();

router.use(checkAuth);

router.get("/", getAllAttributes);
router.get("/:id", getAttribute);

export default router;
