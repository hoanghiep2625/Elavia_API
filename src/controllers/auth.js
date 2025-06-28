import bcrypt from "bcryptjs";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import RecentlyViewed from "../models/recentlyViewed.js";
import sendVerificationEmail from "../utils/sendVerificationEmail.js";
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
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.format() });
    }

    const { oldPassword, newPassword } = result.data;
    const user = await User.findById(req.user.id);
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

    const user = await User.findById(req.user.id);
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
    const userId = req.user.id;
    const addressId = req.params.addressId;

    const {
      receiver_name,
      phone,
      city,
      district,
      commune,
      address,
      setDefault,
    } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "Không tìm thấy user" });

    const shippingAddress = user.shipping_addresses.id(addressId);
    if (!shippingAddress)
      return res.status(404).json({ message: "Không tìm thấy địa chỉ cần cập nhật" });

    // Cập nhật dữ liệu
    shippingAddress.receiver_name = receiver_name;
    shippingAddress.phone = phone;
    shippingAddress.city = city;
    shippingAddress.district = district;
    shippingAddress.commune = commune;
    shippingAddress.address = address;

    // Cập nhật default
    if (setDefault === true) {
      user.defaultAddressId = shippingAddress._id;
    } else if (setDefault === false && user.defaultAddressId?.toString() === addressId) {
      // Nếu bỏ chọn mặc định và địa chỉ đang là mặc định
      const sorted = user.shipping_addresses
        .filter((item) => item._id.toString() !== addressId)
        .sort((a, b) => a.createdAt - b.createdAt);
      user.defaultAddressId = sorted.length > 0 ? sorted[0]._id : null;
    }

    await user.save();
    res.json({ message: "Cập nhật địa chỉ thành công" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server: " + err.message });
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


export const deleteShippingAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    user.shipping_addresses = user.shipping_addresses.filter(
      (address) => address._id.toString() !== addressId
    );

    await user.save();

    return res.status(200).json({
      message: "Xoá địa chỉ thành công",
      data: user.shipping_addresses,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Đặt địa chỉ giao hàng mặc định
export const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.addressId;

    if (!userId || !addressId) {
      return res.status(400).json({ message: "Thiếu userId hoặc addressId" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng" });

    const found = user.shipping_addresses.some(
      addr => addr._id.toString() === addressId.toString()
    );

    if (!found) {
      return res.status(404).json({ message: "Không tìm thấy địa chỉ cần cập nhật" });
    }

    user.defaultAddressId = addressId;
    await user.save();

    return res.status(200).json({
      message: "Cập nhật địa chỉ mặc định thành công",
      defaultAddressId: addressId,
    });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi server: " + err.message });
  }
};