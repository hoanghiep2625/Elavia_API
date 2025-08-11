import jwt from "jsonwebtoken";
import User from "../models/user.js";
import dotenv from "dotenv";

dotenv.config();

export const checkAuth = async (req, res, next) => {
  // Kiểm tra token từ Authorization header hoặc cookies
  let token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token && req.cookies) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      message: "Bạn không có quyền truy cập",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "Người dùng không tồn tại",
      });
    }
    req.user = {
      id: user._id,
      email: user.email,
      role: user.role,
    };
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Token không hợp lệ hoặc đã hết hạn",
    });
  }
};

export default checkAuth;
