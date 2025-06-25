import { z } from "zod";
import mongoose from "mongoose";

export const productVariantSchema = z.object({
  productId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "productId phải là ObjectId hợp lệ",
  }),
  sku: z.string(),
  price: z.number().min(0, "Giá phải lớn hơn hoặc bằng 0"),
  color: z.object({
    baseColor: z.string(),
    actualColor: z.string(),
    colorName: z.string(),
  }),
  attributes: z.array(
    z.object({
      attribute: z.string(), // slug của Attribute (VD: "material")
      value: z.string(), // VD: "Cotton"
    })
  ),
  sizes: z.array(
    z.object({
      size: z.enum(["S", "M", "L", "XL", "XXL"]),
      stock: z.number().min(0),
    })
  ),
  status: z.boolean().optional(), // true = active, false = inactive
});

export const patchProductVariantSchema = productVariantSchema.partial();
