import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import produtosRouter from "./routes/produtos.js";
import authRouter, { authMiddleware } from "./routes/auth.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(morgan("dev"));
app.use(cors());

app.get("/api/health", (_, res) => res.json({ ok: true }));

// auth routes
app.use("/api/auth", authRouter);

// protected routes
app.use("/api/produtos", authMiddleware, produtosRouter);

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API running on port ${port}`));
