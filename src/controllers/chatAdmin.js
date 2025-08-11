import Conversation from "../models/conversation.js";
import Message from "../models/message.js";
import User from "../models/user.js";

// Lấy dashboard thống kê chat cho admin
export const getChatStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await Promise.all([
      // Tổng số conversations
      Conversation.countDocuments(),

      // Conversations chờ xử lý
      Conversation.countDocuments({ status: "waiting" }),

      // Conversations đang active
      Conversation.countDocuments({ status: "active" }),

      // Conversations hôm nay
      Conversation.countDocuments({
        createdAt: { $gte: today },
      }),

      // Tin nhắn hôm nay
      Message.countDocuments({
        createdAt: { $gte: today },
      }),

      // Response time trung bình (conversations có admin reply)
      Conversation.aggregate([
        {
          $match: {
            adminId: { $exists: true },
            status: { $in: ["active", "closed"] },
          },
        },
        {
          $lookup: {
            from: "messages",
            localField: "_id",
            foreignField: "conversationId",
            as: "messages",
          },
        },
        {
          $addFields: {
            firstUserMessage: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$messages",
                    cond: { $eq: ["$$this.senderType", "user"] },
                  },
                },
                0,
              ],
            },
            firstAdminMessage: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$messages",
                    cond: { $eq: ["$$this.senderType", "admin"] },
                  },
                },
                0,
              ],
            },
          },
        },
        {
          $match: {
            firstUserMessage: { $exists: true },
            firstAdminMessage: { $exists: true },
          },
        },
        {
          $addFields: {
            responseTimeMinutes: {
              $divide: [
                {
                  $subtract: [
                    "$firstAdminMessage.createdAt",
                    "$firstUserMessage.createdAt",
                  ],
                },
                1000 * 60, // Convert to minutes
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgResponseTime: { $avg: "$responseTimeMinutes" },
          },
        },
      ]),
    ]);

    const [
      totalConversations,
      waitingConversations,
      activeConversations,
      todayConversations,
      todayMessages,
      responseTimeResult,
    ] = stats;

    const avgResponseTime =
      responseTimeResult.length > 0
        ? Math.round(responseTimeResult[0].avgResponseTime)
        : 0;

    res.json({
      success: true,
      stats: {
        totalConversations,
        waitingConversations,
        activeConversations,
        todayConversations,
        todayMessages,
        avgResponseTimeMinutes: avgResponseTime,
      },
    });
  } catch (error) {
    console.error("Get chat stats error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê chat",
      error: error.message,
    });
  }
};

// Lấy danh sách conversations cho admin
export const getAdminConversations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      search,
      adminId,
      sortBy = "lastMessageAt",
      sortOrder = "desc",
    } = req.query;

    // Build filter
    const filter = {};

    if (status && status !== "all") {
      filter.status = status;
    }

    if (priority && priority !== "all") {
      filter.priority = priority;
    }

    if (adminId && adminId !== "all") {
      filter.adminId = adminId;
    }

    // Search trong user info hoặc tags
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const userIds = users.map((user) => user._id);

      filter.$or = [{ userId: { $in: userIds } }, { tags: { $in: [search] } }];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: sortOptions,
      populate: [
        {
          path: "userId",
          select: "name email phone",
        },
        {
          path: "adminId",
          select: "name email",
        },
      ],
    };

    const conversations = await Conversation.paginate(filter, options);

    // Lấy tin nhắn cuối cùng cho mỗi conversation
    const conversationsWithLastMessage = await Promise.all(
      conversations.docs.map(async (conv) => {
        const lastMessage = await Message.findOne({
          conversationId: conv._id,
        })
          .sort({ createdAt: -1 })
          .populate("senderId", "name")
          .lean();

        // Đếm tin nhắn chưa đọc
        const unreadCount = await Message.countDocuments({
          conversationId: conv._id,
          senderType: "user",
          "readBy.userId": { $ne: req.user.id },
        });

        return {
          ...conv.toObject(),
          lastMessage,
          unreadCount,
        };
      })
    );

    res.json({
      success: true,
      conversations: conversationsWithLastMessage,
      pagination: {
        currentPage: conversations.page,
        totalPages: conversations.totalPages,
        totalConversations: conversations.totalDocs,
        hasNextPage: conversations.hasNextPage,
        hasPrevPage: conversations.hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Get admin conversations error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách cuộc trò chuyện",
      error: error.message,
    });
  }
};

// Assign conversation cho admin
export const assignConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { adminId } = req.body;
    const currentAdminId = req.user.id;

    // Kiểm tra admin được assign có tồn tại
    if (adminId) {
      const admin = await User.findOne({ _id: adminId, role: "admin" });
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy admin",
        });
      }
    }

    const conversation = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        adminId: adminId || null,
        status: adminId ? "active" : "waiting",
      },
      { new: true }
    ).populate([
      { path: "userId", select: "name email" },
      { path: "adminId", select: "name email" },
    ]);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc trò chuyện",
      });
    }

    // Tạo tin nhắn hệ thống
    const systemMessage = new Message({
      conversationId,
      senderId: currentAdminId,
      senderType: "admin",
      type: "system",
      content: adminId
        ? `Cuộc trò chuyện đã được chuyển cho ${conversation.adminId.name}`
        : "Cuộc trò chuyện đã được bỏ assign",
    });

    await systemMessage.save();

    res.json({
      success: true,
      conversation,
      message: "Đã cập nhật phân công cuộc trò chuyện",
    });
  } catch (error) {
    console.error("Assign conversation error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi phân công cuộc trò chuyện",
      error: error.message,
    });
  }
};

// Cập nhật priority và tags
export const updateConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { priority, tags, notes } = req.body;

    const updateData = {};
    if (priority) updateData.priority = priority;
    if (tags) updateData.tags = tags;
    if (notes !== undefined) updateData["metadata.adminNotes"] = notes;

    const conversation = await Conversation.findByIdAndUpdate(
      conversationId,
      updateData,
      { new: true }
    ).populate([
      { path: "userId", select: "name email" },
      { path: "adminId", select: "name email" },
    ]);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc trò chuyện",
      });
    }

    res.json({
      success: true,
      conversation,
      message: "Đã cập nhật cuộc trò chuyện",
    });
  } catch (error) {
    console.error("Update conversation error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật cuộc trò chuyện",
      error: error.message,
    });
  }
};

// Lấy danh sách admin cho dropdown
export const getAdmins = async (req, res) => {
  try {
    const admins = await User.find(
      { role: "admin" },
      { name: 1, email: 1 }
    ).sort({ name: 1 });

    res.json({
      success: true,
      admins,
    });
  } catch (error) {
    console.error("Get admins error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách admin",
      error: error.message,
    });
  }
};

// Xóa conversation (soft delete)
export const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        status: "deleted",
        "metadata.deletedAt": new Date(),
        "metadata.deletedBy": req.user.id,
      },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc trò chuyện",
      });
    }

    res.json({
      success: true,
      message: "Đã xóa cuộc trò chuyện",
    });
  } catch (error) {
    console.error("Delete conversation error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi xóa cuộc trò chuyện",
      error: error.message,
    });
  }
};
