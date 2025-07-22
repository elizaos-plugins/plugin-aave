import { Plugin } from '@elizaos/core';
import { AaveService } from './services/index.js';
import { supplyAction, withdrawAction, borrowAction, repayAction } from './actions/index.js';
import { marketDataProvider, positionProvider } from './providers/index.js';

export const plugin: Plugin = {
  name: 'aave',
  description: 'Aave V3 Protocol integration for lending and borrowing operations',
  
  // Core services
  services: [AaveService],
  
  // User actions
  actions: [supplyAction, withdrawAction, borrowAction, repayAction],
  
  // Context providers
  providers: [marketDataProvider, positionProvider],
  
  // No evaluators for now
  evaluators: [],
};

export default plugin;

// Re-export components for external use
export { AaveService } from './services/index.js';
export { supplyAction, withdrawAction, borrowAction, repayAction } from './actions/index.js';
export { marketDataProvider, positionProvider } from './providers/index.js';
export * from './types/index.js';