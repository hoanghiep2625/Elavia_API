import { z } from "zod";

export const attributeSchema = z.object({
  name: z.string().min(2, "Tên thuộc tính cần tối thiểu 2 ký tự"),
  values: z
    .array(z.string().min(1, "Giá trị không được để trống"))
    .min(1, "Cần ít nhất một giá trị"),
});

export const patchAttributeSchema = attributeSchema.partial();
