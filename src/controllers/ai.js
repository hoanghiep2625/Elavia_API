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
  SIMILARITY_THRESHOLD: 0.25, // Giảm threshold để dễ tìm hơn
  MAX_RESULTS: 5,
  EMBEDDING_BATCH_SIZE: 10,
  TEXT_SEARCH_WEIGHT: 0.7, // Ưu tiên text search
  SEMANTIC_SEARCH_WEIGHT: 0.3,
};

// Từ khóa thông dụng cho thời trang
const FASHION_KEYWORDS = {
  // Dòng sản phẩm
  nam: ["men", "nam", "nam giới"],
  nữ: ["ladies", "nữ", "phụ nữ", "women"],
  unisex: ["you", "unisex", "nam nữ"],

  // Nhóm sản phẩm
  áo: ["áo", "shirt", "top", "blouse"],
  quần: ["quần", "pants", "trousers", "jean"],
  "áo khoác": ["áo khoác", "jacket", "coat", "blazer"],
  váy: ["váy", "zuýp", "dress", "skirt"],

  // Cổ áo
  "cổ tròn": ["cổ tròn", "round neck", "crew neck"],
  "cổ v": ["cổ v", "cổ chữ v", "v neck"],
  "cổ đức": ["cổ đức", "polo", "collar"],

  // Tay áo
  "tay ngắn": ["tay ngắn", "tay cộc", "short sleeve"],
  "tay dài": ["tay dài", "long sleeve"],
  "sát nách": ["sát nách", "tank top", "sleeveless"],

  // Chất liệu
  cotton: ["thun", "cotton", "co tô"],
  jean: ["jean", "denim"],
  lụa: ["lụa", "silk"],
  khaki: ["khaki", "vải khaki"],

  // Màu sắc cơ bản
  đen: ["đen", "black"],
  trắng: ["trắng", "white"],
  xanh: ["xanh", "blue"],
  đỏ: ["đỏ", "red"],
  vàng: ["vàng", "yellow"],
  hồng: ["hồng", "pink"],
};

// Helper function để xử lý từ khóa thông dụng
function expandSearchQuery(query) {
  const lowerQuery = query.toLowerCase().trim();
  const expandedTerms = [lowerQuery];

  // Mở rộng từ khóa dựa trên FASHION_KEYWORDS
  Object.entries(FASHION_KEYWORDS).forEach(([key, synonyms]) => {
    if (synonyms.some((synonym) => lowerQuery.includes(synonym))) {
      expandedTerms.push(...synonyms);
    }
  });

  return [...new Set(expandedTerms)]; // Loại bỏ trùng lặp
}

// Cấu hình AI search suggestions
export const searchSuggestions = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
        message: "Query quá ngắn",
      });
    }

    const searchQuery = query.trim().toLowerCase();
    const expandedQueries = expandSearchQuery(searchQuery);
    console.log("🔍 Searching for:", searchQuery);
    console.log("📝 Expanded queries:", expandedQueries);

    // Tạo regex pattern cho tất cả từ khóa mở rộng
    const regexPattern = expandedQueries
      .map(
        (term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
      )
      .join("|");

    // 1. Text search với aggregate để có thể search nested fields và attributes
    const textSearchResults = await ProductVariant.aggregate([
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      {
        $unwind: "$productInfo",
      },
      {
        $match: {
          $or: [
            { "productInfo.name": { $regex: regexPattern, $options: "i" } },
            {
              "productInfo.shortDescription": {
                $regex: regexPattern,
                $options: "i",
              },
            },
            {
              "productInfo.description": {
                $regex: regexPattern,
                $options: "i",
              },
            },
            { "color.colorName": { $regex: regexPattern, $options: "i" } },
            { "color.baseColor": { $regex: regexPattern, $options: "i" } },
            { sku: { $regex: regexPattern, $options: "i" } },
            { "attributes.attribute": { $regex: regexPattern, $options: "i" } },
            { "attributes.value": { $regex: regexPattern, $options: "i" } },
          ],
          status: true, // Chỉ lấy sản phẩm active
        },
      },
      {
        $addFields: {
          // Tính giá nhỏ nhất của variant
          minPrice: { $min: "$sizes.price" },
          maxPrice: { $max: "$sizes.price" },
          totalStock: { $sum: "$sizes.stock" },
          hasStock: { $gt: [{ $sum: "$sizes.stock" }, 0] },
        },
      },
      {
        $match: {
          hasStock: true, // Chỉ lấy sản phẩm còn hàng
        },
      },
      {
        $project: {
          _id: 1,
          productId: {
            _id: "$productInfo._id",
            name: "$productInfo.name",
            shortDescription: "$productInfo.shortDescription",
            categoryId: "$productInfo.categoryId",
          },
          color: 1,
          images: 1,
          sizes: 1,
          attributes: 1,
          sku: 1,
          minPrice: 1,
          maxPrice: 1,
          totalStock: 1,
          price: "$minPrice", // Sử dụng giá nhỏ nhất để hiển thị
          relevanceScore: {
            $add: [
              // Điểm cao cho tên sản phẩm
              {
                $cond: {
                  if: {
                    $regexMatch: {
                      input: "$productInfo.name",
                      regex: regexPattern,
                      options: "i",
                    },
                  },
                  then: 15,
                  else: 0,
                },
              },
              // Điểm cho attributes
              {
                $cond: {
                  if: {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$attributes",
                            cond: {
                              $or: [
                                {
                                  $regexMatch: {
                                    input: "$$this.attribute",
                                    regex: regexPattern,
                                    options: "i",
                                  },
                                },
                                {
                                  $regexMatch: {
                                    input: "$$this.value",
                                    regex: regexPattern,
                                    options: "i",
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                      0,
                    ],
                  },
                  then: 12,
                  else: 0,
                },
              },
              // Điểm cho SKU (exact match cao hơn)
              {
                $cond: {
                  if: {
                    $regexMatch: {
                      input: "$sku",
                      regex: regexPattern,
                      options: "i",
                    },
                  },
                  then: 10,
                  else: 0,
                },
              },
              // Điểm cho màu sắc
              {
                $cond: {
                  if: {
                    $or: [
                      {
                        $regexMatch: {
                          input: "$color.colorName",
                          regex: regexPattern,
                          options: "i",
                        },
                      },
                      {
                        $regexMatch: {
                          input: "$color.baseColor",
                          regex: regexPattern,
                          options: "i",
                        },
                      },
                    ],
                  },
                  then: 8,
                  else: 0,
                },
              },
              // Điểm cho mô tả
              {
                $cond: {
                  if: {
                    $or: [
                      {
                        $regexMatch: {
                          input: "$productInfo.shortDescription",
                          regex: regexPattern,
                          options: "i",
                        },
                      },
                      {
                        $regexMatch: {
                          input: "$productInfo.description",
                          regex: regexPattern,
                          options: "i",
                        },
                      },
                    ],
                  },
                  then: 5,
                  else: 0,
                },
              },
              // Bonus cho sản phẩm có nhiều stock
              {
                $cond: {
                  if: { $gt: ["$totalStock", 10] },
                  then: 2,
                  else: 0,
                },
              },
            ],
          },
        },
      },
      {
        $sort: {
          relevanceScore: -1,
          totalStock: -1, // Ưu tiên sản phẩm có nhiều hàng
          minPrice: 1,
        },
      },
      {
        $limit: 8,
      },
    ]);

    console.log(`📊 Text search found: ${textSearchResults.length} results`);

    if (textSearchResults.length >= 5) {
      // Nếu đã có đủ kết quả từ text search, trả về luôn
      return res.json({
        success: true,
        suggestions: textSearchResults.slice(0, 5),
        method: "text_search",
        debug: {
          query: searchQuery,
          expandedQueries: expandedQueries,
          textResults: textSearchResults.length,
        },
      });
    }

    // 2. Nếu text search không đủ, thêm semantic search
    try {
      console.log("🤖 Running semantic search...");
      const embeddingResult = await embeddingModel.embedContent(searchQuery);
      const queryEmbedding = embeddingResult.embedding.values;

      const semanticResults = await ProductVariant.aggregate([
        {
          $match: {
            embedding: { $exists: true, $ne: null, $not: { $size: 0 } },
            status: true,
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            as: "productInfo",
          },
        },
        {
          $unwind: "$productInfo",
        },
        {
          $addFields: {
            similarity: {
              $let: {
                vars: {
                  dotProduct: {
                    $reduce: {
                      input: {
                        $range: [
                          0,
                          {
                            $min: [
                              { $size: "$embedding" },
                              queryEmbedding.length,
                            ],
                          },
                        ],
                      },
                      initialValue: 0,
                      in: {
                        $add: [
                          "$$value",
                          {
                            $multiply: [
                              { $arrayElemAt: ["$embedding", "$$this"] },
                              { $arrayElemAt: [queryEmbedding, "$$this"] },
                            ],
                          },
                        ],
                      },
                    },
                  },
                },
                in: "$$dotProduct",
              },
            },
            minPrice: { $min: "$sizes.price" },
            hasStock: { $gt: [{ $sum: "$sizes.stock" }, 0] },
          },
        },
        {
          $match: {
            similarity: { $gte: CONFIG.SIMILARITY_THRESHOLD },
            hasStock: true,
          },
        },
        {
          $project: {
            _id: 1,
            productId: {
              _id: "$productInfo._id",
              name: "$productInfo.name",
              shortDescription: "$productInfo.shortDescription",
              categoryId: "$productInfo.categoryId",
            },
            color: 1,
            images: 1,
            sizes: 1,
            sku: 1,
            price: "$minPrice",
            similarity: 1,
          },
        },
        { $sort: { similarity: -1 } },
        { $limit: 8 },
      ]);

      console.log(
        `🎯 Semantic search found: ${semanticResults.length} results`
      );

      // Kết hợp kết quả và loại bỏ trùng lặp
      const combinedResults = [...textSearchResults];
      const existingIds = new Set(
        textSearchResults.map((item) => item._id.toString())
      );

      for (const semanticResult of semanticResults) {
        if (
          !existingIds.has(semanticResult._id.toString()) &&
          combinedResults.length < 5
        ) {
          combinedResults.push(semanticResult);
        }
      }

      res.json({
        success: true,
        suggestions: combinedResults.slice(0, 5),
        method: "combined_search",
        debug: {
          query: searchQuery,
          textResults: textSearchResults.length,
          semanticResults: semanticResults.length,
          combinedResults: combinedResults.length,
        },
      });
    } catch (embeddingError) {
      // Fallback về text search nếu có lỗi embedding
      console.log(
        "❌ Embedding error, fallback to text search:",
        embeddingError.message
      );

      res.json({
        success: true,
        suggestions: textSearchResults.slice(0, 5),
        method: "text_search_fallback",
        debug: {
          query: searchQuery,
          error: embeddingError.message,
          textResults: textSearchResults.length,
        },
      });
    }
  } catch (error) {
    console.error("💥 Search suggestions error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi tìm kiếm gợi ý",
      error: error.message,
    });
  }
};
