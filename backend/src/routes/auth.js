import { Router } from "express";
import jwt from "jsonwebtoken";

const r = Router();

const users = [
  { id: 1, username: "admin", password: "1234" },
  { id: 2, username: "joao", password: "abcd" }
];

const SECRET = "segredo-super-simples";

r.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: "Credenciais inválidas" });
  const token = jwt.sign({ sub: user.id, username: user.username }, SECRET, { expiresIn: "1h" });
  res.json({ token });
});

export function authMiddleware(req, res, next) {
  const header = req.headers["authorization"];
  if (!header) return res.status(401).json({ error: "Token em falta" });
  const token = header.split(" ")[1];
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

export default r;
