import ngrok from "@ngrok/ngrok";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import productRouter from "./routers/product.js";
import authRouter from "./routers/auth.js";
import categoryRouter from "./routers/categories.js";
import adminRouter from "./routers/admin.js";
import cookieParser from "cookie-parser";
import cartRouter from "./routers/cart.js";
import paymentRouter from "./routers/payment.js";
import productVariantRouter from "./routers/productVariant.js";
import recentlyViewed from "./routers/recentlyViewed.js";
import wishList from "./routers/wishList.js";
import attributeRouter from "./routers/attributes.js";
import siteSettingsRouter from "./routers/siteSettings.js";

dotenv.config();

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:5174",
      "http://localhost:5173",
      "https://elavia.tahoanghiep.com",
      "https://admin.elavia.tahoanghiep.com",
    ],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined!");
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🔗 Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  }
};

connectDB();
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

app.use("/api/products", productRouter);
app.use("/api/product-variants", productVariantRouter);
app.use("/api/auth", authRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/admin", adminRouter);
app.use("/api/cart", cartRouter);
app.use("/api/orders", paymentRouter);
app.use("/api/recently-viewed", recentlyViewed);
app.use("/api/wishlist", wishList);
app.use("/api/attributes", attributeRouter);
app.use("/api/site-settings", siteSettingsRouter);
// const PORT = 2625;
// app.listen(PORT, async () => {
//     console.log(`🚀 Server running at http://localhost:${PORT}`);

//     const listener = await ngrok.connect({
//         addr: PORT,
//         authtoken: process.env.NGROK_AUTHTOKEN,
//     });

//     console.log(`🌍 Ngrok URL: ${listener.url()}`);
// });

const PORT = process.env.PORT || 5175;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});

export { app };
