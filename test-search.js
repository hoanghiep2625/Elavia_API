import mongoose from "mongoose";
import ProductVariant from "./src/models/productVariant.js";

// Connect to MongoDB
await mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/elavia"
);

console.log("🔗 Connected to MongoDB");

// Test query với new schema
const query = {
  status: true,
  sizes: {
    $elemMatch: {
      stock: { $gt: 0 },
      price: { $gte: 50000, $lte: 2000000 },
      size: { $in: ["S", "M"] },
    },
  },
};

console.log("Testing query:", JSON.stringify(query, null, 2));

try {
  const results = await ProductVariant.find(query)
    .limit(3)
    .populate("productId", "name");

  console.log(`✅ Found ${results.length} results`);

  results.forEach((item, index) => {
    console.log(`\n${index + 1}. ${item.productId?.name || "No name"}`);
    console.log(`   - Color: ${item.color?.baseColor || "N/A"}`);
    console.log(
      `   - Sizes available:`,
      item.sizes?.map((s) => `${s.size} (${s.stock} pcs, $${s.price})`)
    );
  });
} catch (error) {
  console.error("❌ Error:", error.message);
} finally {
  await mongoose.disconnect();
  console.log("\n✅ Test completed");
}
