import Conversation from "../models/conversation.js";
import Message from "../models/message.js";
import User from "../models/user.js";
import cloudinary from "../config/cloudinary.js";
import Product from "../models/product.js";
import ProductVariant from "../models/productVariant.js";
import Category from "../models/categories.js";
import mongoose from "mongoose";

// AI Response Generator - Simple rule-based AI
const generateAIResponse = async (userMessage, conversation) => {
  const message = userMessage.toLowerCase();

  // 1. Giao hàng & phí ship
  if (
    message.includes("ship") ||
    message.includes("giao hàng") ||
    message.includes("phí vận chuyển")
  ) {
    return {
      type: "text",
      content: "Shop giao hàng toàn quốc trong 2–5 ngày. Miễn phí ship cho đơn từ 500k bạn nhé!",
    };
  }

  // 2. Chính sách đổi trả
  if (
    message.includes("đổi") ||
    message.includes("trả") ||
    message.includes("hoàn hàng")
  ) {
    return {
      type: "text",
      content: "Bạn có thể đổi trả trong vòng 7 ngày kể từ ngày nhận hàng, miễn phí đổi size lần đầu.",
    };
  }

  // 3. Tư vấn size
  if (
    message.includes("size") ||
    message.includes("mặc vừa không") ||
    message.includes("cao") ||
    message.includes("nặng")
  ) {
    return {
      type: "text",
      content: "Bạn vui lòng cho mình chiều cao và cân nặng, shop sẽ tư vấn size phù hợp. Ngoài ra có bảng size chi tiết trên mỗi sản phẩm.",
    };
  }

  // 4. Khuyến mãi / voucher
  if (
    message.includes("giảm giá") ||
    message.includes("khuyến mãi") ||
    message.includes("voucher") ||
    message.includes("mã")
  ) {
    return {
      type: "text",
      content: "Hiện tại shop có mã GIAM10 giảm 10% cho đơn từ 500k. Bạn muốn mình áp dụng cho giỏ hàng của bạn không?",
    };
  }

  // 5. Sản phẩm hot / mix đồ
  if (
    message.includes("hot") ||
    message.includes("trend") ||
    message.includes("mẫu mới") ||
    message.includes("phối")
  ) {
    return {
      type: "text",
      content: "Áo sơ mi trắng và quần jeans xanh đang là item hot. Bạn có thể mix cùng giày sneaker để thêm năng động.",
    };
  }

  // 6. Chất liệu & giặt ủi
  if (
    message.includes("chất liệu") ||
    message.includes("vải") ||
    message.includes("bền không") ||
    message.includes("giặt")
  ) {
    return {
      type: "text",
      content: "Sản phẩm được làm từ cotton thoáng mát, dễ giặt, giữ form tốt sau nhiều lần sử dụng.",
    };
  }

  // 7. Kiểm tra tồn kho
  if (
    message.includes("còn hàng") ||
    message.includes("hết hàng") ||
    message.includes("size s") ||
    message.includes("size m") ||
    message.includes("size l")
  ) {
    return {
      type: "text",
      content: "Bạn vui lòng cho mình tên sản phẩm, shop sẽ kiểm tra tồn kho và báo lại ngay!",
    };
  }

  // 8. Hàng lỗi / bảo hành
  if (
    message.includes("lỗi") ||
    message.includes("rách") ||
    message.includes("bung chỉ") ||
    message.includes("hỏng")
  ) {
    return {
      type: "text",
      content: "Nếu sản phẩm lỗi do nhà sản xuất, shop sẽ hỗ trợ đổi mới trong vòng 7 ngày kể từ khi nhận hàng.",
    };
  }

  // 9. Câu chào cơ bản
  if (
    message.includes("hello") ||
    message.includes("xin chào") ||
    message.includes("hi") ||
    message.includes("chào shop")
  ) {
    return {
      type: "text",
      content: "Xin chào 👋! Mình có thể giúp bạn tìm sản phẩm hoặc tư vấn size không?",
    };
  }
  // Câu chào hỏi
  if (
    message.includes("xin chào") ||
    message.includes("hello") ||
    message.includes("hi")
  ) {
    return {
      type: "text",
      content:
        "Xin chào! Tôi là AI tư vấn của Elavia. Tôi có thể giúp bạn tìm kiếm sản phẩm, trả lời các câu hỏi về chính sách và hỗ trợ mua sắm. Bạn cần tôi giúp gì?",
    };
  }

  // Tìm kiếm sản phẩm với logic cải tiến
  if (
    message.includes("tìm") ||
    message.includes("sản phẩm") ||
    message.includes("áo") ||
    message.includes("quần") ||
    message.includes("váy") ||
    message.includes("đầm") ||
    message.includes("sơ mi") ||
    message.includes("thun") ||
    message.includes("khoác") ||
    message.includes("jean") ||
    message.includes("short") ||
    message.includes("nam") ||
    message.includes("nữ") ||
    message.includes("unisex") ||
    message.includes("muốn xem")
  ) {
    const products = await getRecommendedProducts(message);
    if (products.length > 0) {
      const product = products[0];

      // Phân tích size từ thông số cơ thể nếu có
      const recommendedSize = getRecommendedSizeFromMessage(message);

      // Chọn size phù hợp và có stock
      let selectedSize =
        product.sizes.find((s) => s.stock > 0) || product.sizes[0];
      if (recommendedSize) {
        // Tìm size khớp với gợi ý và có stock
        const matchingSize = product.sizes.find(
          (s) => s.size === recommendedSize && s.stock > 0
        );
        if (matchingSize) {
          selectedSize = matchingSize;
        } else {
          // Tìm size gần nhất có stock
          const availableSizes = product.sizes.filter((s) => s.stock > 0);
          if (availableSizes.length > 0) {
            const nearestSize = findNearestSize(
              recommendedSize,
              availableSizes.map((s) => s.size)
            );
            if (nearestSize) {
              selectedSize =
                availableSizes.find((s) => s.size === nearestSize) ||
                availableSizes[0];
            }
          }
        }
      }

      // Đảm bảo có tên sản phẩm từ Product model
      const productName = product.productId?.name || product.name || "Sản phẩm";
      const productImage =
        product.images?.main?.url ||
        product.images?.[0]?.url ||
        "/images/no-image.png";
      const productColor =
        product.color?.colorName || product.color?.name || "Đa màu";

      return {
        type: "product",
        content: JSON.stringify({
          variantId: product._id,
          name: productName,
          image: productImage,
          price: selectedSize.price,
          discount: product.discount || 0,
          color: productColor,
          size: selectedSize.size,
          stock: selectedSize.stock,
        }),
      };
    } else {
      return {
        type: "text",
        content:
          "Tôi không tìm thấy sản phẩm phù hợp. Bạn có thể mô tả chi tiết hơn về sản phẩm bạn muốn tìm không?",
      };
    }
  }

  // Câu hỏi về giá
  if (
    message.includes("giá") ||
    message.includes("bao nhiêu") ||
    message.includes("cost") ||
    message.includes("price")
  ) {
    return {
      type: "text",
      content:
        "Sản phẩm của chúng tôi có nhiều mức giá khác nhau từ 200.000đ - 2.000.000đ tùy theo loại sản phẩm. Bạn có sản phẩm cụ thể nào muốn hỏi giá không?",
    };
  }

  // Câu hỏi về giao hàng
  if (
    message.includes("giao hàng") ||
    message.includes("ship") ||
    message.includes("delivery")
  ) {
    return {
      type: "text",
      content:
        "Chúng tôi có các hình thức giao hàng:\n• Giao hàng tiêu chuẩn: 2-3 ngày (30.000đ)\n• Giao hàng nhanh: 1-2 ngày (50.000đ)\n• Miễn phí ship cho đơn hàng trên 500.000đ",
    };
  }

  // Câu hỏi về đổi trả
  if (
    message.includes("đổi") ||
    message.includes("trả") ||
    message.includes("return") ||
    message.includes("exchange")
  ) {
    return {
      type: "text",
      content:
        "Chính sách đổi trả của chúng tôi:\n• Đổi trả trong vòng 30 ngày\n• Sản phẩm chưa qua sử dụng\n• Còn nguyên tem, nhãn mác\n• Miễn phí đổi size trong 7 ngày đầu",
    };
  }

  // Câu hỏi về thanh toán
  if (
    message.includes("thanh toán") ||
    message.includes("payment") ||
    message.includes("pay")
  ) {
    return {
      type: "text",
      content:
        "Chúng tôi hỗ trợ các hình thức thanh toán:\n• COD (thanh toán khi nhận hàng)\n• Chuyển khoản ngân hàng\n• Ví điện tử: MoMo, ZaloPay\n• Thẻ tín dụng/ghi nợ",
    };
  }

  // Câu hỏi về size với phân tích thông số cơ thể
  if (
    message.includes("size") ||
    message.includes("kích cỡ") ||
    message.includes("cỡ")
  ) {
    const sizeRecommendation = analyzeSizeFromMessage(message);
    if (sizeRecommendation) {
      return {
        type: "text",
        content: sizeRecommendation,
      };
    } else {
      return {
        type: "text",
        content:
          "Chúng tôi có đầy đủ size từ S đến XXL. Bảng size chi tiết:\n• S: 45-50kg\n• M: 50-55kg\n• L: 55-65kg\n• XL: 65-75kg\n• XXL: 75kg trở lên\n\nBạn có thể cho tôi biết cân nặng và chiều cao để tôi tư vấn size phù hợp nhất!",
      };
    }
  }

  // Câu trả lời mặc định
  return {
    type: "text",
    content:
      "Tôi hiểu bạn đang cần hỗ trợ. Tuy nhiên, câu hỏi này hơi phức tạp. Bạn có muốn tôi kết nối với tư vấn viên con người để được hỗ trợ tốt hơn không?",
  };
};

// Phân tích size từ tin nhắn có chứa thông số cơ thể
const analyzeSizeFromMessage = (message) => {
  // Tìm cân nặng (kg)
  const weightMatch = message.match(/(\d+)\s*(kg|kí|ký)/i);
  // Tìm chiều cao (m hoặc cm) 
  const heightMatch = message.match(/(\d+(?:\.\d+)?)\s*m(?:\s|$)|(\d+)\s*cm/i);
  
  let weight = null;
  let height = null; // Tính bằng cm
  
  if (weightMatch) {
    weight = parseInt(weightMatch[1]);
  }
  
  if (heightMatch) {
    if (heightMatch[1]) {
      // Nếu có đơn vị mét (ví dụ: 1.8m)
      height = parseFloat(heightMatch[1]) * 100;
    } else if (heightMatch[2]) {
      // Nếu có đơn vị cm (ví dụ: 180cm)
      height = parseInt(heightMatch[2]);
    }
  }
  
  console.log('Analyzed body measurements:', { weight, height });
  
  // Nếu có đủ thông tin cân nặng và chiều cao
  if (weight && height) {
    // Tính BMI
    const heightInMeter = height / 100;
    const bmi = weight / (heightInMeter * heightInMeter);
    
    // Logic gợi ý size dựa trên cân nặng, chiều cao và BMI
    let recommendedSize;
    let explanation = '';
    
    if (weight <= 50) {
      recommendedSize = 'S';
      explanation = 'phù hợp với người có cân nặng nhẹ';
    } else if (weight <= 55) {
      recommendedSize = 'M';
      explanation = 'phù hợp với cân nặng trung bình';
    } else if (weight <= 65) {
      recommendedSize = 'L';
      explanation = 'phù hợp với cân nặng vừa phải';
    } else if (weight <= 75) {
      recommendedSize = 'XL';
      explanation = 'phù hợp với người có cân nặng khá';
    } else if (weight <= 85) {
      recommendedSize = 'XXL';
      explanation = 'phù hợp với cân nặng lớn';
    } else {
      // Cân nặng > 85kg
      recommendedSize = 'XXL+';
      explanation = 'bạn có thể cần size đặc biệt';
    }
    
    // Điều chỉnh dựa trên chiều cao
    if (height >= 180) {
      if (recommendedSize === 'S') recommendedSize = 'M';
      else if (recommendedSize === 'M') recommendedSize = 'L';
      else if (recommendedSize === 'L') recommendedSize = 'XL';
      explanation += '. Do chiều cao khá cao (>=1m8), tôi đã điều chỉnh size lên một cỡ';
    } else if (height <= 160) {
      if (recommendedSize === 'XL') recommendedSize = 'L';
      else if (recommendedSize === 'XXL') recommendedSize = 'XL';
      explanation += '. Do chiều cao khá thấp (<=1m6), size có thể nhỏ hơn một chút';
    }
    
    // Phản hồi với gợi ý cụ thể
    let response = `📏 **Phân tích thông số của bạn:**\n`;
    response += `• Cân nặng: ${weight}kg\n`;
    response += `• Chiều cao: ${height}cm (${(height/100).toFixed(1)}m)\n`;
    response += `• BMI: ${bmi.toFixed(1)} ${getBMICategory(bmi)}\n\n`;
    response += `🎯 **Gợi ý size: ${recommendedSize}**\n`;
    response += `${explanation}\n\n`;
    response += `📋 **Bảng size tham khảo:**\n`;
    response += `• S: 45-50kg\n`;
    response += `• M: 50-55kg\n`;
    response += `• L: 55-65kg\n`;
    response += `• XL: 65-75kg\n`;
    response += `• XXL: 75kg trở lên\n\n`;
    response += `💡 **Lưu ý:** Đây chỉ là gợi ý dựa trên thông số cơ bản. Để chọn size chính xác nhất, bạn nên đo 3 vòng (ngực-eo-mông) hoặc liên hệ tư vấn viên để được hỗ trợ chi tiết hơn!`;
    
    return response;
  }
  
  // Nếu chỉ có cân nặng
  if (weight) {
    let recommendedSize;
    if (weight <= 50) recommendedSize = 'S';
    else if (weight <= 55) recommendedSize = 'M';
    else if (weight <= 65) recommendedSize = 'L';
    else if (weight <= 75) recommendedSize = 'XL';
    else recommendedSize = 'XXL';
    
    let response = `⚖️ Với cân nặng ${weight}kg, tôi gợi ý size **${recommendedSize}**.\n\n`;
    response += `Tuy nhiên, để chọn size chính xác hơn, bạn có thể cho tôi biết thêm chiều cao không? Điều này sẽ giúp tôi tư vấn size phù hợp nhất! 😊`;
    
    return response;
  }
  
  return null; // Không có thông tin đủ để phân tích
};

// Phân loại BMI
const getBMICategory = (bmi) => {
  if (bmi < 18.5) return '(thiếu cân)';
  if (bmi < 25) return '(bình thường)';
  if (bmi < 30) return '(thừa cân)';
  return '(béo phì)';
};

// Lấy size gợi ý từ tin nhắn (rút gọn từ analyzeSizeFromMessage)
const getRecommendedSizeFromMessage = (message) => {
  const weightMatch = message.match(/(\d+)\s*(kg|kí|ký)/i);
  const heightMatch = message.match(/(\d+(?:\.\d+)?)\s*m(?:\s|$)|(\d+)\s*cm/i);
  
  let weight = null;
  let height = null;
  
  if (weightMatch) {
    weight = parseInt(weightMatch[1]);
  }
  
  if (heightMatch) {
    if (heightMatch[1]) {
      height = parseFloat(heightMatch[1]) * 100;
    } else if (heightMatch[2]) {
      height = parseInt(heightMatch[2]);
    }
  }
  
  // Chỉ trả về size gợi ý, không phải text đầy đủ
  if (weight) {
    let recommendedSize;
    
    if (weight <= 50) recommendedSize = 'S';
    else if (weight <= 55) recommendedSize = 'M';
    else if (weight <= 65) recommendedSize = 'L';
    else if (weight <= 75) recommendedSize = 'XL';
    else recommendedSize = 'XXL';
    
    // Điều chỉnh theo chiều cao
    if (height >= 180) {
      if (recommendedSize === 'S') recommendedSize = 'M';
      else if (recommendedSize === 'M') recommendedSize = 'L';
      else if (recommendedSize === 'L') recommendedSize = 'XL';
      else if (recommendedSize === 'XL') recommendedSize = 'XXL';
    } else if (height <= 160) {
      if (recommendedSize === 'XL') recommendedSize = 'L';
      else if (recommendedSize === 'XXL') recommendedSize = 'XL';
    }
    
    return recommendedSize;
  }
  
  return null;
};

// Tìm size gần nhất có sẵn
const findNearestSize = (targetSize, availableSizes) => {
  const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const targetIndex = sizeOrder.indexOf(targetSize);
  
  if (targetIndex === -1) return availableSizes[0]; // Nếu không tìm thấy, trả về size đầu tiên
  
  // Tìm size gần nhất
  for (let i = 0; i < sizeOrder.length; i++) {
    const checkSize = sizeOrder[targetIndex + i] || sizeOrder[targetIndex - i];
    if (checkSize && availableSizes.includes(checkSize)) {
      return checkSize;
    }
  }
  
  return availableSizes[0]; // Fallback
};

// Helper function để tìm categoryId theo hierarchy
const findCategoryByHierarchy = async (genderName, productTypeName) => {
  try {
    console.log(`🔍 Finding category for: ${genderName} -> ${productTypeName}`);
    
    // Bước 1: Tìm gender category (level 1)
    const genderCategory = await Category.findOne({
      name: { $regex: new RegExp(genderName, 'i') },
      level: 1
    });
    
    if (!genderCategory) {
      console.log('❌ Gender category not found:', genderName);
      return null;
    }
    
    console.log('✅ Found gender category:', genderCategory.name, genderCategory._id);
    
    // Bước 2: Tìm tất cả subcategories level 2 của gender
    const level2Categories = await Category.find({
      parentId: genderCategory._id,
      level: 2
    });
    
    console.log('📂 Level 2 categories:', level2Categories.map(c => c.name));
    
    // Bước 3: Tìm product category (level 3) trong các level 2 categories
    for (const level2Cat of level2Categories) {
      const productCategories = await Category.find({
        parentId: level2Cat._id,
        level: 3,
        name: { $regex: new RegExp(productTypeName, 'i') }
      });
      
      if (productCategories.length > 0) {
        const foundCategory = productCategories[0];
        console.log('✅ Found product category:', foundCategory.name, foundCategory._id);
        console.log('🎯 Full hierarchy:', `${genderCategory.name} -> ${level2Cat.name} -> ${foundCategory.name}`);
        return foundCategory._id;
      }
    }
    
    console.log('❌ Product category not found:', productTypeName);
    return null;
    
  } catch (error) {
    console.error('Error finding category:', error);
    return null;
  }
};

// Tìm sản phẩm gợi ý dựa trên từ khóa và category hierarchy với logic cải tiến và category hierarchy
const getRecommendedProducts = async (query) => {
  try {
    console.log('🔍 AI searching for:', query);
    
    // Chuẩn hóa và phân tích query
    const normalizedQuery = query.toLowerCase();
    let searchTerms = [];
    let genderFilter = null;
    let categoryIds = [];
    
    // Phân tích giới tính từ query
    if (normalizedQuery.includes('nam') || normalizedQuery.includes('men')) {
      genderFilter = 'Nam'; // Đảm bảo case đúng với database
    } else if (normalizedQuery.includes('nữ') || normalizedQuery.includes('women')) {
      genderFilter = 'Nữ'; // Đảm bảo case đúng với database
    }
    
    console.log('👤 Gender filter:', genderFilter);
    
    // Phân tích loại sản phẩm và tìm category tương ứng
    const productTypeMapping = {
      'áo sơ mi': 'Áo sơ mi',
      'sơ mi': 'Áo sơ mi', 
      'shirt': 'Áo sơ mi',
      'áo thun': 'Áo thun',
      'thun': 'Áo thun',
      't-shirt': 'Áo thun',
      'áo khoác': 'Áo khoác',
      'khoác': 'Áo khoác',
      'jacket': 'Áo khoác',
      'quần jean': 'Quần jean',
      'jean': 'Quần jean',
      'jeans': 'Quần jean',
      'quần âu': 'Quần âu',
      'âu': 'Quần âu',
      'váy': 'Váy',
      'dress': 'Váy',
      'đầm': 'Đầm',
      'quần short': 'Quần short',
      'short': 'Quần short'
    };
    
    let detectedProductType = null;
    
    // Tìm loại sản phẩm từ query
    for (const [keyword, categoryName] of Object.entries(productTypeMapping)) {
      if (normalizedQuery.includes(keyword)) {
        detectedProductType = categoryName;
        console.log(`📦 Detected product type: ${categoryName}`);
        break;
      }
    }
    
    // Nếu tìm thấy loại sản phẩm, tìm category hierarchy
    if (detectedProductType && genderFilter) {
      const categoryId = await findCategoryByHierarchy(genderFilter, detectedProductType);
      if (categoryId) {
        categoryIds.push(categoryId);
        console.log('✅ Using category hierarchy search with categoryId:', categoryId);
      } else {
        console.log('❌ No matching category found, falling back to text search');
      }
    }
    
    // Nếu không tìm thấy category, dùng search terms như cũ
    if (categoryIds.length === 0) {
      if (detectedProductType) {
        searchTerms.push(detectedProductType.toLowerCase());
      }
      if (genderFilter) {
        searchTerms.push(genderFilter);
      }
      
      // Thêm các từ khóa khác từ query
      const additionalTerms = normalizedQuery.split(' ').filter(word => 
        word.length > 2 && 
        !['tôi', 'muốn', 'xem', 'cần', 'tìm', 'cho', 'của', 'một', 'cái', 'dành'].includes(word)
      );
      searchTerms.push(...additionalTerms);
    }
    
    console.log('� Category IDs found:', categoryIds);
    console.log('�🏷️ Fallback search terms:', searchTerms);
    
    let products = [];
    
    // Ưu tiên tìm kiếm theo category trước
    if (categoryIds.length > 0) {
      console.log('🎯 Searching by category hierarchy...');
      console.log('🎯 Target categoryIds:', categoryIds);
      
      // Tìm trực tiếp Product có categoryId phù hợp
      const matchingProducts = await Product.find({
        categoryId: { $in: categoryIds }
      }).select('_id name description shortDescription categoryId');

      console.log(`🔍 Found ${matchingProducts.length} Products with matching categoryId`);
      
      // Debug: Show all matching products
      matchingProducts.forEach((product, index) => {
        console.log(`📦 Product ${index + 1}: "${product.name}" (CategoryId: ${product.categoryId})`);
      });

      if (matchingProducts.length > 0) {
        // Lấy ProductVariant từ những Product đã tìm được
        const productIds = matchingProducts.map(p => p._id);
        
        products = await ProductVariant.find({
          productId: { $in: productIds },
          status: true,
          'sizes.stock': { $gt: 0 }
        })
        .populate({
          path: 'productId',
          select: 'name description shortDescription categoryId'
        })
        .limit(10)
        .sort({ 
          'sizes.stock': -1,
          createdAt: -1
        });

        console.log(`📦 Found ${products.length} ProductVariants from matching Products`);
        
        // Debug: Show final products
        products.forEach((variant, index) => {
          console.log(`✅ Final Product ${index + 1}: "${variant.productId?.name || 'No name'}" (CategoryId: ${variant.productId?.categoryId})`);
        });
      }
      
      console.log(` Found ${products.length} products by category`);
    }
    
    // Nếu không tìm thấy sản phẩm theo category hoặc không có category, dùng text search
    if (products.length === 0 && searchTerms.length > 0) {
      console.log('🔄 Fallback to text search...');
      
      const searchRegex = new RegExp(searchTerms.join('|'), 'i');
      
      // Tìm trong Product table trước
      const matchingProducts = await Product.find({
        $or: [
          { 'name': searchRegex },
          { 'description': searchRegex },
          { 'shortDescription': searchRegex }
        ]
      }).select('_id');

      const productIds = matchingProducts.map(p => p._id);
      
      // Sau đó tìm ProductVariant
      let searchConditions = {
        status: true,
        'sizes.stock': { $gt: 0 }
      };
      
      if (productIds.length > 0) {
        searchConditions.$or = [
          { 'productId': { $in: productIds } },
          { 'color.colorName': searchRegex },
          { 'attributes.value': searchRegex },
          { 'sku': searchRegex }
        ];
      } else {
        searchConditions.$or = [
          { 'color.colorName': searchRegex },
          { 'attributes.value': searchRegex },
          { 'sku': searchRegex }
        ];
      }
      
      products = await ProductVariant.find(searchConditions)
        .populate('productId', 'name description shortDescription categoryId')
        .limit(10)
        .sort({ 
          'sizes.stock': -1,
          createdAt: -1
        });
        
      console.log(`📦 Found ${products.length} products by text search`);
    }
    
    // Filter theo gender nếu cần 
    if (genderFilter) {
      console.log(`🔍 Filtering products by gender: ${genderFilter}`);
      
      const filteredProducts = products.filter(product => {
        if (!product.productId) return false;
        
        // Nếu đã tìm theo category hierarchy, tin tưởng kết quả
        if (categoryIds.length > 0) {
          console.log(`✅ Product from category hierarchy: ${product.productId.name}`);
          return true;
        }
        
        // Nếu là text search, filter theo text
        const productName = product.productId.name?.toLowerCase() || '';
        const description = product.productId.description?.toLowerCase() || '';
        const attributes = product.attributes || [];
        
        const genderMatch = productName.includes(genderFilter.toLowerCase()) || 
               description.includes(genderFilter.toLowerCase()) ||
               attributes.some(attr => attr.value?.toLowerCase().includes(genderFilter.toLowerCase()));
               
        console.log(`${genderMatch ? '✅' : '❌'} Gender filter for "${product.productId.name}": ${genderMatch}`);
        return genderMatch;
      });
      
      if (filteredProducts.length > 0) {
        products = filteredProducts;
        console.log(`🎯 After gender filter: ${products.length} products`);
      } else {
        console.log('⚠️ No products match gender filter, keeping original results');
      }
    }
    
    console.log(`✅ Final result: ${products.length} products`);
    return products.slice(0, 5);
    
  } catch (error) {
    console.error('❌ Error getting recommended products:', error);
    return [];
  }
};

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

    // Nếu là user gửi tin nhắn và conversation có bật AI, trigger AI response
    if (senderType === "user") {
      // Trigger AI response asynchronously (không chờ để response nhanh)
      setTimeout(async () => {
        await processAIResponse(conversationId, content);
      }, 1000); // Delay 1 giây để giống như admin thật sự đang typing
    }

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

// AI Response - Gửi tin nhắn tự động từ AI
export const sendAIMessage = async (req, res) => {
  try {
    const { conversationId, enableAI = false } = req.body;
    const userId = req.user.id;

    // Kiểm tra conversation tồn tại và thuộc về user
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || conversation.userId.toString() !== userId.toString()) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc trò chuyện",
      });
    }

    // Cập nhật trạng thái AI cho conversation
    await Conversation.findByIdAndUpdate(conversationId, { 
      aiEnabled: enableAI,
      status: enableAI ? 'active' : conversation.status 
    });

    res.json({
      success: true,
      message: enableAI ? 'Đã bật tư vấn viên AI' : 'Đã tắt tư vấn viên AI',
      aiEnabled: enableAI
    });

  } catch (error) {
    console.error("AI toggle error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật AI",
      error: error.message,
    });
  }
};

// Process AI Response sau khi user gửi tin nhắn
export const processAIResponse = async (conversationId, userMessage) => {
  try {
    // Kiểm tra conversation có bật AI không
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.aiEnabled) {
      return;
    }

    // Tạo AI response
    const aiResponse = await generateAIResponse(userMessage, conversation);
    
    // Tạo fake admin user cho AI
    const aiAdminUser = {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
      name: 'AI Assistant',
      email: 'ai@elavia.com'
    };
    
    // Lưu tin nhắn AI vào DB
    const aiMessage = new Message({
      conversationId,
      senderId: aiAdminUser._id,
      senderType: 'admin',
      type: aiResponse.type,
      content: aiResponse.content,
    });

    await aiMessage.save();

    // Manual populate để tránh lỗi populate với fake ID
    aiMessage.senderId = aiAdminUser;

    // Cập nhật conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: new Date(),
      status: 'active'
    });

    console.log('AI response sent:', aiResponse);
    return aiMessage;

  } catch (error) {
    console.error('Process AI response error:', error);
  }
};

// Lấy tin nhắn trong conversation
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;



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

// Cập nhật trạng thái AI cho conversation
export const updateConversationAI = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { enableAI = false } = req.body;
    const userId = req.user.id;

    console.log("Update AI status:", {
      conversationId,
      enableAI,
      userId,
      isValidObjectId: mongoose.Types.ObjectId.isValid(conversationId)
    });

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "ID cuộc trò chuyện không hợp lệ",
      });
    }

    // Kiểm tra conversation tồn tại và thuộc về user
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc trò chuyện",
      });
    }

    // Kiểm tra quyền
    if (conversation.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền cập nhật cuộc trò chuyện này",
      });
    }

    // Cập nhật trạng thái AI
    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId, 
      { 
        aiEnabled: enableAI,
        status: enableAI ? 'active' : conversation.status 
      },
      { new: true }
    );

    // Tạo system message thông báo
    const aiUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
    const systemMessage = new Message({
      conversationId,
      senderId: aiUserId,
      senderType: "admin",
      type: "text",
      content: enableAI 
        ? "🤖 **Tư vấn viên AI đã được kích hoạt!**\n\nTôi sẽ hỗ trợ bạn ngay lập tức với:\n• Tìm kiếm sản phẩm\n• Tư vấn size\n• Chính sách mua hàng\n\nHãy hỏi tôi bất cứ điều gì!" 
        : "👨‍💼 **Tư vấn viên AI đã được tắt.**\n\nBạn có thể chờ tư vấn viên con người hỗ trợ hoặc bật lại AI bất cứ lúc nào.",
    });

    await systemMessage.save();

    console.log("✅ AI status updated successfully");

    res.json({
      success: true,
      message: enableAI ? 'Đã bật tư vấn viên AI' : 'Đã tắt tư vấn viên AI',
      aiEnabled: enableAI,
      conversation: updatedConversation
    });

  } catch (error) {
    console.error("❌ Update AI status error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật trạng thái AI",
      error: error.message,
    });
  }
};
