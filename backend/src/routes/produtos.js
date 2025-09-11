import { Router } from "express";
import { v4 as uuid } from "uuid";

const r = Router();
let produtos = [];

// GET all
r.get("/", (req, res) => res.json(produtos));

// POST new
r.post("/", (req, res) => {
  const p = { id: uuid(), ...req.body };
  produtos.push(p);
  res.status(201).json(p);
});

export default r;
