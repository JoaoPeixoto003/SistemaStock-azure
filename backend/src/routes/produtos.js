import { Router } from "express";
import { v4 as uuid } from "uuid";
import { CosmosClient } from "@azure/cosmos";
import dotenv from "dotenv";
import { Buffer } from "buffer";
import { BlobServiceClient } from "@azure/storage-blob";

dotenv.config();

const r = Router();

// Cosmos setup
const client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
const database = client.database(process.env.COSMOS_DATABASE || "InventarioDB");
const produtosContainer = database.container(process.env.COSMOS_CONTAINER_PRODUTOS || "Produtos");
const movContainer = database.container(process.env.COSMOS_CONTAINER_MOVIMENTACOES || "Movimentacoes");
const alertContainer = database.container(process.env.COSMOS_CONTAINER_ALERTAS || "Alertas");

// Blob setup (expects AZURE_STORAGE_CONNECTION_STRING in .env)
const blobConnection = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobServiceClient = blobConnection ? BlobServiceClient.fromConnectionString(blobConnection) : null;
const blobContainerName = process.env.AZURE_STORAGE_CONTAINER || "product-images";

// Utility: create movement record
async function criarMovimento(produtoId, tipo, quantidade, user = "system") {
  try {
    const mov = {
      id: uuid(),
      produtoId,
      tipo, // "create", "delete", "update"
      quantidade,
      user,
      data: new Date().toISOString()
    };
    await movContainer.items.create(mov);
  } catch (err) {
    console.error("Erro a criar movimentacao:", err);
  }
}

// Utility: criar alerta
async function criarAlerta(produto) {
  try {
    const alerta = {
      id: uuid(),
      produtoId: produto.id,
      nome: produto.nome,
      categoria: produto.categoria,
      quantidadeAtual: produto.quantidadeAtual || 0,
      quantidadeMinima: produto.quantidadeMinima || 0,
      data: new Date().toISOString(),
      status: "open"
    };
    await alertContainer.items.create(alerta);
  } catch (err) {
    console.error("Erro a criar alerta:", err);
  }
}

// GET all produtos
r.get("/", async (req, res) => {
  try {
    // query all produtos e filtra localmente pelo user
    const { resources } = await produtosContainer.items.query({ query: "SELECT * FROM c" }).fetchAll();

    // filtra pelo username que veio do token
    const produtosDoUser = resources.filter(p => p.user === req.user.username);

    res.json(produtosDoUser);
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

    // atribui o user do token
    item.user = req.user.username;

    const { resource } = await produtosContainer.items.create(item);

    // cria movimentacao
    await criarMovimento(resource.id, "create", resource.quantidadeAtual || 0, req.user.username);

    // cria alerta se stock baixo
    if ((resource.quantidadeAtual || 0) <= (resource.quantidadeMinima || 0)) {
      await criarAlerta(resource);
    }

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
    const { resource: existing } = await produtosContainer.item(id, categoria).read();

    if (!existing) return res.status(404).json({ error: "Produto não encontrado" });
    if (existing.user !== req.user.username) return res.status(403).json({ error: "Não podes apagar este produto" });

    await criarMovimento(id, "delete", existing.quantidadeAtual || 0, req.user.username);
    await produtosContainer.item(id, categoria).delete();

    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao apagar produto" });
  }
});

// rota para listar movimentacoes
r.get("/movimentacoes/all", async (req, res) => {
  try {
    const { resources } = await movContainer.items.query({ query: "SELECT * FROM c ORDER BY c.data DESC" }).fetchAll();
    res.json(resources);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar movimentacoes" });
  }
});

// rota upload base64 -> blob
r.post("/upload", async (req, res) => {
  try {
    const { filename, dataBase64 } = req.body;
    if (!blobServiceClient) return res.status(500).json({ error: "Blob storage not configured" });
    if (!filename || !dataBase64) return res.status(400).json({ error: "filename and dataBase64 required" });

    const containerClient = blobServiceClient.getContainerClient(blobContainerName);
    await containerClient.createIfNotExists();
    const blobName = `${Date.now()}-${filename}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const buffer = Buffer.from(dataBase64, "base64");
    await blockBlobClient.uploadData(buffer, { blobHTTPHeaders: { blobContentType: "image/png" } });

    const url = blockBlobClient.url;
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro no upload" });
  }
});

export default r;
