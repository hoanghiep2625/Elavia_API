import { GoogleGenerativeAI } from "@google/generative-ai";

// Lưu ý: dùng biến môi trường GEMINI_API_KEY
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function checkCommentWithGemini(comment) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `
    Bạn là một hệ thống kiểm duyệt nội dung. 
    Hãy đánh giá bình luận sau và trả lời chỉ bằng một từ:
    - "APPROVED" nếu bình luận phù hợp.
    - "REJECTED" nếu bình luận có từ ngữ tục tĩu, xúc phạm, phân biệt đối xử, hay spam.

    Bình luận: "${comment}"
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim().toUpperCase();

    return text.includes("REJECTED") ? "rejected" : "approved";
  } catch (err) {
    console.error("Gemini moderation error:", err);
    return "pending"; // fallback nếu lỗi
  }
}
