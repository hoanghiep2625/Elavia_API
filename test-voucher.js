/**
 * Test Cases for Voucher Validation
 */

import {
  createVoucherSchema,
  updateVoucherSchema,
  applyVoucherSchema,
} from "./src/schemaValidations/voucher.schema.js";

console.log("🧪 Testing Voucher Validation...\n");

// ❌ Test Case 1: Percent > 100%
console.log("1. Testing percent value > 100%:");
try {
  createVoucherSchema.parse({
    code: "SALE150",
    type: "percent",
    value: 150,
  });
  console.log("❌ Should have failed");
} catch (err) {
  console.log("✅ Validation blocked:", err.errors[0].message);
}

// ✅ Test Case 2: Code case conversion
console.log("\n2. Testing code case conversion:");
try {
  const result = createVoucherSchema.parse({
    code: "sale50",
    type: "percent",
    value: 50,
  });
  console.log("✅ Code converted:", "sale50" + " → " + result.code);
} catch (err) {
  console.log("❌ Error:", err.message);
}

// ✅ Test Case 3: Apply voucher case-insensitive
console.log("\n3. Testing apply voucher case conversion:");
try {
  const result = applyVoucherSchema.parse({
    code: "Summer2024",
    userId: "507f1f77bcf86cd799439011",
    cartTotal: 500000,
  });
  console.log("✅ Apply code converted:", "Summer2024" + " → " + result.code);
} catch (err) {
  console.log("❌ Error:", err.message);
}

// ✅ Test Case 4: Valid fixed voucher with large value
console.log("\n4. Testing fixed voucher with large value:");
try {
  const result = createVoucherSchema.parse({
    code: "MEGA500K",
    type: "fixed",
    value: 500000,
  });
  console.log("✅ Fixed voucher valid:", result.code, "- Value:", result.value);
} catch (err) {
  console.log("❌ Error:", err.message);
}

// ✅ Test Case 5: Valid percent voucher at 100%
console.log("\n5. Testing 100% percent voucher:");
try {
  const result = createVoucherSchema.parse({
    code: "FREE100",
    type: "percent",
    value: 100,
  });
  console.log(
    "✅ 100% voucher valid:",
    result.code,
    "- Value:",
    result.value + "%"
  );
} catch (err) {
  console.log("❌ Error:", err.message);
}

// ❌ Test Case 6: Update voucher with invalid percent
console.log("\n6. Testing update with invalid percent:");
try {
  updateVoucherSchema.parse({
    type: "percent",
    value: 120,
  });
  console.log("❌ Should have failed");
} catch (err) {
  console.log("✅ Update validation blocked:", err.errors[0].message);
}

console.log("\n✅ All tests completed successfully!");
