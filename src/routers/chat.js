import express from "express";
import {
  getOrCreateConversation,
  sendMessage,
  getMessages,
  closeConversation,
  getUserConversations,
  uploadChatImage,
  getChatProducts,
} from "../controllers/chat.js";
import {
  getChatStats,
  getAdminConversations,
  assignConversation,
  updateConversation,
  getAdmins,
  deleteConversation,
} from "../controllers/chatAdmin.js";
import checkAuth from "../middlewares/checkAuth.js";
import checkAuthAdmin from "../middlewares/checkAuthAdmin.js";
import upload from "../middlewares/multer.js";
const router = express.Router();

// ============ USER ROUTES ============
// Lấy hoặc tạo conversation cho user hiện tại
router.get("/conversation", checkAuth, getOrCreateConversation);

// Gửi tin nhắn
router.post("/message", checkAuth, sendMessage);

// Upload ảnh chat
router.post(
  "/upload-image",
  checkAuth,
  upload.single("image"),
  uploadChatImage
);

// Lấy tin nhắn trong conversation
router.get("/conversation/:conversationId/messages", checkAuth, getMessages);

// Lấy danh sách conversations của user
router.get("/conversations", checkAuth, getUserConversations);

// ============ ADMIN ROUTES ============
// Dashboard thống kê
router.get("/admin/stats", checkAuth, checkAuthAdmin, getChatStats);

// Lấy danh sách conversations cho admin
router.get(
  "/admin/conversations",
  checkAuth,
  checkAuthAdmin,
  getAdminConversations
);

// Assign conversation cho admin
router.put(
  "/admin/conversation/:conversationId/assign",
  checkAuth,
  checkAuthAdmin,
  assignConversation
);

// Cập nhật conversation (priority, tags, notes)
router.put(
  "/admin/conversation/:conversationId",
  checkAuth,
  checkAuthAdmin,
  updateConversation
);

// Đóng conversation
router.put(
  "/admin/conversation/:conversationId/close",
  checkAuth,
  checkAuthAdmin,
  closeConversation
);

// Xóa conversation
router.delete(
  "/admin/conversation/:conversationId",
  checkAuth,
  checkAuthAdmin,
  deleteConversation
);

// Lấy danh sách admin
router.get("/admin/admins", checkAuth, checkAuthAdmin, getAdmins);

// Lấy danh sách sản phẩm cho admin gửi trong chat
router.get("/admin/products", checkAuth, checkAuthAdmin, getChatProducts);

// Admin gửi tin nhắn (dùng chung với user)
router.post("/admin/message", checkAuth, checkAuthAdmin, sendMessage);

// Admin lấy tin nhắn (dùng chung với user)
router.get(
  "/admin/conversation/:conversationId/messages",
  checkAuth,
  checkAuthAdmin,
  getMessages
);

export default router;
