import express from "express";
import { searchSuggestions } from "../controllers/ai.js";

const router = express.Router();

router.post("/search-suggestions", searchSuggestions);

export default router;
