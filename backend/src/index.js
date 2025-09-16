import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import morgan from "morgan";

import produtosRouter from "./routes/produtos.js";
import authRouter, { authMiddleware } from "./routes/auth.js";

const app = express();
app.set('trust proxy', 1);

// --- Middlewares ---
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// --- CORS ---
// No Azure, coloque o domínio do frontend na variável ALLOWED_ORIGIN
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(cors({
  origin: allowedOrigin,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-access-token"],
  exposedHeaders: ["Authorization"],
  credentials: true
}));

// --- Rotas de saúde / debug ---
app.get("/api/health", (_, res) => res.json({ ok: true }));

app.get("/api/debug/env", (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

// --- Auth ---
app.use("/api/auth", authRouter);

// --- Rotas protegidas (produtos) ---
app.use("/api/produtos", authMiddleware, produtosRouter);

// --- Start server ---
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API running on port ${port}`));
