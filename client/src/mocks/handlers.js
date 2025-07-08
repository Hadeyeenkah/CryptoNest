// This file can be used to create a mock API while your backend is being fixed
// Save as src/mocks/handlers.js

import { rest } from 'msw';

// Create mock handlers
export const handlers = [
  // Health check endpoint
  rest.get('/api/health', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({ status: 'ok' })
    );
  }),
  
  // Deposit endpoint
  rest.post('/api/user/deposit', (req, res, ctx) => {
    const { plan, amount } = req.body;
    
    // Simulate backend validation
    if (!plan || !amount) {
      return res(
        ctx.status(400),
        ctx.json({ message: 'Missing required fields' })
      );
    }
    
    // Simulate successful deposit
    return res(
      ctx.status(200),
      ctx.json({ 
        message: 'Deposit request submitted successfully!',
        transactionId: `TX-${Date.now()}`,
        status: 'pending'
      })
    );
  })
];

// USAGE INSTRUCTIONS:
// 1. Install MSW: npm install msw --save-dev
// 2. Create a setup file (src/mocks/browser.js):
//    --------------------------------------------
//    import { setupWorker } from 'msw'
//    import { handlers } from './handlers'
//    export const worker = setupWorker(...handlers)
//    --------------------------------------------
// 3. Initialize in your index.js:
//    --------------------------------------------
//    if (process.env.NODE_ENV === 'development') {
//      const { worker } = require('./mocks/browser')
//      worker.start()
//    }
//    --------------------------------------------