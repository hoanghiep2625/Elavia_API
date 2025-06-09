import { Router } from "express";
import {
  getCategories,
  getCategoryById,
  getParentCategories,
} from "../controllers/categories.js";

const router = Router();

router.get("/", getCategories);
router.get("/:id", getCategoryById);
router.get("/parent/:id", getParentCategories);

export default router;
