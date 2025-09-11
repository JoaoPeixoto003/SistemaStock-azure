export default async function (context, myTimer) {
  const timeStamp = new Date().toISOString();
  context.log("StockMonitorFunction executed at:", timeStamp);
}
