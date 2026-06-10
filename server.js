const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// HTML에서 참조하는 /config.js 경로에 환경 변수 주입
app.get("/config.js", (req, res) => {
  res.type("application/javascript");
  res.send(`
    window.SUPABASE_URL = "${process.env.SUPABASE_URL || ""}";
    window.SUPABASE_ANON_KEY = "${process.env.SUPABASE_ANON_KEY || ""}";
    window.KAKAO_MAP_KEY = "${process.env.KAKAO_MAP_KEY || ""}";
  `);
});

// 정적 파일 서비스 (현재 폴더의 모든 파일 서빙)
app.use(express.static(__dirname));

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 시작되었습니다: http://localhost:${PORT}`);
  console.log(`메인 화면 주소: http://localhost:${PORT}/html/index.html`);
});
