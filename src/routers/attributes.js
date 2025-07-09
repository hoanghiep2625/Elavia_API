import { Router } from "express";
import { getAllAttributes, getAttribute } from "../controllers/attributes.js";

const router = Router();

router.get("/", getAllAttributes);
router.get("/:id", getAttribute);

export default router;
