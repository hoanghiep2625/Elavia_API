import { z } from "zod";
import mongoose from "mongoose";

export const productSchema = z.object({
  name: z.string().min(2, "Tên sản phẩm cần tối thiểu 2 ký tự"),
  sku: z.string(),
  categoryId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "categoryId phải là ObjectId hợp lệ",
  }),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  representativeVariantId: z.string().nullable().optional(),
  status: z.boolean().optional(),
});

export const patchProductSchema = productSchema.partial();
