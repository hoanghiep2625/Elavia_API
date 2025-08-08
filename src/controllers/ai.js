import ProductVariant from "../models/productVariant.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize AI models
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({
  model: "text-embedding-004",
});
const chatModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Configuration constants
const CONFIG = {
  SIMILARITY_THRESHOLD: 0.4, // Giảm threshold để dễ tìm hơn
  MAX_RESULTS: 5,
  EMBEDDING_BATCH_SIZE: 10,
  TEXT_SEARCH_WEIGHT: 0.7, // Ưu tiên text search
  SEMANTIC_SEARCH_WEIGHT: 0.3,
};

// Keywords and patterns
const PATTERNS = {
  GREETING: [
    "chào",
    "hello",
    "hi",
    "hey",
    "xin chào",
    "alo",
    "good morning",
    "good afternoon",
    "good evening",
    "chào bạn",
    "chào shop",
  ],

  COLOR_MAP: {
    // Vietnamese colors
    xanh: "blue",
    "xanh dương": "blue",
    "xanh navy": "blue",
    navy: "blue",
    "xanh lá": "green",
    "xanh lục": "green",
    đỏ: "red",
    "đỏ tươi": "red",
    "đỏ đậm": "red",
    vàng: "yellow",
    "vàng gold": "yellow",
    "vàng nghệ": "yellow",
    đen: "black",
    "đen nhám": "black",
    "đen bóng": "black",
    trắng: "white",
    "trắng sữa": "white",
    "trắng ngà": "white",
    hồng: "pink",
    "hồng phấn": "pink",
    "hồng đào": "pink",
    tím: "purple",
    "tím than": "purple",
    "tím lavender": "purple",
    cam: "orange",
    "cam đất": "orange",
    "cam neon": "orange",
    nâu: "brown",
    "nâu đất": "brown",
    "nâu cafe": "brown",
    xám: "gray",
    "xám nhạt": "gray",
    "xám đậm": "gray",
    // English colors
    blue: "blue",
    green: "green",
    red: "red",
    yellow: "yellow",
    black: "black",
    white: "white",
    pink: "pink",
    purple: "purple",
    orange: "orange",
    brown: "brown",
    gray: "gray",
    grey: "gray",
  },

  SIZE_MAP: {
    s: "S",
    "size s": "S",
    small: "S",
    m: "M",
    "size m": "M",
    medium: "M",
    vừa: "M",
    l: "L",
    "size l": "L",
    large: "L",
    lớn: "L",
    xl: "XL",
    "size xl": "XL",
    "extra large": "XL",
    xxl: "XXL",
    "2xl": "XXL",
    "size xxl": "XXL",
  },

  // Material mapping
  MATERIAL_MAP: {
    cotton: "Cotton",
    bông: "Cotton",
    "cô tông": "Cotton",
    thô: "Thô",
    "vải thô": "Thô",
    linen: "Thô",
    jean: "Jean",
    denim: "Jean",
    jeans: "Jean",
    kaki: "Kaki",
    khaki: "Kaki",
    polyester: "Polyester",
    poly: "Polyester",
    viscose: "Viscose",
    tencel: "Tencel",
    spandex: "Spandex",
    lycra: "Spandex",
    wool: "Wool",
    len: "Wool",
    "lông cừu": "Wool",
    silk: "Silk",
    lụa: "Silk",
    "tơ tằm": "Silk",
    da: "Da",
    leather: "Da",
    "da thật": "Da",
    nỉ: "Nỉ",
    fleece: "Nỉ",
    "nỉ bông": "Nỉ",
  },

  // Gender/Product line mapping
  GENDER_MAP: {
    nam: "Men",
    men: "Men",
    male: "Men",
    "đàn ông": "Men",
    nữ: "Women",
    women: "Women",
    female: "Women",
    "đàn bà": "Women",
    "phụ nữ": "Women",
    unisex: "Unisex",
    "cả nam và nữ": "Unisex",
  },

  // Product group mapping
  PRODUCT_GROUP_MAP: {
    áo: "Áo",
    shirt: "Áo",
    top: "Áo",
    blouse: "Áo",
    quần: "Quần",
    pants: "Quần",
    trouser: "Quần",
    bottom: "Quần",
    váy: "Váy",
    dress: "Váy",
    skirt: "Váy",
    đầm: "Đầm",
    gown: "Đầm",
    "áo khoác": "Áo khoác",
    jacket: "Áo khoác",
    coat: "Áo khoác",
    "phụ kiện": "Phụ kiện",
    accessories: "Phụ kiện",
  },

  PRICE_PATTERNS: [
    /dưới\s+(\d+(?:\.\d+)?)\s*(?:k|nghìn|triệu)?/i,
    /under\s+(\d+(?:\.\d+)?)\s*(?:k|thousand)?/i,
    /từ\s+(\d+(?:\.\d+)?)\s*(?:k|nghìn|triệu)?\s*đến\s+(\d+(?:\.\d+)?)\s*(?:k|nghìn|triệu)?/i,
    /(\d+(?:\.\d+)?)\s*(?:k|nghìn|triệu)?\s*-\s*(\d+(?:\.\d+)?)\s*(?:k|nghìn|triệu)?/i,
  ],
};

// Utility functions
const utils = {
  cosineSimilarity(vecA, vecB) {
    if (
      !Array.isArray(vecA) ||
      !Array.isArray(vecB) ||
      vecA.length !== vecB.length
    ) {
      return 0;
    }

    const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

    if (normA === 0 || normB === 0) return 0;
    return dot / (normA * normB);
  },

  // Text similarity for direct name/description matching
  calculateTextSimilarity(query, variant) {
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2); // Ignore short words

    if (queryWords.length === 0) return 0;

    const productName = variant.productId?.name?.toLowerCase() || "";
    const description = variant.productId?.description?.toLowerCase() || "";
    const attributes =
      variant.attributes
        ?.map((attr) => `${attr.attribute} ${attr.value}`.toLowerCase())
        .join(" ") || "";

    const searchText = `${productName} ${description} ${attributes}`;

    let matchedWords = 0;
    let exactMatches = 0;

    queryWords.forEach((word) => {
      if (searchText.includes(word)) {
        matchedWords++;
        // Bonus for exact matches in product name
        if (productName.includes(word)) {
          exactMatches++;
        }
      }
    });

    const matchRatio = matchedWords / queryWords.length;
    const exactRatio = exactMatches / queryWords.length;

    // Weighted score: 70% for general matches, 30% bonus for exact name matches
    return matchRatio * 0.7 + exactRatio * 0.3;
  },

  // Combined scoring function
  calculateCombinedScore(query, queryEmbedding, variant) {
    const textScore = utils.calculateTextSimilarity(query, variant);

    let semanticScore = 0;
    if (Array.isArray(variant.embedding) && variant.embedding.length > 0) {
      semanticScore = utils.cosineSimilarity(queryEmbedding, variant.embedding);
    }

    // Combined score with weights
    const combinedScore =
      textScore * CONFIG.TEXT_SEARCH_WEIGHT +
      semanticScore * CONFIG.SEMANTIC_SEARCH_WEIGHT;

    return {
      combinedScore,
      textScore,
      semanticScore,
    };
  },

  isGreeting(text) {
    const normalized = text.toLowerCase().trim();
    return PATTERNS.GREETING.some(
      (keyword) =>
        normalized.includes(keyword) ||
        normalized.startsWith(keyword.split(" ")[0])
    );
  },

  extractFilters(text) {
    const filters = {
      colors: [],
      sizes: [],
      materials: [],
      genders: [],
      productGroups: [],
      priceRange: null,
    };

    const lowerText = text.toLowerCase();

    // Extract colors
    for (const [keyword, baseColor] of Object.entries(PATTERNS.COLOR_MAP)) {
      if (lowerText.includes(keyword)) {
        if (!filters.colors.includes(baseColor)) {
          filters.colors.push(baseColor);
        }
      }
    }

    // Extract sizes
    for (const [keyword, size] of Object.entries(PATTERNS.SIZE_MAP)) {
      if (lowerText.includes(keyword)) {
        if (!filters.sizes.includes(size)) {
          filters.sizes.push(size);
        }
      }
    }

    // Extract materials
    for (const [keyword, material] of Object.entries(PATTERNS.MATERIAL_MAP)) {
      if (lowerText.includes(keyword)) {
        if (!filters.materials.includes(material)) {
          filters.materials.push(material);
        }
      }
    }

    // Extract genders
    for (const [keyword, gender] of Object.entries(PATTERNS.GENDER_MAP)) {
      if (lowerText.includes(keyword)) {
        if (!filters.genders.includes(gender)) {
          filters.genders.push(gender);
        }
      }
    }

    // Extract product groups
    for (const [keyword, group] of Object.entries(PATTERNS.PRODUCT_GROUP_MAP)) {
      if (lowerText.includes(keyword)) {
        if (!filters.productGroups.includes(group)) {
          filters.productGroups.push(group);
        }
      }
    }

    // Extract price range (keep existing logic)
    for (const pattern of PATTERNS.PRICE_PATTERNS) {
      const match = lowerText.match(pattern);
      if (match) {
        if (match[1] && match[2]) {
          filters.priceRange = {
            min:
              parseFloat(match[1]) *
              (lowerText.includes("triệu") ? 1000000 : 1000),
            max:
              parseFloat(match[2]) *
              (lowerText.includes("triệu") ? 1000000 : 1000),
          };
        } else if (match[1]) {
          filters.priceRange = {
            min: 0,
            max:
              parseFloat(match[1]) *
              (lowerText.includes("triệu") ? 1000000 : 1000),
          };
        }
        break;
      }
    }

    return filters;
  },

  applyFilters(variants, filters) {
    return variants.filter((variant) => {
      // Color filter
      if (filters.colors.length > 0) {
        const variantColor = variant.color?.baseColor?.toLowerCase();
        if (!variantColor || !filters.colors.includes(variantColor)) {
          return false;
        }
      }

      // Size filter
      if (filters.sizes.length > 0) {
        const availableSizes = variant.sizes?.map((s) => s.size) || [];
        if (!filters.sizes.some((size) => availableSizes.includes(size))) {
          return false;
        }
      }

      // Material filter
      if (filters.materials.length > 0) {
        const materialAttr = variant.attributes?.find(
          (attr) => attr.attribute === "material"
        );
        const variantMaterial = materialAttr?.value;
        if (!variantMaterial || !filters.materials.includes(variantMaterial)) {
          return false;
        }
      }

      // Gender filter
      if (filters.genders.length > 0) {
        const genderAttr = variant.attributes?.find(
          (attr) => attr.attribute === "product_line"
        );
        const variantGender = genderAttr?.value;
        if (!variantGender || !filters.genders.includes(variantGender)) {
          return false;
        }
      }

      // Product group filter
      if (filters.productGroups.length > 0) {
        const groupAttr = variant.attributes?.find(
          (attr) => attr.attribute === "product_group"
        );
        const variantGroup = groupAttr?.value;
        if (!variantGroup || !filters.productGroups.includes(variantGroup)) {
          return false;
        }
      }

      // Price filter
      if (filters.priceRange) {
        const price = variant.price || 0;
        if (price < filters.priceRange.min || price > filters.priceRange.max) {
          return false;
        }
      }

      return true;
    });
  },

  async getEmbedding(text) {
    try {
      const result = await embeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      console.error("Embedding error:", error);
      return null;
    }
  },

  async generateResponse(question, hasProducts, filters) {
    const context = hasProducts
      ? "có sản phẩm phù hợp"
      : "không có sản phẩm phù hợp";

    const filterInfo = [];
    if (filters.colors.length > 0)
      filterInfo.push(`màu ${filters.colors.join(", ")}`);
    if (filters.sizes.length > 0)
      filterInfo.push(`size ${filters.sizes.join(", ")}`);
    if (filters.materials.length > 0)
      filterInfo.push(`chất liệu ${filters.materials.join(", ")}`);
    if (filters.genders.length > 0)
      filterInfo.push(`dành cho ${filters.genders.join(", ")}`);
    if (filters.productGroups.length > 0)
      filterInfo.push(`loại ${filters.productGroups.join(", ")}`);
    if (filters.priceRange) {
      const { min, max } = filters.priceRange;
      filterInfo.push(
        `giá từ ${min.toLocaleString()} - ${max.toLocaleString()}₫`
      );
    }

    const prompt = `
Bạn là tư vấn viên bán hàng thân thiện và chuyên nghiệp.

Câu hỏi: "${question}"
Trạng thái: ${context}
${filterInfo.length > 0 ? `Tiêu chí: ${filterInfo.join(", ")}` : ""}

Quy tắc trả lời:
- Nếu có sản phẩm: "Mình đã tìm thấy một vài sản phẩm phù hợp với yêu cầu của bạn!"
- Nếu không có: "Rất tiếc, hiện tại không có sản phẩm nào phù hợp với yêu cầu này."
- Không liệt kê sản phẩm cụ thể
- Giọng điệu thân thiện, ngắn gọn
- Chỉ trả lời bằng tiếng Việt
`;

    try {
      const result = await chatModel.generateContent(prompt);
      return (
        result.response.candidates[0]?.content?.parts[0]?.text ||
        "Xin lỗi, tôi không thể trả lời lúc này."
      );
    } catch (error) {
      console.error("AI response error:", error);
      return "Đã xảy ra lỗi khi xử lý câu hỏi của bạn.";
    }
  },
};

// Main controller
export const chatWithAI = async (req, res) => {
  try {
    const { question } = req.body;

    // Validate input
    if (!question?.trim()) {
      return res.status(400).json({
        message: "Vui lòng nhập câu hỏi",
      });
    }

    const normalizedQuestion = question.trim();

    // Handle greetings
    if (utils.isGreeting(normalizedQuestion)) {
      return res.json({
        answer:
          "Chào bạn! Mình có thể giúp bạn tìm kiếm sản phẩm. Bạn cần tìm gì hôm nay? 😊",
        relatedProducts: [],
      });
    }

    // Extract filters from question
    const filters = utils.extractFilters(normalizedQuestion);

    // Get embedding for semantic search
    const queryEmbedding = await utils.getEmbedding(normalizedQuestion);
    if (!queryEmbedding) {
      return res.status(500).json({
        message: "Lỗi khi xử lý câu hỏi",
      });
    }

    // Fetch and filter variants
    let variants = await ProductVariant.find()
      .populate({
        path: "productId",
        select: "name description category brand",
      })
      .lean(); // Use lean for better performance

    // Apply filters
    variants = utils.applyFilters(variants, filters);

    // If no products found
    if (variants.length === 0) {
      const answer = await utils.generateResponse(
        normalizedQuestion,
        false,
        filters
      );
      return res.json({
        answer,
        relatedProducts: [],
      });
    }

    // Calculate similarities and get top matches
    const variantsWithScore = variants
      .map((variant) => {
        const scores = utils.calculateCombinedScore(
          normalizedQuestion,
          queryEmbedding,
          variant
        );
        return {
          variant,
          ...scores,
        };
      })
      .filter((item) => item.combinedScore > 0.1) // Very low threshold to catch more results
      .sort((a, b) => {
        // First sort by combined score
        if (Math.abs(a.combinedScore - b.combinedScore) > 0.1) {
          return b.combinedScore - a.combinedScore;
        }
        // If scores are close, prioritize text matches
        return b.textScore - a.textScore;
      })
      .slice(0, CONFIG.MAX_RESULTS);

    // Generate AI response
    const hasRelevantProducts = variantsWithScore.length > 0;
    const answer = await utils.generateResponse(
      normalizedQuestion,
      hasRelevantProducts,
      filters
    );

    // Return results
    res.json({
      answer,
      relatedProducts: variantsWithScore.map((item) => item.variant),
      searchInfo: {
        totalFound: variants.length,
        relevantFound: variantsWithScore.length,
        filters: filters,
        searchDetails: variantsWithScore.slice(0, 3).map((item) => ({
          productName: item.variant.productId?.name,
          textScore: Math.round(item.textScore * 100) / 100,
          semanticScore: Math.round(item.semanticScore * 100) / 100,
          combinedScore: Math.round(item.combinedScore * 100) / 100,
        })),
      },
    });
  } catch (error) {
    console.error("Chat AI Error:", error);
    res.status(500).json({
      message: "Đã xảy ra lỗi khi xử lý yêu cầu",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
