require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

const publicDir = path.join(__dirname, "src");

app.get("/config.js", (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

  res.type("application/javascript").send(
    `window.SUPABASE_URL=${JSON.stringify(supabaseUrl)};window.SUPABASE_ANON_KEY=${JSON.stringify(
      supabaseAnonKey
    )};`
  );
});

app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "main.html"));
});

app.listen(port, () => {
  console.log(`MOTIPE server listening on port ${port}`);
});
