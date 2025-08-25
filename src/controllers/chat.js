import Conversation from "../models/conversation.js";
import Message from "../models/message.js";
import User from "../models/user.js";
import cloudinary from "../config/cloudinary.js";
import Product from "../models/product.js";
import ProductVariant from "../models/productVariant.js";
import Category from "../models/categories.js";
import mongoose from "mongoose";
import { GoogleGenerativeAI } from '@google/generative-ai';

// Khởi tạo Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// AI Response Generator với Gemini AI
const generateAIResponse = async (userMessage, conversation) => {
  try {
    console.log("🤖 AI Processing message:", userMessage);

    // 1. Phân tích intent của user bằng Gemini AI
    const intentAnalysis = await analyzeUserIntent(userMessage);
    console.log("🎯 AI Intent analysis:", intentAnalysis);

    // 2. Nếu có intent tìm sản phẩm, tìm sản phẩm phù hợp
    if (
      intentAnalysis.intent === "product_search" ||
      intentAnalysis.intent === "product_recommendation"
    ) {
      const products = await getAIRecommendedProducts(
        intentAnalysis,
        userMessage
      );

      if (products.length > 0) {
        // Tạo response kết hợp text + sản phẩm
        const aiResponse = await generateProductResponse(
          intentAnalysis,
          products[0],
          userMessage
        );

        return {
          type: "mixed", // Loại response mới: text + product
          content: JSON.stringify({
            text: aiResponse.text,
            product: aiResponse.product,
          }),
        };
      } else {
        // Không tìm thấy sản phẩm, trả về thông báo liên hệ hotline
        const response = "Xin lỗi, tôi không tìm thấy sản phẩm phù hợp với yêu cầu của bạn. Vui lòng liên hệ Admin qua hotline 0353 608 533 để được hỗ trợ tư vấn chi tiết hơn! 📞";
        return {
          type: "text",
          content: response,
        };
      }
    }

    // 3. Với các intent khác (FAQ, size advice, etc.)
    const response = await generateTextResponse(userMessage, intentAnalysis);
    return {
      type: "text",
      content: response,
    };
  } catch (error) {
    console.error("❌ AI Error:", error);
    // Fallback về rule-based cũ nếu AI lỗi
    return await generateFallbackResponse(userMessage);
  }
};

// Phân tích intent của user bằng Gemini AI
const analyzeUserIntent = async (userMessage) => {
  try {
    const prompt = `
Bạn là AI phân tích intent cho hệ thống tư vấn bán hàng thời trang Việt Nam.
Phân tích tin nhắn sau và trả về JSON với format chính xác:

Tin nhắn: "${userMessage}"

QUAN TRỌNG - Phân tích đúng người nhận sản phẩm:
Khi user nói "cho người yêu tôi, tôi là nam" → người nhận là NGƯỜI YÊU (nữ), không phải user (nam)

LOGIC PHÂN TÍCH GENDER:
1. "cho người yêu tôi" + user là nam → gender: "nữ"
2. "cho người yêu tôi" + user là nữ → gender: "nam"  
3. "cho bạn gái" → gender: "nữ"
4. "cho bạn trai" → gender: "nam"
5. "cho vợ" → gender: "nữ" 
6. "cho chồng" → gender: "nam"
7. "cho mẹ/chị/em gái" → gender: "nữ"
8. "cho bố/anh/em trai" → gender: "nam"
9. "tôi muốn áo sơ mi nam" → gender: "nam"

Trả về JSON với format:
{
  "intent": "product_search|product_recommendation|faq|size_advice|greeting|complaint|other",
  "category": "áo sơ mi|áo thun|quần jean|váy|đầm|áo khoác|quần short|crop top|tank top|null",
  "gender": "nam|nữ|unisex|null", 
  "keywords": ["keyword1", "keyword2"],
  "hasPromotion": true/false,
  "bodyMeasurements": {
    "weight": number|null,
    "height": number|null
  },
  "targetGender": "nam|nữ|unisex|null",
  "buyerInfo": "mua cho bản thân|mua cho người khác",
  "colorPreference": "trắng|đen|đỏ|xanh|null",
  "price": { "min": number|null, "max": number|null }
}

PHÂN TÍCH KHOẢNG GIÁ:
- "trên 500k", "từ 500k", "500k trở lên" → price: {"min": 500000, "max": null}
- "dưới 300k", "dưới 300 nghìn" → price: {"min": null, "max": 300000}
- "từ 200k đến 500k", "200-500k" → price: {"min": 200000, "max": 500000}
- "khoảng 400k", "tầm 400k" → price: {"min": 350000, "max": 450000}
- "giá rẻ" → price: {"min": null, "max": 200000}
- "cao cấp", "đắt tiền" → price: {"min": 500000, "max": null}

VÍ DỤ PHÂN TÍCH CHÍNH XÁC:
- "áo sơ mi trắng nữ trên 600k" 
  → gender: "nữ", colorPreference: "trắng", price: {"min": 600000, "max": null}
- "tôi muốn áo thun dưới 200k"
  → gender: "unisex", price: {"min": null, "max": 200000}
- "áo khoác từ 300k đến 800k"
  → price: {"min": 300000, "max": 800000}

Category mapping:
- crop top: "croptop", "crop top", "crop-top", "áo ngắn", "áo bó"
- tank top: "tanktop", "tank top", "tank-top", "áo ba lỗ", "áo 2 dây"
- áo sơ mi: "sơ mi", "shirt"
- áo thun: "thun", "t-shirt", "tshirt" (KHÔNG bao gồm croptop)
- quần jean: "jean", "jeans"
- váy: "váy", "skirt", "dress"
- đầm: "đầm", "dress"
- áo khoác: "khoác", "jacket"
- quần short: "short", "shorts"

QUAN TRỌNG: 
- gender và targetGender phải giống nhau và là giới tính của người SẼ DÙNG sản phẩm
- Phân tích context "cho ai" để xác định đúng gender
- Chỉ trả về JSON, không thêm text khác!
- Nếu không tìm thấy sản phẩm phù hợp thì trả về không có sản phẩm phù hợp thì bạn hãy liên hệ với Admin qua hotline 0353 608 533.
`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    const regex = /(\d+)\s*(k|nghìn|ngàn|tr|triệu|trieu)?/g;

    console.log("🤖 Gemini raw response:", text);

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);

      // Đảm bảo targetGender luôn giống gender
      if (!analysis.targetGender) {
        analysis.targetGender = analysis.gender;
      }

      // Thêm colorPreference nếu chưa có
      if (!analysis.colorPreference) {
        const colorMap = {
          trắng: "white",
          đen: "black",
          đỏ: "red",
          xanh: "blue",
          vàng: "yellow",
          hồng: "pink",
          nâu: "brown",
          xám: "gray",
          tím: "purple",
        };
        const messageText = userMessage.toLowerCase();
        for (const [vnColor, enColor] of Object.entries(colorMap)) {
          if (messageText.includes(vnColor)) {
            analysis.colorPreference = enColor;
            break;
          }
        }
      }

      // Thêm priceRange nếu chưa có hoặc AI không extract đúng
      const extractprice = (message) => {
        const text = message.toLowerCase();
        const regex = /(\d+)\s*(k|nghìn|ngàn|tr|triệu|trieu)?/g; // Thêm \s* để handle khoảng trắng
        let numbers = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
          let value = parseInt(match[1], 10);
          
          // Chỉ nhân một lần dựa trên đơn vị
          if (match[2]) {
            if (["k", "nghìn", "ngàn"].includes(match[2])) {
              value *= 1000;
            } else if (["tr", "triệu", "trieu"].includes(match[2])) {
              value *= 1000000;
            }
          }
          
          numbers.push(value);
          console.log(`💰 Extracted: "${match[0]}" → ${value}đ`);
        }
        let min = null,
          max = null;
        if (numbers.length === 1) {
          if (
            text.includes("dưới") ||
            text.includes("nhỏ hơn") ||
            text.includes("không quá")
          ) {
            max = numbers[0];
          } else if (
            text.includes("trên") ||
            text.includes("từ") ||
            text.includes("lớn hơn")
          ) {
            min = numbers[0];
          }
        } else if (numbers.length >= 2) {
          min = Math.min(numbers[0], numbers[1]);
          max = Math.max(numbers[0], numbers[1]);
        }
        return { min, max };
      };

      const extractedPrice = extractprice(userMessage);
      
      // Debug: luôn log để kiểm tra
      console.log('💰 Price analysis debug:', {
        originalMessage: userMessage,
        aiPrice: analysis.price,
        extractedPrice: extractedPrice,
        willUseExtracted: !analysis.price || (extractedPrice.min || extractedPrice.max)
      });
      
      // Ưu tiên extracted price nếu AI không extract được hoặc extract sai
      if (!analysis.price || (extractedPrice.min || extractedPrice.max)) {
        analysis.price = extractedPrice;
        console.log('💰 Using extracted price:', analysis.price);
      }

      // Xử lý unisex
      if (userMessage.toLowerCase().includes("unisex")) {
        analysis.gender = "unisex";
        analysis.targetGender = "unisex";
      }

      // Log để debug
      console.log("🎯 Intent analysis result:", {
        originalMessage: userMessage,
        detectedGender: analysis.gender,
        targetGender: analysis.targetGender,
        buyerInfo: analysis.buyerInfo,
        colorPreference: analysis.colorPreference,
        category: analysis.category,
        price: analysis.price,
      });

      return analysis;
    }

    throw new Error("Invalid JSON response from AI");
  } catch (error) {
    console.error("❌ Intent analysis error:", error);
    // Fallback analysis đơn giản
    return {
      intent:
        userMessage.toLowerCase().includes("tìm") ||
        userMessage.toLowerCase().includes("sản phẩm")
          ? "product_search"
          : "other",
      category: null,
      gender: null,
      keywords: [],
      hasPromotion: false,
      bodyMeasurements: { weight: null, height: null },
      targetGender: null,
      buyerInfo: "mua cho bản thân",
      colorPreference: null,
      price: { min: null, max: null },
    };
  }
};

// Tìm sản phẩm dựa trên phân tích AI với logic tìm category sâu nhất
const getAIRecommendedProducts = async (intentAnalysis, originalMessage) => {
  try {
    console.log('🛍️ AI Product search with analysis:', intentAnalysis);
    console.log('📝 Original message:', originalMessage);
    
    // BƯỚC 1: Phân tích chi tiết input của user
    const deepAnalysis = await analyzeUserInputForCategory(originalMessage, intentAnalysis);
    console.log('🔬 Deep category analysis:', deepAnalysis);
    
    // BƯỚC 2: Tìm category sâu nhất dựa trên phân tích
    const deepestCategory = await findDeepestMatchingCategory(deepAnalysis);
    console.log('🎯 Deepest category found:', deepestCategory);
    
    if (!deepestCategory) {
      console.log('❌ No matching category found');
      return [];
    }
    
    // BƯỚC 3: Tìm sản phẩm trong bảng Products theo categoryId chính xác
    const products = await findProductsByCategoryId(deepestCategory._id);
    console.log(`📦 Found ${products.length} products with categoryId: ${deepestCategory._id}`);
    
    // BƯỚC 4: Lấy ProductVariant tương ứng và format kết quả
    const formattedProducts = await getProductVariantsAndFormat(products, deepAnalysis);
    
    console.log(`✅ Final formatted products: ${formattedProducts.length}`);
    
    return formattedProducts;
    
  } catch (error) {
    console.error('❌ AI Product search error:', error);
    return [];
  }
};

// Phân tích sâu input của user để xác định category
const analyzeUserInputForCategory = async (originalMessage, intentAnalysis) => {
  try {
    const prompt = `
Phân tích chi tiết tin nhắn người dùng để tìm category thời trang chính xác nhất:

Tin nhắn: "${originalMessage}"
Intent đã có: ${JSON.stringify(intentAnalysis)}

QUAN TRỌNG: Xác định đúng giới tính người sẽ dùng sản phẩm:
- "mua cho người yêu" → gender: "Nữ" (vì người yêu của nam thường là nữ)
- "mua cho bạn gái" → gender: "Nữ"  
- "mua cho vợ" → gender: "Nữ"
- "mua cho mẹ" → gender: "Nữ"
- "mua cho chồng" → gender: "Nam"
- "mua cho bạn trai" → gender: "Nam" 
- "mua cho bố" → gender: "Nam"

PHÂN TÍCH BUYER CONTEXT:
- Khi nói "tôi là nam" + "cho người yêu tôi" → buyerContext: "mua cho người yêu"
- Khi nói "tôi là nữ" + "cho bạn trai" → buyerContext: "mua cho bạn trai"

QUAN TRỌNG VỀ PHÂN LOẠI SẢN PHẨM:
- "croptop" hoặc "crop top" → subCategory: "Crop top" (là category riêng biệt)
- "áo thun" → subCategory: "Thun" (category áo thun thông thường)
- Crop top và áo thun là 2 loại khác nhau hoàn toàn
- "tank top" → specificType: "tank top", subCategory: "Thun" 
- KHÔNG được nhầm lẫn giữa crop top và áo thun

Hãy phân tích và trả về JSON:
{
  "gender": "Nam|Nữ|Unisex",
  "mainCategory": "Áo|Quần|Váy|Đầm|Phụ kiện|Giày dép",
  "subCategory": "Sơ mi|Thun|Khoác|Jean|Short|Dài|...",
  "specificType": "tank top|polo|hoodie|skinny|straight|...",
  "keywords": ["từ khóa chính xác"],
  "searchPriority": "specific|sub|main|gender",
  "colorPreference": "trắng|đen|đỏ|xanh|...",
  "buyerContext": "mua cho bản thân|mua cho người yêu|mua cho bạn gái|mua cho vợ|mua cho chồng|mua cho bạn trai|mua cho gia đình|..."
}

Quy tắc phân tích:
1. Gender: Giới tính của người SẼ DÙNG sản phẩm (QUAN TRỌNG - không phải người mua)
2. MainCategory: Loại sản phẩm chính (Áo, Quần, Váy...)
3. SubCategory: Loại con cụ thể (Sơ mi, Thun, Jean...)
4. SpecificType: Kiểu dáng đặc biệt (crop top, tank top, polo...)
5. ColorPreference: Màu sắc yêu cầu
6. BuyerContext: Bối cảnh mua hàng chi tiết

Ví dụ phân tích đúng:
- "áo croptop" → gender: "Nữ", mainCategory: "Áo", subCategory: "Crop top"
- "áo thun nam" → gender: "Nam", mainCategory: "Áo", subCategory: "Thun"
- "áo sơ mi cho người yêu tôi, tôi là nam" → gender: "Nữ", buyerContext: "mua cho người yêu"
- "áo thun nam size L" → gender: "Nam", buyerContext: "mua cho bản thân"
- "váy đẹp cho vợ" → gender: "Nữ", mainCategory: "Váy", buyerContext: "mua cho vợ"
- "áo khoác cho bạn trai" → gender: "Nam", buyerContext: "mua cho bạn trai"

Chỉ trả về JSON:
`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    console.log('🤖 Category analysis response:', response);
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      
      // QUAN TRỌNG: Logic override gender dựa trên buyer context
      let finalGender = analysis.gender;
      
      // Nếu mua cho người yêu → cần xem giới tính của người mua để xác định giới tính người yêu
      if (analysis.buyerContext && analysis.buyerContext.includes('người yêu')) {
        // Tìm giới tính người mua từ tin nhắn gốc
        const buyerGender = originalMessage.toLowerCase().includes('tôi là nam') ? 'nam' :
                           originalMessage.toLowerCase().includes('tôi là nữ') ? 'nữ' : null;
        
        if (buyerGender === 'nam') {
          finalGender = 'Nữ'; // Nam mua cho người yêu → người yêu là Nữ
          console.log('🚻 Buyer is male → người yêu is female → gender: "Nữ"');
        } else if (buyerGender === 'nữ') {
          finalGender = 'Nam'; // Nữ mua cho người yêu → người yêu là Nam  
          console.log('🚻 Buyer is female → người yêu is male → gender: "Nam"');
        }
      }
      
      // Nếu mua cho bạn gái/vợ → gender phải là "Nữ"
      else if (analysis.buyerContext && 
               (analysis.buyerContext.includes('bạn gái') ||
                analysis.buyerContext.includes('vợ') ||
                analysis.buyerContext.includes('mẹ') ||
                analysis.buyerContext.includes('chị') ||
                analysis.buyerContext.includes('em gái'))) {
        finalGender = 'Nữ';
        console.log('🚻 Override gender to "Nữ" based on buyer context:', analysis.buyerContext);
      }
      
      // Nếu mua cho chồng/bạn trai/bố → gender phải là "Nam"  
      else if (analysis.buyerContext && 
               (analysis.buyerContext.includes('chồng') ||
                analysis.buyerContext.includes('bạn trai') ||
                analysis.buyerContext.includes('bố') ||
                analysis.buyerContext.includes('anh') ||
                analysis.buyerContext.includes('em trai'))) {
        finalGender = 'Nam';
        console.log('🚻 Override gender to "Nam" based on buyer context:', analysis.buyerContext);
      }
      
      // Override từ intent analysis nếu có
      else if (intentAnalysis.targetGender && intentAnalysis.buyerInfo === 'mua cho người khác') {
        // Nhưng vẫn cần check buyer context để đảm bảo chính xác
        if (intentAnalysis.targetGender === 'nữ' || intentAnalysis.targetGender === 'Nữ') {
          finalGender = 'Nữ';
        } else if (intentAnalysis.targetGender === 'nam' || intentAnalysis.targetGender === 'Nam') {
          finalGender = 'Nam';
        }
      }
      
      // Set gender cuối cùng
      analysis.gender = finalGender;
      
      // Thêm price từ intentAnalysis nếu có
      if (intentAnalysis.price) {
        analysis.price = intentAnalysis.price;
        console.log('💰 Price from intent analysis:', analysis.price);
      }
      
      // Override subCategory cho crop top nếu cần thiết
      if (analysis.subCategory && analysis.subCategory.toLowerCase().includes('thun') && 
          originalMessage.toLowerCase().includes('crop')) {
        analysis.subCategory = 'Crop top';
        console.log('👕 Override subCategory to "Crop top" for crop-related message');
      }
      
      console.log('�🔍 Final gender determination:', {
        originalGender: intentAnalysis.gender,
        targetGender: intentAnalysis.targetGender,
        buyerInfo: intentAnalysis.buyerInfo,
        buyerContext: analysis.buyerContext,
        finalGender: analysis.gender,
        subCategory: analysis.subCategory,
        overrideReason: analysis.buyerContext
      });
      
      return analysis;
    }
    
    // Fallback
    return {
      gender: intentAnalysis.targetGender || intentAnalysis.gender || null,
      mainCategory: null,
      subCategory: intentAnalysis.category || null,
      specificType: null,
      keywords: intentAnalysis.keywords || [],
      searchPriority: "sub",
      colorPreference: null,
      buyerContext: intentAnalysis.buyerInfo || "mua cho bản thân"
    };
    
  } catch (error) {
    console.error('❌ Category analysis error:', error);
    return {
      gender: intentAnalysis.targetGender || intentAnalysis.gender || null,
      mainCategory: null,
      subCategory: intentAnalysis.category || null,
      specificType: null,
      keywords: intentAnalysis.keywords || [],
      searchPriority: "keyword",
      colorPreference: null,
      buyerContext: intentAnalysis.buyerInfo || "mua cho bản thân"
    };
  }
};

// Tìm category sâu nhất phù hợp
const findDeepestMatchingCategory = async (analysis) => {
  try {
    console.log('🔍 Finding deepest category with analysis:', analysis);
    
    let foundCategories = [];
    
    // BƯỚC 0: Tìm trong gender hierarchy trước nếu có gender
    if (analysis.gender) {
      console.log(`🚻 First, finding gender root categories for: ${analysis.gender}`);
      
      // Tìm gender root categories
      const genderRootCategories = await Category.find({
        $or: [
          { name: /^(nam|nữ|unisex|men|women)$/i, level: 1 },
          { level: 1, name: { $in: ['Nam', 'Nữ', 'Unisex', 'Men', 'Women'] } }
        ]
      });
      
      // Filter theo gender cụ thể
      const targetGenderCategories = genderRootCategories.filter(cat => 
        cat.name.toLowerCase().includes(analysis.gender.toLowerCase())
      );
      
      console.log(`🎯 Found ${targetGenderCategories.length} root gender categories:`);
      targetGenderCategories.forEach(cat => {
        console.log(`  👤 "${cat.name}" (Level: ${cat.level})`);
      });
      
      if (targetGenderCategories.length > 0) {
        // Tìm trong gender hierarchy trước
        if (analysis.subCategory) {
          console.log(`🔍 Searching for sub category "${analysis.subCategory}" within gender hierarchy`);
          const genderSubCategories = await findCategoriesInHierarchy(targetGenderCategories, analysis.subCategory);
          
          if (genderSubCategories.length > 0) {
            foundCategories = genderSubCategories;
            console.log(`✅ Found ${genderSubCategories.length} sub categories in gender hierarchy`);
          }
        }
        
        // Nếu chưa tìm thấy, tìm theo main category trong gender hierarchy
        if (foundCategories.length === 0 && analysis.mainCategory) {
          console.log(`📂 Searching for main category "${analysis.mainCategory}" within gender hierarchy`);
          const genderMainCategories = await findCategoriesInHierarchy(targetGenderCategories, analysis.mainCategory);
          
          if (genderMainCategories.length > 0) {
            foundCategories = genderMainCategories;
            console.log(`✅ Found ${genderMainCategories.length} main categories in gender hierarchy`);
          }
        }
        
        if (foundCategories.length > 0) {
          console.log(`🎯 Found categories in gender hierarchy, skipping global search`);
        } else {
          console.log(`🔄 No categories found in gender hierarchy, falling back to global search`);
        }
      }
    }
    
    // BƯỚC 1: Tìm theo specific type trước (cao nhất) - chỉ khi chưa tìm thấy trong gender hierarchy
    if (foundCategories.length === 0 && analysis.specificType) {
      console.log(`🎯 Global search for specific type: ${analysis.specificType}`);
      
      const specificCategories = await Category.find({
        name: { $regex: new RegExp(analysis.specificType, 'i') }
      }).populate('parentId', 'name level');
      
      if (specificCategories.length > 0) {
        foundCategories = specificCategories;
        console.log(`✅ Found ${specificCategories.length} categories for specific type`);
        specificCategories.forEach(cat => {
          console.log(`  📁 "${cat.name}" (Level: ${cat.level}, Parent: ${cat.parentId?.name || 'None'})`);
        });
      }
    }
    
    // BƯỚC 2: Nếu không có specific type, tìm theo sub category - global search
    if (foundCategories.length === 0 && analysis.subCategory) {
      console.log(`📁 Global search for sub category: ${analysis.subCategory}`);
      
      const subCategories = await Category.find({
        name: { $regex: new RegExp(analysis.subCategory, 'i') }
      }).populate('parentId', 'name level');
      
      if (subCategories.length > 0) {
        foundCategories = subCategories;
        console.log(`✅ Found ${subCategories.length} categories for sub category`);
        subCategories.forEach(cat => {
          console.log(`  📁 "${cat.name}" (Level: ${cat.level}, Parent: ${cat.parentId?.name || 'None'})`);
        });
      }
    }
    
    // BƯỚC 3: Filter theo gender nếu có
    if (foundCategories.length > 0 && analysis.gender) {
      console.log(`🚻 Filtering by gender: ${analysis.gender}`);
      
      const genderFilteredCategories = [];
      
      for (const category of foundCategories) {
        // Tìm root parent (level 1) để check gender
        const rootParent = await findRootParent(category);
        
        if (rootParent && rootParent.name.toLowerCase().includes(analysis.gender.toLowerCase())) {
          genderFilteredCategories.push(category);
          console.log(`  ✅ "${category.name}" matches gender via root: "${rootParent.name}"`);
        }
      }
      
      if (genderFilteredCategories.length > 0) {
        foundCategories = genderFilteredCategories;
        console.log(`🎯 After gender filter: ${genderFilteredCategories.length} categories`);
      }
    }
    
    // BƯỚC 4: Chọn category sâu nhất (level cao nhất) và phù hợp nhất
    if (foundCategories.length > 0) {
      // Đặc biệt: Với crop top, ưu tiên "Áo thun" hơn "Set bộ thun/len"
      if (analysis.specificType === 'crop top' || 
          analysis.keywords.some(k => k.toLowerCase().includes('croptop') || k.toLowerCase().includes('crop top'))) {
        
        const aoThunCategory = foundCategories.find(cat => 
          cat.name.toLowerCase().includes('áo thun') && 
          !cat.name.toLowerCase().includes('set')
        );
        
        if (aoThunCategory) {
          console.log(`🎯 Special case for crop top: Selected "Áo thun" instead of other options`);
          return aoThunCategory;
        }
      }
      
      // Logic chọn category thông thường - ưu tiên tên phù hợp nhất
      let bestCategory = foundCategories[0];
      
      // Ưu tiên category không phải "Set bộ" cho sản phẩm đơn lẻ
      if (analysis.specificType || analysis.subCategory) {
        const nonSetCategories = foundCategories.filter(cat => 
          !cat.name.toLowerCase().includes('set') &&
          !cat.name.toLowerCase().includes('bộ')
        );
        
        if (nonSetCategories.length > 0) {
          bestCategory = nonSetCategories.reduce((best, current) => {
            return current.level > best.level ? current : best;
          });
        }
      } else {
        // Chọn theo level cao nhất
        bestCategory = foundCategories.reduce((deepest, current) => {
          return current.level > deepest.level ? current : deepest;
        });
      }
      
      console.log(`🏆 Selected best category: "${bestCategory.name}" (Level: ${bestCategory.level})`);
      return bestCategory;
    }
    
    // BƯỚC 5: Fallback - tìm theo main category
    if (analysis.mainCategory) {
      console.log(`🔄 Fallback to main category: ${analysis.mainCategory}`);
      
      const mainCategories = await Category.find({
        name: { $regex: new RegExp(analysis.mainCategory, 'i') }
      });
      
      if (mainCategories.length > 0) {
        const deepest = mainCategories.reduce((deepest, current) => {
          return current.level > deepest.level ? current : deepest;
        });
        
        console.log(`🔄 Fallback category found: "${deepest.name}" (Level: ${deepest.level})`);
        return deepest;
      }
    }
    
    console.log('❌ No matching category found');
    return null;
    
  } catch (error) {
    console.error('❌ Find deepest category error:', error);
    return null;
  }
};

// Tìm root parent của category
const findRootParent = async (category) => {
  try {
    if (category.level === 1) {
      return category; // Đã là root
    }
    
    if (!category.parentId) {
      return null;
    }
    
    const parent = await Category.findById(category.parentId);
    if (!parent) {
      return null;
    }
    
    if (parent.level === 1) {
      return parent; // Tìm thấy root
    }
    
    // Đệ quy tìm tiếp
    return await findRootParent(parent);
    
  } catch (error) {
    console.error('❌ Find root parent error:', error);
    return null;
  }
};

// Helper function để tìm categories trong gender hierarchy
const findCategoriesInHierarchy = async (rootCategories, searchTerm) => {
  try {
    console.log(`🔍 Searching for "${searchTerm}" in ${rootCategories.length} gender hierarchies`);
    const allCategories = [];
    
    for (const rootCategory of rootCategories) {
      console.log(`📂 Searching in "${rootCategory.name}" hierarchy...`);
      
      // Tìm TẤT CẢ categories thuộc hierarchy này (đệ quy)
      const allHierarchyCategories = await getAllCategoriesInHierarchy(rootCategory._id);
      console.log(`  📋 Found ${allHierarchyCategories.length} categories in "${rootCategory.name}" hierarchy`);
      
      // Filter categories có tên match với search term
      const matchingCategories = allHierarchyCategories.filter(cat => {
        const catName = cat.name.toLowerCase();
        const searchLower = searchTerm.toLowerCase();
        
        // Kiểm tra nhiều pattern matching
        const directMatch = catName.includes(searchLower);
        const reverseMatch = catName.includes(searchLower.replace('jean', 'jeans')) || 
                            catName.includes(searchLower.replace('jeans', 'jean'));
        const partialMatch = searchLower.includes('jean') && catName.includes('jean');
        
        return directMatch || reverseMatch || partialMatch;
      });
      
      if (matchingCategories.length > 0) {
        console.log(`  ✅ Found ${matchingCategories.length} matching categories in "${rootCategory.name}" hierarchy:`);
        matchingCategories.forEach(cat => {
          console.log(`    📁 "${cat.name}" (Level: ${cat.level})`);
        });
        allCategories.push(...matchingCategories);
      } else {
        console.log(`  ❌ No matching categories found in "${rootCategory.name}" hierarchy`);
      }
    }
    
    return allCategories;
  } catch (error) {
    console.error('❌ Error finding categories in hierarchy:', error);
    return [];
  }
};

// Helper function để lấy TẤT CẢ categories trong một hierarchy (đệ quy)
const getAllCategoriesInHierarchy = async (rootCategoryId, visitedIds = new Set()) => {
  try {
    // Tránh infinite loop
    if (visitedIds.has(rootCategoryId.toString())) {
      return [];
    }
    visitedIds.add(rootCategoryId.toString());
    
    // Tìm tất cả categories con trực tiếp
    const directChildren = await Category.find({
      parentId: rootCategoryId
    }).populate('parentId', 'name level');
    
    let allCategories = [...directChildren];
    
    // Đệ quy tìm categories con của mỗi child
    for (const child of directChildren) {
      const grandChildren = await getAllCategoriesInHierarchy(child._id, visitedIds);
      allCategories.push(...grandChildren);
    }
    
    return allCategories;
  } catch (error) {
    console.error('❌ Error getting all categories in hierarchy:', error);
    return [];
  }
};

// Tìm Products theo categoryId chính xác
const findProductsByCategoryId = async (categoryId) => {
  try {
    console.log(`🔍 Searching products with categoryId: ${categoryId}`);
    
    const products = await Product.find({
      categoryId: categoryId,
      status: true // Chỉ lấy sản phẩm active
    })
    .populate('categoryId', 'name level parentId')
    .populate('representativeVariantId')
    .sort({ 
      createdAt: -1, // Sản phẩm mới trước
      views: -1 // Sản phẩm được xem nhiều
    })
    .limit(10); // Giới hạn để tránh quá tải
    
    console.log(`📦 Found ${products.length} products`);
    
    // Debug: Hiển thị sản phẩm tìm được
    products.forEach((product, index) => {
      console.log(`  ${index + 1}. "${product.name}" - Category: "${product.categoryId?.name}" (Level: ${product.categoryId?.level})`);
    });
    
    return products;
    
  } catch (error) {
    console.error('❌ Find products by categoryId error:', error);
    return [];
  }
};

// Lấy ProductVariant và format kết quả với filter màu sắc
const getProductVariantsAndFormat = async (products, deepAnalysis) => {
  try {
    if (!products || products.length === 0) return [];

    let variantQuery = {
      productId: { $in: products.map((p) => p._id) },
      "sizes.stock": { $gt: 0 }, // Có ít nhất 1 size còn hàng
    };

    // 🎨 Lọc theo màu sắc
    if (deepAnalysis?.colorPreference) {
      variantQuery["color.colorName"] = new RegExp(deepAnalysis.colorPreference, "i");
      console.log("🎨 Color filter query:", variantQuery["color.colorName"]);
    }

    // 💰 Lọc theo khoảng giá (dùng $elemMatch để check trong array sizes)
    if (
      deepAnalysis?.price &&
      (deepAnalysis.price.min != null || deepAnalysis.price.max != null)
    ) {
      const priceCondition = { stock: { $gt: 0 } }; // Chỉ check size còn hàng
      
      if (deepAnalysis.price.min != null) {
        priceCondition.price = { $gte: deepAnalysis.price.min };
      }
      if (deepAnalysis.price.max != null) {
        priceCondition.price = {
          ...priceCondition.price,
          $lte: deepAnalysis.price.max,
        };
      }

      variantQuery.sizes = { $elemMatch: priceCondition };
      
      console.log("💰 Price filter:", {
        min: deepAnalysis.price.min,
        max: deepAnalysis.price.max,
        elemMatch: priceCondition
      });
    }

    // 🔍 Query ProductVariant
    const variants = await ProductVariant.find(variantQuery)
      .populate("productId")
      .limit(10);

    console.log(`📦 Found ${variants.length} ProductVariants with filters`);

    // ✅ Format kết quả - bao gồm cả sizes array cho generateProductResponse
    return variants.map((v) => ({
      _id: v._id, // Add _id cho generateProductResponse
      variantId: v._id,
      productId: v.productId,
      name: v.productId.name,
      image: v.images?.[0] || v.productId.image || "",
      price: v.sizes?.[0]?.price || v.price || 0,
      discount: v.discount || 0,
      color: v.color,
      size: v.sizes?.[0]?.size || "Free size",
      stock: v.stock,
      sizes: v.sizes || [], // Thêm sizes array để generateProductResponse có thể access
      images: v.images || [] // Thêm images array
    }));
  } catch (error) {
    console.error("❌ getProductVariantsAndFormat error:", error);
    return [];
  }
};

// Tạo response kết hợp text + sản phẩm
const generateProductResponse = async (intentAnalysis, product, originalMessage) => {
  try {
    // Lấy thông tin sản phẩm
    const productName = product.productId?.name || product.name || "Sản phẩm";
    const productImage = product.images?.main?.url || product.images?.[0]?.url || "/images/no-image.png";
    const productColor = product.color?.colorName || product.color?.name || "Đa màu";
    
    // Chọn size và giá phù hợp
    let selectedSize = null;
    
    if (product.sizes && product.sizes.length > 0) {
      // Có sizes array - tìm size còn hàng
      selectedSize = product.sizes.find(s => s.stock > 0) || product.sizes[0];
    } else {
      // Không có sizes array - dùng thông tin từ formatted object
      selectedSize = {
        size: product.size || "M",
        price: product.price || 0,
        stock: product.stock || 0
      };
    }
    
    // Nếu có thông số cơ thể, gợi ý size phù hợp
    if (intentAnalysis.bodyMeasurements?.weight || intentAnalysis.bodyMeasurements?.height) {
      const recommendedSize = calculateRecommendedSize(
        intentAnalysis.bodyMeasurements.weight,
        intentAnalysis.bodyMeasurements.height
      );
      
      if (recommendedSize && product.sizes && product.sizes.length > 0) {
        const matchingSize = product.sizes.find(s => s.size === recommendedSize && s.stock > 0);
        if (matchingSize) {
          selectedSize = matchingSize;
        }
      }
    }
    
    // Tạo text response bằng AI
    const textPrompt = `
Bạn là AI tư vấn bán hàng thời trang chuyên nghiệp của Elavia.
Khách hàng vừa hỏi: "${originalMessage}"
Tôi đã tìm được sản phẩm phù hợp: "${productName}" - màu ${productColor}

Hãy tạo câu trả lời tư vấn nhiệt tình, chuyên nghiệp:
- Giới thiệu sản phẩm một cách hấp dẫn
- Nêu ưu điểm của sản phẩm
- Khuyến khích khách hàng xem chi tiết
- Tối đa 3-4 câu, tone thân thiện

Không đề cập đến giá cụ thể, chỉ tập trung vào chất lượng và phong cách.
`;

    const result = await model.generateContent(textPrompt);
    const aiText = result.response.text();
    
    return {
      text: aiText,
      product: {
        variantId: product._id || product.variantId,
        productId: product.productId?._id || product.productId,
        name: productName,
        image: productImage,
        price: selectedSize?.price || 0,
        discount: product.discount || 0,
        color: productColor,
        size: selectedSize?.size || "M",
        stock: selectedSize?.stock || 0
      }
    };
    
  } catch (error) {
    console.error('❌ Product response generation error:', error);
    return {
      text: `Tôi đã tìm thấy sản phẩm phù hợp cho bạn! Hãy xem chi tiết bên dưới nhé 😊`,
      product: {
        variantId: product._id || product.variantId,
        productId: product.productId?._id || product.productId,
        name: product.productId?.name || product.name || "Sản phẩm",
        image: product.images?.main?.url || product.images?.[0] || "/images/no-image.png",
        price: product.sizes?.[0]?.price || product.price || 0,
        discount: product.discount || 0,
        color: product.color?.colorName || product.color || "Đa màu",
        size: product.sizes?.[0]?.size || product.size || "M",
        stock: product.sizes?.[0]?.stock || product.stock || 0
      }
    };
  }
};

// Tạo text response thuần túy  
const generateTextResponse = async (userMessage, intentAnalysis) => {
  try {
    const prompt = `
Bạn là AI tư vấn viên bán hàng thời trang của Elavia tại Việt Nam.
Khách hàng vừa hỏi: "${userMessage}"

Intent được phân tích: ${intentAnalysis.intent}

Thông tin về Elavia:
- Tên: Elavia
- Chuyên: Thời trang nam nữ cao cấp
- Giao hàng: Toàn quốc 2-5 ngày, miễn phí ship đơn >500k
- Đổi trả: 30 ngày, miễn phí đổi size lần đầu trong 7 ngày
- Thanh toán: COD, chuyển khoản, ví điện tử
- Size: S-XXL với bảng size chi tiết
- Chính sách: Hàng chính hãng, bảo hành chất lượng

Hãy trả lời:
- Chuyên nghiệp, thân thiện
- Tối đa 4-5 câu
- Sử dụng emoji phù hợp  
- Khuyến khích hỏi thêm nếu cần
- Nếu là chào hỏi: giới thiệu ngắn gọn về khả năng hỗ trợ
- Nếu là FAQ: trả lời chính xác theo thông tin store
- Nếu là size: hướng dẫn cách chọn size hoặc yêu cầu thông số

Trả lời bằng tiếng Việt:
`;

    const result = await model.generateContent(prompt);
    return result.response.text();
    
  } catch (error) {
    console.error('❌ Text response generation error:', error);
    return "Xin chào! Tôi là AI tư vấn của Elavia. Tôi có thể giúp bạn tìm kiếm sản phẩm, tư vấn size và trả lời các câu hỏi về chính sách. Nếu cần hỗ trợ chi tiết hơn, vui lòng liên hệ Admin qua hotline 0353 608 533! 😊";
  }
};

// Fallback response khi AI lỗi
const generateFallbackResponse = async (userMessage) => {
  const message = userMessage.toLowerCase();
  
  // Các response cơ bản
  if (message.includes("xin chào") || message.includes("hello") || message.includes("hi")) {
    return {
      type: "text",
      content: "Xin chào! Tôi là AI tư vấn của Elavia. Tôi có thể giúp bạn tìm kiếm sản phẩm và trả lời các câu hỏi. Bạn cần hỗ trợ gì ạ? 😊"
    };
  }
  
  if (message.includes("ship") || message.includes("giao hàng")) {
    return {
      type: "text", 
      content: "Chúng tôi giao hàng toàn quốc trong 2-5 ngày, miễn phí ship cho đơn từ 500k bạn nhé! 🚚"
    };
  }
  
  return {
    type: "text",
    content: "Tôi có thể giúp bạn tìm sản phẩm, tư vấn size, và trả lời câu hỏi về chính sách. Nếu cần hỗ trợ chi tiết hơn, vui lòng liên hệ Admin qua hotline 0353 608 533! 😊"
  };
};

// Tính toán size dựa trên cân nặng và chiều cao
const calculateRecommendedSize = (weight, height) => {
  if (!weight) return null;
  
  let size;
  if (weight <= 50) size = 'S';
  else if (weight <= 55) size = 'M'; 
  else if (weight <= 65) size = 'L';
  else if (weight <= 75) size = 'XL';
  else size = 'XXL';
  
  // Điều chỉnh theo chiều cao
  if (height >= 180) {
    if (size === 'S') size = 'M';
    else if (size === 'M') size = 'L';  
    else if (size === 'L') size = 'XL';
  } else if (height <= 160) {
    if (size === 'XL') size = 'L';
    else if (size === 'XXL') size = 'XL';
  }
  
  return size;
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
    
    // Xử lý đặc biệt: tìm trực tiếp "crop top" trước
    if (productTypeName.toLowerCase() === 'crop top') {
      console.log('🎯 Searching for CROP TOP as independent category');
      
      // Tìm trực tiếp category có tên "crop top" hoặc tương tự
      const cropTopCategory = await Category.findOne({
        name: { $regex: /crop\s*top|croptop/i }
      });
      
      if (cropTopCategory) {
        console.log('✅ Found dedicated CROP TOP category:', cropTopCategory.name, cropTopCategory._id);
        return cropTopCategory._id;
      }
      
      // Nếu không có category riêng, tìm theo từ khóa trong Products
      console.log('🔍 No dedicated crop top category, searching by keywords in products...');
      return null; // Trả về null để fallback sang keyword search
    }
    
    // Xử lý đặc biệt cho "tank top"
    if (productTypeName.toLowerCase() === 'tank top') {
      console.log('🎯 Searching for TANK TOP as independent category');
      
      const tankTopCategory = await Category.findOne({
        name: { $regex: /tank\s*top|tanktop|áo\s*ba\s*lỗ|áo\s*2\s*dây/i }
      });
      
      if (tankTopCategory) {
        console.log('✅ Found dedicated TANK TOP category:', tankTopCategory.name, tankTopCategory._id);
        return tankTopCategory._id;
      }
      
      console.log('🔍 No dedicated tank top category, searching by keywords...');
      return null;
    }
    
    // Tìm theo cách thông thường cho các category khác
    return await findStandardCategory(genderName, productTypeName);
    
  } catch (error) {
    console.error('Error finding category:', error);
    return null;
  }
};

// Helper function để tìm category theo cách thông thường
const findStandardCategory = async (genderName, productTypeName) => {
  try {
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
    console.error('Error finding standard category:', error);
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
