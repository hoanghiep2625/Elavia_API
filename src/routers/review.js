import { Router } from "express";
import { checkAuth } from "../middlewares/checkAuth.js";
import { createReview, getReviewsByProductVariant } from "../controllers/review.js";

const router = Router();

router.use(checkAuth);

router.post("/", createReview);
router.get("/:productVariantId", getReviewsByProductVariant);

export default router;
