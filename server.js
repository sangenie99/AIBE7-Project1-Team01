const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY || "";
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// 환경 변수 로드 확인
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌ 오류: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 .env 파일에 설정되지 않았습니다.",
  );
  console.log("현재 로드된 URL:", process.env.SUPABASE_URL ? "있음" : "없음");
  process.exit(1); // 서버 실행 중단
}

// URL 형식 검사
if (!process.env.SUPABASE_URL.match(/^https?:\/\//i)) {
  console.error(
    "❌ 오류: SUPABASE_URL은 'http://' 또는 'https://'로 시작하는 유효한 URL이어야 합니다. 현재 입력된 값:",
    process.env.SUPABASE_URL,
  );
  process.exit(1); // 서버 실행 중단
}

// 관리자 권한 Supabase 클라이언트 (회원 삭제용)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

app.use(express.json());

// HTML에서 참조하는 /config.js 경로에 환경 변수 주입
app.get("/config.js", (req, res) => {
  res.type("application/javascript");
  res.send(`
    window.SUPABASE_URL = "${process.env.SUPABASE_URL || ""}";
    window.SUPABASE_ANON_KEY = "${process.env.SUPABASE_ANON_KEY || ""}";
    window.KAKAO_MAP_KEY = "${process.env.KAKAO_MAP_KEY || ""}";
  `);
});

// 회원 탈퇴 API: 유저 정보 및 작성 게시글 전체 삭제
app.delete("/api/delete-account", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ message: "인증이 필요합니다." });

  const token = authHeader.split(" ")[1];

  try {
    // 1. 토큰으로 유저 확인 (보안 검사)
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) throw new Error("유효하지 않은 토큰입니다.");

    const userId = user.id;

    // 2. 유저가 작성한 게시글 삭제 (posts 테이블)
    const { error: postError } = await supabaseAdmin
      .from("posts")
      .delete()
      .eq("user_id", userId);

    if (postError) console.error("게시글 삭제 중 오류:", postError);

    // 3. Auth 유저 삭제
    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    res.json({ message: "계정 및 모든 데이터가 성공적으로 삭제되었습니다." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

async function getFestivalData(region, date) {
  // 축제 API는 나중에 붙일 수 있도록 분리해 둔 자리입니다.
  return {
    items: [],
    note: "축제 데이터 API 연동 준비 중입니다.",
    region: region || "",
    date: date || "",
  };
}

function buildTravelPrompt(userMessage, festivalData) {
  return `
너는 한국 국내 여행 추천 챗봇이다.
사용자의 취향, 출발지, 여행 날짜, 분위기, 동행자, 이동 거리 선호를 바탕으로 국내 여행 지역을 추천한다.
가능하면 축제나 지역 행사도 함께 추천한다.
단, 실제 축제 데이터 API가 아직 연결되어 있지 않다면 축제명은 확정적으로 지어내지 말고,
"축제 일정은 공식 관광 사이트 또는 공공데이터 API 연동 후 확인이 필요합니다"라고 안내한다.
답변은 친절하고 짧게 하되, 추천 이유를 함께 설명한다.
사용자가 조건을 충분히 말하지 않았다면 바로 단정하지 말고 추가 질문을 해도 된다.

현재 확보된 축제 데이터:
${JSON.stringify(festivalData, null, 2)}

사용자 메시지:
${userMessage}

출력 형식:
{
  "reply": "AI가 생성한 여행 추천 답변"
}
`.trim();
}

async function callAITravelRecommendation(prompt) {
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Gemini API 요청 실패: ${response.status} ${bodyText}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!text) {
    throw new Error("Gemini 응답이 비어 있습니다.");
  }

  const parsed = JSON.parse(text);
  return parsed.reply || "";
}

app.post("/api/travel-chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({ message: "여행 취향을 입력해 주세요." });
    }

    const festivalData = await getFestivalData("", "");
    const prompt = buildTravelPrompt(message, festivalData);
    const reply = await callAITravelRecommendation(prompt);

    return res.json({ reply });
  } catch (error) {
    console.error("travel-chat error:", error);
    return res.status(500).json({
      message:
        error.message === "GEMINI_API_KEY가 설정되지 않았습니다."
          ? "AI API 키가 설정되지 않았습니다."
          : "추천을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
    });
  }
});

// 봇 모듈 마운트
const botApp = require("./bot/server.js");
app.use("/bot", botApp);

// 정적 파일 서비스 (현재 폴더의 모든 파일 서빙)
app.use(express.static(__dirname));

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 시작되었습니다: http://localhost:${PORT}`);
  console.log(`메인 화면 주소: http://localhost:${PORT}/html/index.html`);
});
