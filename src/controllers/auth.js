import bcrypt from "bcryptjs";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import LoginHistory from "../models/loginHistory.js";
import useragent from "useragent";
import sendVerificationEmail from "../utils/sendVerificationEmail.js";
import nodemailer from "nodemailer";
import crypto from "crypto";
import {
  registerSchema,
  loginSchema,
  shippingAddressSchema,
  updateUserInfoSchema,
  changePasswordSchema,
  updateUserSchema,
} from "../schemaValidations/auth.schema.js";

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

// Đăng ký
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
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    const newUser = await User.create({
      ...value,
      email: value.email.toLowerCase(),
      password: hashedPassword,
      role: value.role,
      verificationCode,
      verificationExpires: new Date(Date.now() + 5 * 60 * 1000), // 5 phút
    });

    await sendVerificationEmail(newUser.email, verificationCode);
    return res.status(201).json({ message: "Đăng ký thành công" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Xác thực mã
export const verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: "Thiếu email hoặc mã xác thực" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Tài khoản đã được xác thực" });
    }

    if (
      user.verificationCode !== code ||
      !user.verificationExpires ||
      user.verificationExpires < new Date()
    ) {
      return res
        .status(400)
        .json({ message: "Mã xác thực sai hoặc đã hết hạn" });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationExpires = undefined;
    await user.save();

    return res.status(200).json({ message: "Xác thực thành công" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Gửi lại mã xác thực
export const resendCode = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Thiếu email" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Tài khoản đã được xác thực" });
    }

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = newCode;
    user.verificationExpires = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();

    await sendVerificationEmail(user.email, newCode);
    return res.status(200).json({ message: "Đã gửi lại mã xác thực" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Đăng nhập

export const login = async (req, res) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.format() });
    }

    const { email, password } = result.data;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(400).json({ message: "Tài khoản không tồn tại" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Mật khẩu không chính xác" });

    if (!user.isVerified)
      return res.status(402).json({ message: "Tài khoản chưa được xác thực" });

    const agent = useragent.parse(req.headers["user-agent"] || "");
    const now = new Date().toISOString().replace(/\./g, "_");

    await LoginHistory.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          [`logins.${now}`]: {
            device: `${agent.os} (${agent.device.family || "desktop"})`,
            platform: "Website elavia",
            loginType: "Password",
            ip: req.ip,
          },
        },
      },
      { upsert: true }
    );

    const token = generateAccessToken(user._id, user.email, user.role);
    const refreshToken = generateRefreshToken(user._id, user.email, user.role);
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await User.findByIdAndUpdate(user._id, {
      refreshToken: hashedRefreshToken,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth/refresh",
    });

    return res.status(200).json({
      message: "Đăng nhập thành công",
      user: { id: user._id, email: user.email, name: user.name, token },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getLoginHistoryByUserId = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userId = req.user.id;

    const historyDoc = await LoginHistory.findOne({
      userId,
    });

    if (!historyDoc || !historyDoc.logins) {
      return res.json({
        data: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      });
    }

    const allEntries = Array.from(historyDoc.logins.entries())
      .map(([timestamp, detail]) => ({
        timestamp,
        ...detail.toObject?.(), // đảm bảo là plain object
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // sort giảm dần theo thời gian

    const total = allEntries.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginated = allEntries.slice(start, start + limit);

    return res.json({
      data: paginated,
      total,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Đăng xuất
export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(200).json({ message: "Đã đăng xuất" });

    const userData = jwt.verify(refreshToken, process.env.SECRET_KEY);
    await User.findByIdAndUpdate(userData.id, { refreshToken: null });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth/refresh",
    });

    return res.status(200).json({ message: "Đăng xuất thành công" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy thông tin cá nhân
export const myInfo = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy thông tin người dùng từ token
export const info = async (req, res) => {
  return res.status(200).json(req.user);
};

// Lấy danh sách người dùng
export const getListUser = async (req, res) => {
  try {
    const {
      _page = 1,
      _limit = 10,
      _email = "",
      _phone = "",
      _name = "",
      _role,
      _sort = "createdAt",
      _order = "desc",
    } = req.query;

    const query = {};
    if (_email) query.email = { $regex: _email, $options: "i" };
    if (_phone) query.phone = { $regex: _phone, $options: "i" };
    if (_name) query.name = { $regex: _name, $options: "i" };
    if (_role) query.role = _role;

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

// Lấy danh sách địa chỉ giao hàng của người dùng
export const getShippingAddressMainByUserId = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }
    return res.status(200).json(user.shipping_addresses);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy địa chỉ giao hàng theo ID
export const getShippingById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

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

// Lấy thông tin người dùng theo ID
export const getUserById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Thêm địa chỉ giao hàng
export const addShippingAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const result = shippingAddressSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.format() });
    }

    const newAddress = result.data;
    user.shipping_addresses.push(newAddress);

    // Nếu chưa có địa chỉ mặc định, gán địa chỉ này làm mặc định
    if (!user.defaultAddress) {
      const addedAddress =
        user.shipping_addresses[user.shipping_addresses.length - 1];
      user.defaultAddress = addedAddress._id;
    }

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
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.format() });
    }

    const { oldPassword, newPassword } = result.data;
    const user = await User.findById(req.user.id).select("password");
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

// Cập nhật thông tin người dùng
export const updateUserInfo = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const result = updateUserInfoSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.format() });
    }

    const user = await User.findById(req.user.id).select(
      "first_name name phone date sex"
    );
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    user.first_name = result.data.first_name || user.first_name;
    user.name = result.data.name || user.name;
    user.phone = result.data.phone || user.phone;
    user.date = result.data.date || user.date;
    user.sex = result.data.sex || user.sex;

    await user.save();

    return res.status(200).json({
      message: "Cập nhật thông tin thành công",
      user,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Cập nhật địa chỉ giao hàng
export const updateShippingAddress = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const result = shippingAddressSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({ errors: result.error.format() });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const addressIndex = user.shipping_addresses.findIndex(
      (addr) => addr._id.toString() === req.params.addressId
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

// Cập nhật vai trò người dùng
export const updateUser = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const result = updateUserSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({ errors: result.error.format() });
    }

    const user = await User.findByIdAndUpdate(req.params.id, result.data, {
      new: true,
    });

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
// controllers/addressController.js
export const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ message: "ID địa chỉ không hợp lệ" });
    }

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ message: "Người dùng không tồn tại" });

    const found = user.shipping_addresses.some(
      (addr) => addr._id.toString() === addressId
    );
    if (!found) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy địa chỉ để đặt mặc định" });
    }

    user.defaultAddress = addressId;
    await user.save();

    return res.status(200).json({ message: "Đã cập nhật địa chỉ mặc định" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server: " + err.message });
  }
};

export const deleteShippingAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    // Không cho xoá nếu là địa chỉ mặc định
    if (user.defaultAddress?.toString() === addressId) {
      return res.status(400).json({
        message:
          "Không thể xoá địa chỉ mặc định. Vui lòng chọn địa chỉ khác làm mặc định trước.",
      });
    }

    const beforeCount = user.shipping_addresses.length;

    user.shipping_addresses = user.shipping_addresses.filter(
      (address) => address._id.toString() !== addressId
    );

    if (user.shipping_addresses.length === beforeCount) {
      return res.status(404).json({ message: "Địa chỉ không tồn tại" });
    }

    await user.save();

    return res.status(200).json({
      message: "Xoá địa chỉ thành công",
      data: user.shipping_addresses,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Email không tồn tại." });

    // Tạo token reset
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpire = Date.now() + 15 * 60 * 1000; // 15 phút

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = resetTokenExpire;
    await user.save();

    // Gửi email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    // const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const resetUrl = `http://localhost:5173/reset-password?token=${resetToken}`;
    await transporter.sendMail({
      to: email,
      subject: "Quên mật khẩu Elavia",
      html: `<p>Nhấn vào <a href="${resetUrl}">đây</a> để đặt lại mật khẩu. Link có hiệu lực 15 phút.</p>`,
    });

    return res.status(200).json({ message: "Đã gửi email đặt lại mật khẩu." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });
    if (!user)
      return res
        .status(400)
        .json({ message: "Token không hợp lệ hoặc đã hết hạn." });

    // Hash mật khẩu mới trước khi lưu
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return res.status(200).json({ message: "Đặt lại mật khẩu thành công." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
