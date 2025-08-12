import { z } from "zod";

// Schema tạo mới
export const createVoucherSchema = z
  .object({
    code: z
      .string()
      .min(2, "Mã giảm giá cần tối thiểu 2 ký tự")
      .transform((val) => val.toUpperCase()), // Chuyển về uppercase để tránh duplicate
    description: z.string().optional(),
    type: z.enum(["fixed", "percent"]),
    value: z.number().min(0, "Giá trị giảm phải lớn hơn hoặc bằng 0"),
    minOrderValue: z.number().default(0),
    maxDiscount: z.number().optional(),
    quantity: z.number().default(1),
    expiresAt: z.coerce.date().optional(), // chuỗi ISO hoặc date đều được
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // Kiểm tra nếu type là percent thì value không được > 100
      if (data.type === "percent" && data.value > 100) {
        return false;
      }
      return true;
    },
    {
      message: "Giá trị phần trăm không được vượt quá 100%",
      path: ["value"],
    }
  );

// Schema cập nhật (cho PATCH / PUT)
export const updateVoucherSchema = z
  .object({
    code: z
      .string()
      .min(2, "Mã giảm giá cần tối thiểu 2 ký tự")
      .transform((val) => val.toUpperCase())
      .optional(),
    description: z.string().optional(),
    type: z.enum(["fixed", "percent"]).optional(),
    value: z
      .number()
      .min(0, "Giá trị giảm phải lớn hơn hoặc bằng 0")
      .optional(),
    minOrderValue: z.number().optional(),
    maxDiscount: z.number().optional(),
    quantity: z.number().optional(),
    expiresAt: z.coerce.date().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // Kiểm tra nếu type là percent thì value không được > 100
      if (data.type === "percent" && data.value && data.value > 100) {
        return false;
      }
      return true;
    },
    {
      message: "Giá trị phần trăm không được vượt quá 100%",
      path: ["value"],
    }
  );

// Schema áp dụng voucher
export const applyVoucherSchema = z.object({
  code: z
    .string()
    .min(2)
    .transform((val) => val.toUpperCase()), // Chuyển về uppercase để search
  userId: z.string().min(1),
  cartTotal: z.number().min(0),
});
