import { z } from "zod";

export const locationSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const shippingAddressSchema = z.object({
  receiver_name: z.string().min(1, "Tên người nhận không hợp lệ"),
  phone: z.string().min(1, "Số điện thoại không hợp lệ"),
  city: locationSchema,
  district: locationSchema,
  ward: locationSchema,
  address: z.string().min(2, "Địa chỉ tối thiểu 2 ký tự"),
  type: z.enum(["home", "company"]),
});

export const registerSchema = z
  .object({
    first_name: z.string().min(1, "Tên không hợp lệ"),
    name: z.string().min(2, "Tên cần tối thiểu 2 ký tự"),
    email: z.string().email("Sai định dạng email"),
    phone: z
      .string()
      .regex(
        /^(0|\+84)(3[2-9]|5[2689]|7[06-9]|8[1-689]|9[0-46-9])\d{7}$/,
        "Sai định dạng số điện thoại Việt Nam"
      ),
    date: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: "Ngày sinh phải đúng định dạng YYYY-MM-DD",
    }),
    sex: z.enum(["0", "1"], {
      errorMap: () => ({ message: "Giới tính phải là 0 hoặc 1" }),
    }),
    password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
    verificationCode: z.string().optional(),
    isVerified: z.boolean().default(false),
    confirmPassword: z.string(),
    shipping_addresses: z
      .array(shippingAddressSchema)
      .min(1, "Cần ít nhất 1 địa chỉ giao hàng"),
    role: z.enum(["1", "3"]).default("1"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu không khớp",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().email("Sai định dạng email"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
});

export const updateUserInfoSchema = z.object({
  first_name: z.string().min(1, "Tên không hợp lệ").optional(),
  name: z.string().min(2, "Tên cần tối thiểu 2 ký tự").optional(),
  phone: z
    .string()
    .regex(
      /^(0|\+84)(3[2-9]|5[2689]|7[06-9]|8[1-689]|9[0-46-9])\d{7}$/,
      "Sai định dạng số điện thoại Việt Nam"
    )
    .optional(),
  date: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Ngày sinh phải đúng định dạng YYYY-MM-DD",
    })
    .optional(),
  sex: z
    .enum(["0", "1"], {
      errorMap: () => ({ message: "Giới tính phải là 0 hoặc 1" }),
    })
    .optional(),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(6, "Mật khẩu cũ tối thiểu 6 ký tự"),
  newPassword: z.string().min(6, "Mật khẩu mới tối thiểu 6 ký tự"),
});

export const updateUserSchema = z.object({
  role: z.enum(["1", "3"], {
    errorMap: () => ({ message: "Vai trò phải là 1 hoặc 3" }),
  }),
});
