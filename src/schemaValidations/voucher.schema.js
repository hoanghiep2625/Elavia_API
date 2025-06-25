import { z } from "zod";

// Schema tạo mới
export const createVoucherSchema = z.object({
  code: z.string().min(2, "Mã giảm giá cần tối thiểu 2 ký tự"),
  description: z.string().optional(),
  type: z.enum(["fixed", "percent"]),
  value: z.number().min(0, "Giá trị giảm phải lớn hơn hoặc bằng 0"),
  minOrderValue: z.number().default(0),
  maxDiscount: z.number().optional(),
  quantity: z.number().default(1),
  expiresAt: z.coerce.date().optional(), // chuỗi ISO hoặc date đều được
  isActive: z.boolean().default(true),
});

// Schema cập nhật (cho PATCH / PUT)
export const updateVoucherSchema = createVoucherSchema.partial();

// Schema áp dụng voucher
export const applyVoucherSchema = z.object({
  code: z.string().min(2),
  userId: z.string().min(1),
  cartTotal: z.number().min(0),
});
