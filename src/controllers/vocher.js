import Voucher from "../models/vocher.js";
import {
  createVoucherSchema,
  updateVoucherSchema,
  applyVoucherSchema,
} from "../schemaValidations/voucher.schema.js";

export const getVouchers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      _sort = "createdAt",
      _order = "desc",
      _code = "",
      _description = "",
      _type = "",
    } = req.query;

    // Tạo điều kiện tìm kiếm
    const query = {};

    if (_code) {
      query.code = { $regex: _code, $options: "i" };
    }
    if (_description) {
      query.description = { $regex: _description, $options: "i" };
    }
    if (_type) {
      query.type = { $regex: _type, $options: "i" };
    }

    // Sắp xếp động theo _sort và _order
    const sort = {};
    sort[_sort] = _order === "asc" ? 1 : -1;

    const result = await Voucher.paginate(query, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
    });

    return res.status(200).json({
      data: result.docs,
      totalPages: result.totalPages,
      currentPage: result.page,
      total: result.totalDocs,
    });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};
export const getVoucherById = async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      return res.status(404).json({ message: "Voucher không tồn tại" });
    }
    res.json(voucher);
  } catch (err) {
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};
export const createVoucher = async (req, res) => {
  try {
    const data = createVoucherSchema.parse(req.body);

    // Kiểm tra trước khi tạo: code đã tồn tại chưa (case-insensitive)
    const existingVoucher = await Voucher.findOne({
      code: { $regex: new RegExp(`^${data.code}$`, "i") },
    });

    if (existingVoucher) {
      return res.status(400).json({
        message: "Mã voucher đã tồn tại",
        error: `Mã "${data.code}" đã được sử dụng`,
      });
    }

    const voucher = new Voucher(data);
    await voucher.save();
    res.status(201).json(voucher);
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({
        message: "Dữ liệu không hợp lệ",
        errors: err.errors,
      });
    }
    res.status(400).json({
      message: "Tạo voucher thất bại",
      error: err.message,
    });
  }
};

export const updateVoucher = async (req, res) => {
  try {
    const data = updateVoucherSchema.parse(req.body);

    // Nếu có update code, kiểm tra duplicate (trừ chính nó)
    if (data.code) {
      const existingVoucher = await Voucher.findOne({
        code: { $regex: new RegExp(`^${data.code}$`, "i") },
        _id: { $ne: req.params.id },
      });

      if (existingVoucher) {
        return res.status(400).json({
          message: "Mã voucher đã tồn tại",
          error: `Mã "${data.code}" đã được sử dụng bởi voucher khác`,
        });
      }
    }

    const voucher = await Voucher.findByIdAndUpdate(req.params.id, data, {
      new: true,
    });

    if (!voucher)
      return res.status(404).json({ message: "Voucher không tồn tại" });

    res.json(voucher);
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({
        message: "Dữ liệu cập nhật không hợp lệ",
        errors: err.errors,
      });
    }
    res.status(400).json({ message: "Cập nhật thất bại", error: err.message });
  }
};

export const deleteVoucher = async (req, res) => {
  try {
    const voucher = await Voucher.findByIdAndDelete(req.params.id);
    if (!voucher)
      return res.status(404).json({ message: "Voucher không tồn tại" });

    res.json({ message: "Xoá thành công" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi xoá voucher", error: err.message });
  }
};

// ✅ Lấy voucher chưa dùng của user (sắp xếp theo giảm giá nhiều nhất)
export const getUserVouchers = async (req, res) => {
  try {
    const { userId } = req.params;
    const { cartTotal = 0 } = req.query;

    const currentDate = new Date();

    // Tìm tất cả voucher:
    // 1. Đang hoạt động
    // 2. Chưa hết hạn (hoặc không có hạn)
    // 3. Còn lượt sử dụng
    // 4. User chưa sử dụng
    // 5. Đủ điều kiện áp dụng (minOrderValue)
    const vouchers = await Voucher.find({
      isActive: true,
      $or: [
        { expiresAt: { $gte: currentDate } },
        { expiresAt: null },
        { expiresAt: { $exists: false } },
      ],
      quantity: { $gt: 0 },
      usedBy: { $ne: userId },
    });

    // Lọc voucher có thể áp dụng với cart total hiện tại
    const applicableVouchers = vouchers.filter((voucher) => {
      return Number(cartTotal) >= (voucher.minOrderValue || 0);
    });

    // Tính toán discount amount và sắp xếp theo giảm giá nhiều nhất
    const vouchersWithDiscount = applicableVouchers.map((voucher) => {
      let discount = 0;
      if (voucher.type === "fixed") {
        discount = voucher.value;
      } else {
        discount = (voucher.value / 100) * Number(cartTotal);
        if (voucher.maxDiscount) {
          discount = Math.min(discount, voucher.maxDiscount);
        }
      }
      // Đảm bảo discount không vượt quá cartTotal
      discount = Math.min(discount, Number(cartTotal));

      return {
        ...voucher.toObject(),
        calculatedDiscount: discount,
      };
    });

    // Sắp xếp theo discount giảm dần
    vouchersWithDiscount.sort(
      (a, b) => b.calculatedDiscount - a.calculatedDiscount
    );

    res.json({
      success: true,
      vouchers: vouchersWithDiscount,
      total: vouchersWithDiscount.length,
    });
  } catch (err) {
    res.status(500).json({
      message: "Lỗi khi lấy voucher của user",
      error: err.message,
    });
  }
};

// ✅ Áp dụng mã giảm giá
export const applyVoucher = async (req, res) => {
  try {
    const { code, userId, cartTotal } = applyVoucherSchema.parse(req.body);

    // Tìm voucher case-insensitive
    const voucher = await Voucher.findOne({
      code: { $regex: new RegExp(`^${code}$`, "i") },
      isActive: true,
    });

    if (!voucher)
      return res.status(404).json({ message: "Mã giảm giá không hợp lệ" });

    if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
      return res.status(400).json({ message: "Mã đã hết hạn" });
    }

    if (voucher.quantity <= 0) {
      return res.status(400).json({ message: "Voucher đã hết lượt sử dụng" });
    }

    if (voucher.usedBy.includes(userId)) {
      return res
        .status(400)
        .json({ message: "Bạn đã sử dụng voucher này rồi" });
    }

    if (cartTotal < (voucher.minOrderValue || 0)) {
      return res
        .status(400)
        .json({ message: "Không đủ điều kiện áp dụng voucher" });
    }

    let discount = 0;
    if (voucher.type === "fixed") {
      discount = voucher.value;
    } else {
      discount = (voucher.value / 100) * cartTotal;
      if (voucher.maxDiscount) {
        discount = Math.min(discount, voucher.maxDiscount);
      }
    }

    // Đảm bảo discount không vượt quá cartTotal
    discount = Math.min(discount, cartTotal);

    res.json({ success: true, discount, voucherId: voucher._id });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({
        message: "Dữ liệu không hợp lệ",
        errors: err.errors,
      });
    }
    res
      .status(500)
      .json({ message: "Lỗi áp dụng voucher", error: err.message });
  }
};
