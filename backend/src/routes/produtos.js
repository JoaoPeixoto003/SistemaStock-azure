import { Router } from "express";
import { v4 as uuid } from "uuid";
import { CosmosClient } from "@azure/cosmos";

const r = Router();

// Cosmos setup
const client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
const database = client.database(process.env.COSMOS_DATABASE || "InventarioDB");
const container = database.container(process.env.COSMOS_CONTAINER_PRODUTOS || "Produtos");

// GET all produtos
r.get("/", async (req, res) => {
  try {
    const querySpec = { query: "SELECT * FROM c" };
    const { resources } = await container.items.query(querySpec).fetchAll();
    res.json(resources);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar produtos" });
  }
});

// POST create produto
r.post("/", async (req, res) => {
  try {
    const item = req.body;
    if (!item.categoria) item.categoria = "Geral";
    if (!item.id) item.id = uuid();
    const { resource } = await container.items.create(item);
    res.status(201).json(resource);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar produto" });
  }
});

// DELETE produto by id and partition key (categoria)
r.delete("/:id/:categoria", async (req, res) => {
  try {
    const { id, categoria } = req.params;
    await container.item(id, categoria).delete();
    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao apagar produto" });
  }
});

export default r;
