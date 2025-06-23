import bcrypt from "bcryptjs";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import { z } from "zod";
import dotenv from "dotenv";
import mongoose from "mongoose";
import RecentlyViewed from "../models/recentlyViewed.js";
import sendVerificationEmail from "../utils/sendVerificationEmail.js";
dotenv.config();
const locationSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const shippingAddressSchema = z.object({
  receiver_name: z.string().min(1, "Tên người nhận không hợp lệ"),
  phone: z.string().min(1, "Số điện thoại không hợp lệ"),
  city: locationSchema,
  district: locationSchema,
  commune: locationSchema,
  address: z.string().min(2, "Địa chỉ tối thiểu 2 ký tự"),
  isDefault: z.boolean().optional(),
});
const registerSchema = z
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
    
  })

  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu không khớp",
    path: ["confirmPassword"],
  });
const loginSchema = z.object({
  email: z.string().email("Sai định dạng email"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
});
const generateAccessToken = (userId, email, role) => {
  return jwt.sign(
    { id: userId, email: email, role: role },
    process.env.SECRET_KEY,
    { expiresIn: "30d" }
  );
};

const generateRefreshToken = (userId, email, role) => {
  return jwt.sign(
    { id: userId, email: email, role: role },
    process.env.SECRET_KEY,
    { expiresIn: "300d" }
  );
};

export const register = async (req, res) => {
  try {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.format() });
    }

    const value = result.data;
    const existUser = await User.findOne({ email: value.email.toLowerCase() });
    if (existUser) {
      return res.status(400).json({ message: "Tài khoản đã tồn tại" });
    }

    const hashedPassword = await bcrypt.hash(value.password, 10);
    // ✅ Tạo mã xác thực ngẫu nhiên
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newUser = await User.create({
      ...value,
      email: value.email.toLowerCase(),
      password: hashedPassword,
      role: "1",
      verificationCode, // Lưu mã xác thực
    });
     // ✅ Gửi mã xác thực qua email
    await sendVerificationEmail(newUser.email, verificationCode);

    return res.status(201).json({ message: "Đăng ký thành công" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản." });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Tài khoản đã xác thực trước đó." });
    }

    if (user.verificationCode !== code) {
      return res.status(400).json({ message: "Mã xác thực không đúng." });
    }

    // ✅ Cập nhật trạng thái tài khoản
    user.isVerified = true;
    user.verificationCode = undefined;
    await user.save();

    return res.status(200).json({ message: "Xác thực thành công. Bạn có thể đăng nhập!" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const resendCode = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Thiếu email." });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng." });

  const newCode = Math.floor(100000 + Math.random() * 900000).toString();
  user.verificationCode = newCode;
  user.isVerified = false; // Đặt lại trạng thái xác thực
  user.verificationCode = newCode; // Cập nhật mã xác thực mới

  await user.save();


  await sendVerificationEmail(user.email, newCode);
  res.status(200).json({ message: "Đã gửi lại mã xác thực." });
};

export const login = async (req, res) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.format() });
    }

    const { email, password } = result.data;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Tài khoản không tồn tại" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu không chính xác" });
    }
    if (!user.isVerified) {
      return res.status(402).json({ message: "Tài khoản chưa được xác thực" });
    }
    const token = generateAccessToken(user._id, user.email, user.role);
    const refreshToken = generateRefreshToken(user._id, user.email, user.role);
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await User.findByIdAndUpdate(user._id, {
      refreshToken: hashedRefreshToken,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: "/api/auth/refresh",
    });
    console.log(user);
    return res.status(200).json({
      message: "Đăng nhập thành công",
      user: { id: user._id, email: user.email, name: user.name, token },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(200).json({ message: "Đã đăng xuất" });

    const userData = jwt.verify(refreshToken, process.env.SECRET_KEY);
    await User.findByIdAndUpdate(userData.id, { refreshToken: null });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: "/api/auth/refresh",
    });

    return res.status(200).json({ message: "Đăng xuất thành công" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const myInfo = async (req, res) => {
  try {
    const id = req.user.id;
    const user = await User.findById(id);
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const info = async (req, res) => {
  return res.status(200).json(req.user);
};

export const getListUser = async (req, res) => {
  try {
    const { _page = 1, _limit = 10, _email, _phone, _sort = "createdAt", _order = "desc" } = req.query;

    // Tạo query tìm kiếm
    const query = {};
    if (_email) query.email = { $regex: _email, $options: "i" };
    if (_phone) query.phone = { $regex: _phone, $options: "i" };

    const options = {
      page: parseInt(_page),
      limit: parseInt(_limit),
      sort: { [_sort]: _order === "desc" ? -1 : 1 },
    };
    const users = await User.paginate(query, options);
    return res.status(200).json({
      data: users.docs,
      totalPages: users.totalPages,
      currentPage: users.page,
      total: users.totalDocs,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const getShippingAddressMainByUserId = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    return res.status(200).json(user.shipping_addresses);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const getShippingById = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const shipping_address = user.shipping_addresses.find(
      (address) => address._id.toString() === req.params.id
    );

    if (!shipping_address) {
      return res.status(404).json({ message: "Địa chỉ không tồn tại" });
    }

    return res.status(200).json(shipping_address);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const addShippingAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("🚀 ~ addShippingAddress ~ userId:", userId);

    const result = shippingAddressSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.format() });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    user.shipping_addresses.push(result.data);
    await user.save();

    return res.status(200).json({
      message: "Thêm địa chỉ thành công",
      data: user.shipping_addresses,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Đổi mật khẩu
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp đầy đủ thông tin" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu cũ không chính xác" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({ message: "Đổi mật khẩu thành công" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Đổi thông tin người dùng
export const updateUserInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const { first_name, name, phone, date, sex } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    user.first_name = first_name || user.first_name;
    user.name = name || user.name;
    user.phone = phone || user.phone;
    user.date = date || user.date;
    user.sex = sex || user.sex;

    await user.save();

    return res
      .status(200)
      .json({ message: "Cập nhật thông tin thành công", user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Sửa địa chỉ
export const updateShippingAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.params;
    const result = shippingAddressSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({ errors: result.error.format() });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const addressIndex = user.shipping_addresses.findIndex(
      (addr) => addr._id.toString() === addressId
    );
    if (addressIndex === -1) {
      return res.status(404).json({ message: "Địa chỉ không tồn tại" });
    }

    user.shipping_addresses[addressIndex] = {
      ...user.shipping_addresses[addressIndex]._doc,
      ...result.data,
    };
    await user.save();

    return res.status(200).json({
      message: "Cập nhật địa chỉ thành công",
      data: user.shipping_addresses,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ message: "Vui lòng cung cấp vai trò mới" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    return res.status(200).json({
      message: "Cập nhật vai trò người dùng thành công",
      data: user,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
