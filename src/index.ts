import { Plugin } from '@elizaos/core';

// Import all services
import { AaveService, WalletService } from './services';

// Import all actions
import {
  supplyAction,
  borrowAction,
  repayAction,
  withdrawAction,
  rateSwitchAction,
  collateralManagementAction,
  eModeAction,
  flashLoanAction,
} from './actions';

// Import all providers
import { PositionContextProvider, HealthFactorProvider } from './providers';

// Import all evaluators
import { EfficiencyModeEvaluator, InterestOptimizationEvaluator } from './evaluators';

// Export the main plugin
export const aavePlugin: Plugin = {
  name: 'aave',
  description:
    'Aave V3 integration plugin for ElizaOS - enabling DeFi lending and borrowing capabilities on Base L2',

  services: [new AaveService(), new WalletService()],

  actions: [
    supplyAction,
    borrowAction,
    repayAction,
    withdrawAction,
    rateSwitchAction,
    collateralManagementAction,
    eModeAction,
    flashLoanAction,
  ],

  providers: [new PositionContextProvider(), new HealthFactorProvider()],

  evaluators: [new EfficiencyModeEvaluator(), new InterestOptimizationEvaluator()],
};

// Export types and interfaces
export * from './types';

// Export individual components for advanced usage
export * from './services';
export * from './actions';
export * from './providers';
export * from './evaluators';

// Default export
export default aavePlugin;
