import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Chỉ chấp nhận các file ảnh định dạng jpeg, png, jpg, webp!"),
        false
      );
    }
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

export default upload;
