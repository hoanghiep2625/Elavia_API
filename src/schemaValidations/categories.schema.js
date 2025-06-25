import { z } from "zod";
import mongoose from "mongoose";

export const categorySchema = z.object({
  name: z.string().min(2, "Tên danh mục cần tối thiểu 2 ký tự"),
  parentId: z
    .string()
    .refine((val) => val === null || mongoose.Types.ObjectId.isValid(val), {
      message: "parentId phải là ObjectId hợp lệ hoặc null",
    })
    .nullable()
    .optional(),
  level: z
    .number()
    .int()
    .min(1, "Cấp độ phải là số nguyên lớn hơn hoặc bằng 1")
    .max(3, "Cấp độ tối đa là 3"),
});

export const patchCategorySchema = categorySchema.partial();
