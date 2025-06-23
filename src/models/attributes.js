import mongoose from "mongoose";

const attributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // Ví dụ: "Chất liệu"
    slug: { type: String, required: true, unique: true }, // Ví dụ: "material"
    values: [{ type: String, required: true }], // VD: ["Cotton", "Lụa", "Denim"]
  },
  { timestamps: true, versionKey: false }
);

const Attribute = mongoose.model("Attribute", attributeSchema);
export default Attribute;
