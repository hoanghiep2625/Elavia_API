import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const attributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // Ví dụ: "Chất liệu"
    slug: { type: String, required: true, unique: true }, // Ví dụ: "material"
    values: [{ type: String, required: true }], // VD: ["Cotton", "Lụa", "Denim"]
  },
  { timestamps: true, versionKey: false }
);
attributeSchema.plugin(mongoosePaginate);

export default mongoose.model("Attribute", attributeSchema);
