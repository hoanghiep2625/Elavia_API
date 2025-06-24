import { Router } from "express";
import {
  getSiteSettings
} from "../controllers/siteSettings.js";

const router = Router();

// Route to get site settings
router.get("/", getSiteSettings);

export default router;
