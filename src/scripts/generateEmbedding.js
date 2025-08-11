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

  // Tạo text phong phú hơn với attributes
  const attributesText = variant.attributes
    .map((attr) => `${attr.attribute}: ${attr.value}`)
    .join(", ");

  const sizesText = variant.sizes
    .map((s) => `Size ${s.size}: ${s.price.toLocaleString()}₫ (${s.stock} sp)`)
    .join(", ");

  const priceRange =
    variant.sizes.length > 1
      ? `${Math.min(
          ...variant.sizes.map((s) => s.price)
        ).toLocaleString()}₫ - ${Math.max(
          ...variant.sizes.map((s) => s.price)
        ).toLocaleString()}₫`
      : `${variant.sizes[0]?.price?.toLocaleString() || 0}₫`;

  return `
Sản phẩm: ${p?.name || ""}
Mô tả: ${p?.description?.replace(/<[^>]*>/g, "") || p?.shortDescription || ""}
Giá: ${priceRange}
Màu sắc: ${variant.color.colorName} (${variant.color.baseColor})
Kích thước: ${variant.sizes.map((s) => s.size).join(", ")}
Thuộc tính: ${attributesText}
SKU: ${variant.sku}
Chi tiết giá theo size: ${sizesText}
Loại: thời trang, quần áo
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
