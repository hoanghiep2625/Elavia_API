export const parseFormData = (body) => {
  const {
    productId,
    sku,
    price,
    "color.baseColor": baseColor,
    "color.actualColor": actualColor,
    "color.colorName": colorName,
    sizes = [], // Giải quyết trường hợp sizes trống
    ...rest
  } = body;

  console.log("Rest:", rest); // Đảm bảo không thiếu dữ liệu

  const parsedSizes = sizes.map((sizeObj) => ({
    size: sizeObj.size,
    stock: Number(sizeObj.stock),
  }));

  return {
    productId,
    sku,
    price: Number(price),
    color: {
      baseColor,
      actualColor,
      colorName,
    },
    sizes: parsedSizes, // Trả về mảng sizes đã được parse đúng
  };
};
