const { CosmosClient } = require("@azure/cosmos");
const { randomUUID } = require("crypto");

module.exports = async function (context, myTimer) {
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE || 'InventarioDB';
  const produtosContainerId = process.env.COSMOS_CONTAINER_PRODUTOS || 'Produtos';
  const alertContainerId = process.env.COSMOS_CONTAINER_ALERTAS || 'Alertas';

  if (!endpoint || !key) {
    context.log('Cosmos not configured');
    return;
  }

  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseId);
  const produtos = database.container(produtosContainerId);
  const alerts = database.container(alertContainerId);

  try {
    const { resources } = await produtos.items.query({ query: "SELECT * FROM c" }).fetchAll();
    for (const p of resources) {
      const qAtual = p.quantidadeAtual || 0;
      const qMin = p.quantidadeMinima || 0;
      if (qAtual <= qMin) {
        const alerta = {
          id: randomUUID(),
          produtoId: p.id,
          nome: p.nome,
          categoria: p.categoria,
          quantidadeAtual: qAtual,
          quantidadeMinima: qMin,
          data: new Date().toISOString(),
          status: "open"
        };
        await alerts.items.create(alerta);
        context.log('Created alert for', p.id);
      }
    }
  } catch (err) {
    context.log('Error in stock monitor:', err.message || err);
  }
};
