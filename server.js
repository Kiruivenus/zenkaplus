const requestHandler = require('./api/server.js');
const { server, PORT } = requestHandler;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(` ZenkaPlus server successfully started!`);
    console.log(` Local access: http://localhost:${PORT}`);
    console.log(`\n API Endpoints:`);
    console.log(`   POST /api/request-stk          â†’ Initiate STK Push`);
    console.log(`   POST /api/mpesa-callback        â†’ Safaricom payment callback`);
    console.log(`   GET  /api/check-payment-status  â†’ Poll transaction status`);
    console.log(`   POST /api/mock-callback         â†’ Dev-only: simulate callback`);
    console.log(`==================================================\n`);
  });
}
