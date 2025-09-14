import { Router } from "express";
import { v4 as uuid } from "uuid";
import { CosmosClient } from "@azure/cosmos";
import dotenv from "dotenv";
import { Buffer } from "buffer";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";

dotenv.config();

const r = Router();

// Cosmos setup
const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});
const database = client.database(process.env.COSMOS_DATABASE || "InventarioDB");
const produtosContainer = database.container(process.env.COSMOS_CONTAINER_PRODUTOS || "Produtos");
const movContainer = database.container(process.env.COSMOS_CONTAINER_MOVIMENTACOES || "Movimentacoes");
const alertContainer = database.container(process.env.COSMOS_CONTAINER_ALERTAS || "Alertas");

// Blob setup: supports CONNECTION_STRING or ACCOUNT+KEY
let blobServiceClient = null;
const blobContainerName = process.env.AZURE_STORAGE_CONTAINER || "product-images";

try {
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    console.log("BlobServiceClient from connection string");
  } else if (process.env.AZURE_STORAGE_ACCOUNT && process.env.AZURE_STORAGE_KEY) {
    const account = process.env.AZURE_STORAGE_ACCOUNT;
    const key = process.env.AZURE_STORAGE_KEY;
    const cred = new StorageSharedKeyCredential(account, key);
    blobServiceClient = new BlobServiceClient(`https://${account}.blob.core.windows.net`, cred);
    console.log("BlobServiceClient from account/key");
  } else {
    console.log("Blob storage not configured (no connection string or account/key)");
  }
} catch (e) {
  console.error("Erro a inicializar BlobServiceClient:", e);
  blobServiceClient = null;
}

// Utilities
async function criarMovimento(produtoId, tipo, quantidade, user = "system") {
  try {
    const mov = {
      id: uuid(),
      produtoId,
      tipo, // "create", "delete", "entrada", "saida"
      quantidade,
      user,
      data: new Date().toISOString(),
    };
    await movContainer.items.create(mov);
  } catch (err) {
    console.error("Erro a criar movimentacao:", err);
  }
}

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
      status: "open",
    };
    await alertContainer.items.create(alerta);
  } catch (err) {
    console.error("Erro a criar alerta:", err);
  }
}

// Helpers
function guessContentType(filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  if (["jpg", "jpeg"].includes(ext)) return "image/jpeg";
  if (["png"].includes(ext)) return "image/png";
  if (["gif"].includes(ext)) return "image/gif";
  return "application/octet-stream";
}

// Routes

// GET all produtos (user-scoped)
r.get("/", async (req, res) => {
  try {
    const { resources } = await produtosContainer.items.query({ query: "SELECT * FROM c" }).fetchAll();
    const produtosDoUser = resources.filter((p) => p.user === req.user.username);
    res.json(produtosDoUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar produtos" });
  }
});

// POST create produto (accepts imagemUrl in body)
r.post("/", async (req, res) => {
  try {
    const item = req.body;
    if (!item.categoria) item.categoria = "Geral";
    if (!item.id) item.id = uuid();
    item.user = req.user.username;

    const { resource } = await produtosContainer.items.create(item);

    // movimentacao create
    await criarMovimento(resource.id, "create", resource.quantidadeAtual || 0, req.user.username);

    // alerta se stock baixo
    if ((resource.quantidadeAtual || 0) <= (resource.quantidadeMinima || 0)) {
      await criarAlerta(resource);
    }

    res.status(201).json(resource);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar produto" });
  }
});

// DELETE produto
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

// PUT alterar quantidade (cria entrada/saida)
r.put("/:id/:categoria/quantidade", async (req, res) => {
  try {
    const { id, categoria } = req.params;
    const { delta } = req.body;
    if (typeof delta !== "number") return res.status(400).json({ error: "delta must be a number" });

    const { resource: produto } = await produtosContainer.item(id, categoria).read();

    if (!produto) return res.status(404).json({ error: "Produto não encontrado" });
    if (produto.user !== req.user.username) return res.status(403).json({ error: "Não podes alterar este produto" });

    produto.quantidadeAtual = (produto.quantidadeAtual || 0) + delta;
    await produtosContainer.items.upsert(produto);

    const tipoMov = delta > 0 ? "entrada" : "saida";
    await criarMovimento(id, tipoMov, Math.abs(delta), req.user.username);

    if ((produto.quantidadeAtual || 0) <= (produto.quantidadeMinima || 0)) {
      await criarAlerta(produto);
    }

    res.json(produto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao alterar quantidade" });
  }
});

// Listar movimentacoes (todas)
r.get("/movimentacoes/all", async (req, res) => {
  try {
    const { resources } = await movContainer.items.query({ query: "SELECT * FROM c ORDER BY c.data DESC" }).fetchAll();
    res.json(resources);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar movimentacoes" });
  }
});

// Upload base64 -> Blob e devolve URL
r.post("/upload", async (req, res) => {
  try {
    const { filename, dataBase64 } = req.body;
    if (!blobServiceClient) return res.status(500).json({ error: "Blob storage not configured" });
    if (!filename || !dataBase64) return res.status(400).json({ error: "filename and dataBase64 required" });

    const containerClient = blobServiceClient.getContainerClient(blobContainerName);
    await containerClient.createIfNotExists();

    const blobName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const buffer = Buffer.from(dataBase64, "base64");

    const contentType = guessContentType(filename);

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType },
    });

    const url = blockBlobClient.url;
    res.json({ url });
  } catch (err) {
    console.error("Erro no upload:", err);
    res.status(500).json({ error: "Erro no upload" });
  }
});

export default r;
