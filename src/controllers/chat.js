import Conversation from "../models/conversation.js";
import Message from "../models/message.js";
import User from "../models/user.js";
import cloudinary from "../config/cloudinary.js";
import Product from "../models/product.js";
import ProductVariant from "../models/productVariant.js";
import mongoose from "mongoose";

// Lấy hoặc tạo conversation cho user
export const getOrCreateConversation = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log("getOrCreateConversation debug:", {
      userId,
      userIdType: typeof userId,
      userFromToken: req.user,
    });

    // Tìm conversation active hoặc waiting của user
    let conversation = await Conversation.findOne({
      userId,
      status: { $in: ["waiting", "active"] },
    }).populate("adminId", "name email");

    console.log("Found existing conversation:", !!conversation);

    // Nếu không có, tạo mới
    if (!conversation) {
      conversation = new Conversation({
        userId,
        metadata: {
          userAgent: req.headers["user-agent"],
          ip: req.ip,
          page: req.headers.referer || req.headers.origin,
        },
      });
      await conversation.save();

      console.log("Created new conversation:", {
        id: conversation._id,
        userId: conversation.userId,
      });

      // Populate sau khi save
      await conversation.populate("adminId", "name email");
    }

    res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("Get conversation error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy cuộc trò chuyện",
      error: error.message,
    });
  }
};

// Gửi tin nhắn
export const sendMessage = async (req, res) => {
  try {
    const { conversationId, content, type = "text" } = req.body;
    const senderId = req.user.id;
    // Sửa logic role: 1 = user, 3 = admin
    const senderType =
      req.user.role === 3 || req.user.role === "3" ? "admin" : "user";

    console.log("Send message debug:", {
      senderId,
      userRole: req.user.role,
      userRoleType: typeof req.user.role,
      senderType,
      conversationId,
      isValidObjectId: mongoose.Types.ObjectId.isValid(conversationId),
    });

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "ID cuộc trò chuyện không hợp lệ",
      });
    }

    // Kiểm tra conversation tồn tại
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc trò chuyện",
      });
    }

    console.log("Conversation found:", {
      conversationUserId: conversation.userId,
      conversationUserIdString: conversation.userId.toString(),
      conversationStatus: conversation.status,
      adminId: conversation.adminId,
      senderId,
      senderIdString: senderId.toString(),
      comparison: conversation.userId.toString() === senderId.toString(),
    });

    // Kiểm tra quyền gửi tin nhắn
    // User chỉ có thể gửi tin nhắn vào conversation của mình
    // Admin có thể gửi tin nhắn vào bất kỳ conversation nào (trừ closed)
    if (
      senderType === "user" &&
      conversation.userId.toString() !== senderId.toString()
    ) {
      console.log("❌ Permission denied:", {
        senderType,
        conversationUserId: conversation.userId.toString(),
        senderId: senderId.toString(),
        match: conversation.userId.toString() === senderId.toString(),
      });
      return res.status(403).json({
        success: false,
        message: "Không có quyền gửi tin nhắn trong cuộc trò chuyện này",
      });
    }

    // Admin không thể gửi tin nhắn vào conversation đã đóng
    if (senderType === "admin" && conversation.status === "closed") {
      return res.status(400).json({
        success: false,
        message: "Không thể gửi tin nhắn vào cuộc trò chuyện đã đóng",
      });
    }

    // Tạo tin nhắn mới
    const message = new Message({
      conversationId,
      senderId,
      senderType,
      type,
      content,
    });

    await message.save();

    // Cập nhật conversation
    const updateData = {
      lastMessageAt: new Date(),
    };

    // Nếu admin gửi tin nhắn và chưa được assign
    if (senderType === "admin" && !conversation.adminId) {
      updateData.adminId = senderId;
      updateData.status = "active";
    }

    // Nếu conversation đang waiting và có tin nhắn mới
    if (conversation.status === "waiting") {
      updateData.status = senderType === "admin" ? "active" : "waiting";
    }

    await Conversation.findByIdAndUpdate(conversationId, updateData);

    // Populate sender info
    await message.populate("senderId", "name email");

    res.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi gửi tin nhắn",
      error: error.message,
    });
  }
};

// Lấy tin nhắn trong conversation
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log("getMessages debug:", {
      conversationId,
      userId,
      userRole,
      isValidObjectId: mongoose.Types.ObjectId.isValid(conversationId),
    });

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "ID cuộc trò chuyện không hợp lệ",
      });
    }

    // Kiểm tra quyền truy cập conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc trò chuyện",
      });
    }

    // Kiểm tra quyền: user chỉ xem conversation của mình, admin xem tất cả
    // Role: 1 = user, 3 = admin
    const isAdmin = userRole === 3 || userRole === "3";
    if (!isAdmin && conversation.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền truy cập cuộc trò chuyện này",
      });
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 }, // Tin nhắn mới nhất trước
      populate: {
        path: "senderId",
        select: "name email",
      },
    };

    const messages = await Message.paginate({ conversationId }, options);

    // Đánh dấu đã đọc tin nhắn
    await Message.updateMany(
      {
        conversationId,
        "readBy.userId": { $ne: userId },
      },
      {
        $push: {
          readBy: {
            userId,
            readAt: new Date(),
          },
        },
      }
    );

    res.json({
      success: true,
      messages: messages.docs.reverse(), // Đảo ngược để tin nhắn cũ trước
      pagination: {
        currentPage: messages.page,
        totalPages: messages.totalPages,
        totalMessages: messages.totalDocs,
        hasNextPage: messages.hasNextPage,
        hasPrevPage: messages.hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy tin nhắn",
      error: error.message,
    });
  }
};

// Đóng conversation (chỉ admin)
export const closeConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const adminId = req.user.id;

    // Sửa logic role check: 1 = user, 3 = admin
    if (req.user.role !== 3 && req.user.role !== "3") {
      return res.status(403).json({
        success: false,
        message: "Chỉ admin mới có thể đóng cuộc trò chuyện",
      });
    }

    const conversation = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        status: "closed",
        adminId,
      },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc trò chuyện",
      });
    }

    // Tạo tin nhắn hệ thống
    const systemMessage = new Message({
      conversationId,
      senderId: adminId,
      senderType: "admin",
      type: "system",
      content: "Cuộc trò chuyện đã được đóng",
    });

    await systemMessage.save();

    res.json({
      success: true,
      conversation,
      message: "Đã đóng cuộc trò chuyện",
    });
  } catch (error) {
    console.error("Close conversation error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi đóng cuộc trò chuyện",
      error: error.message,
    });
  }
};

// Lấy danh sách conversations cho user
export const getUserConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { lastMessageAt: -1 },
      populate: [
        {
          path: "adminId",
          select: "name email",
        },
      ],
    };

    const conversations = await Conversation.paginate({ userId }, options);

    res.json({
      success: true,
      conversations: conversations.docs,
      pagination: {
        currentPage: conversations.page,
        totalPages: conversations.totalPages,
        totalConversations: conversations.totalDocs,
        hasNextPage: conversations.hasNextPage,
        hasPrevPage: conversations.hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Get user conversations error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách cuộc trò chuyện",
      error: error.message,
    });
  }
};

// Upload ảnh cho chat
export const uploadChatImage = async (req, res) => {
  try {
    console.log("Upload chat image debug:", {
      fileExists: !!req.file,
      fileOriginalName: req.file?.originalname,
      fileSize: req.file?.size,
      fileMimetype: req.file?.mimetype,
      hasBuffer: !!req.file?.buffer,
    });

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Không có file được upload",
      });
    }

    // Upload lên Cloudinary với buffer
    const result = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
      {
        folder: "chat_images",
        resource_type: "image",
        transformation: [
          { width: 800, height: 600, crop: "limit" },
          { quality: "auto" },
          { format: "webp" },
        ],
      }
    );

    console.log("Cloudinary upload result:", {
      publicId: result.public_id,
      url: result.secure_url,
    });

    res.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error("Upload chat image error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi upload ảnh",
      error: error.message,
    });
  }
};

// Lấy danh sách sản phẩm cho admin gửi trong chat
export const getChatProducts = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    // Build search query
    const searchQuery = { status: true }; // Chỉ lấy sản phẩm active
    if (search) {
      searchQuery.$or = [
        { name: { $regex: search, $options: "i" } },
        { shortDescription: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Lấy sản phẩm
    const products = await Product.find(searchQuery)
      .populate("categoryId", "name")
      .populate("representativeVariantId")
      .select(
        "name sku shortDescription description categoryId representativeVariantId"
      )
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Lấy variants cho mỗi product
    const productsWithVariants = await Promise.all(
      products.map(async (product) => {
        const variants = await ProductVariant.find({
          productId: product._id,
          "sizes.stock": { $gt: 0 }, // Chỉ lấy variant có stock > 0
        })
          .select("sku color images attributes sizes")
          .limit(5); // Giới hạn 5 variants để tránh quá tải

        return {
          _id: product._id,
          name: product.name,
          sku: product.sku,
          description: product.shortDescription || product.description,
          category: product.categoryId?.name,
          representativeVariant: product.representativeVariantId,
          variants: variants,
        };
      })
    );

    // Filter out products without variants
    const availableProducts = productsWithVariants.filter(
      (product) => product.variants && product.variants.length > 0
    );

    res.json({
      success: true,
      products: availableProducts,
      pagination: {
        currentPage: parseInt(page),
        hasMore: products.length === parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Get chat products error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách sản phẩm",
      error: error.message,
    });
  }
};
