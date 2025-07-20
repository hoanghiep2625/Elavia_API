import { Router } from "express";
import { checkAuth } from "../middlewares/checkAuth.js";
import { createReview, getReviewsByProductVariant, updateReview, deleteReview, getReviewsByOrder } from "../controllers/review.js";

const router = Router();

router.use(checkAuth);

router.post("/",checkAuth, createReview);
router.get("/", getReviewsByOrder);
router.get("/:productVariantId", getReviewsByProductVariant);
router.patch("/:id", checkAuth, updateReview);
router.delete("/:id", checkAuth, deleteReview);

export default router;
