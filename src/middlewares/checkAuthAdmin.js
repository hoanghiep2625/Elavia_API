import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/user.js";

dotenv.config();

export const checkAuthAdmin = (req, res, next) => {
  // Kiểm tra token từ Authorization header hoặc cookies
  let token = req.headers.authorization?.split(" ")[1];

  if (!token && req.cookies) {
    token = req.cookies.token;
  }

  if (!token) return res.status(401).json({ message: "Không có token" });

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    // Sửa logic role: 1 = user, 3 = admin
    if (decoded.role !== 3 && decoded.role !== "3") {
      return res.status(403).json({ message: "Không có quyền admin" });
    }
    req.admin = decoded;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(403).json({ message: "Token không hợp lệ" });
  }
};
export const getAdminProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized: Missing token" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    const admin = await User.findById(decoded.id).select("-password");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.status(200).json(admin);
  } catch (error) {
    console.error("getAdminProfile error:", error.message);
    res.status(401).json({ message: "Invalid token", error: error.message });
  }
};

export default checkAuthAdmin;
