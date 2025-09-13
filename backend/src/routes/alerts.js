import { Router } from "express";
import { CosmosClient } from "@azure/cosmos";
import dotenv from "dotenv";
dotenv.config();

const r = Router();

const client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
const database = client.database(process.env.COSMOS_DATABASE || "InventarioDB");
const alertContainer = database.container(process.env.COSMOS_CONTAINER_ALERTAS || "Alertas");

r.get("/all", async (req, res) => {
    try {
        const { resources } = await alertContainer.items.query({ query: "SELECT * FROM c ORDER BY c.data DESC" }).fetchAll();
        res.json(resources);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao buscar alertas" });
    }
});

export default r;
