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

// ✅ Áp dụng mã giảm giá
export const applyVoucher = async (req, res) => {
  try {
    const { code, userId, cartTotal } = applyVoucherSchema.parse(req.body);

    const voucher = await Voucher.findOne({ code, isActive: true });
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
