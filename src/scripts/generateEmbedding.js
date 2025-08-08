import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import mongoose from "mongoose";
import ProductVariant from "../models/productVariant.js";
import "../models/product.js";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({
  model: "text-embedding-004",
});

await mongoose.connect(process.env.MONGO_URI);
console.log("✅ Connected to DB");

async function generateText(variant) {
  await variant.populate("productId");
  const p = variant.productId;
  return `
Tên: ${p?.name || ""}
Mô tả: ${p?.description || ""}
Giá: ${variant.price}₫
Màu: ${variant.color.colorName}
Size: ${variant.sizes.map((s) => s.size).join(", ")}
`.trim();
}

async function run() {
  const variants = await ProductVariant.find();
  for (const v of variants) {
    const text = await generateText(v);
    const embedding = (await embeddingModel.embedContent(text)).embedding
      .values;
    v.embedding = embedding;
    await v.save();
    console.log(`🔹 Saved embedding for ${v.sku}`);
  }
  console.log("🎯 Done");
  process.exit();
}

run();
