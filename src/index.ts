import { Plugin } from "@elizaos/core";
import { supplyAction } from "./actions/supply";
import { borrowAction } from "./actions/borrow";
import { repayAction } from "./actions/repay";
import { withdrawAction } from "./actions/withdraw";
import { rateSwitchAction } from "./actions/rateSwitch";
import { collateralManagementAction } from "./actions/collateralManagement";
import { eModeAction } from "./actions/eMode";
import { flashLoanAction } from "./actions/flashLoan";
import { positionContextProvider } from "./providers/positionContext";
import { healthFactorProvider } from "./providers/healthFactor";

export const aavePlugin: Plugin = {
  name: "aave",
  description:
    "Aave V3 integration plugin for ElizaOS - enabling DeFi lending and borrowing capabilities on Base L2",
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
  providers: [positionContextProvider, healthFactorProvider],
};

export default aavePlugin;

// Export types for external use
export * from "./types";
export {
  supplyAction,
  borrowAction,
  repayAction,
  withdrawAction,
  rateSwitchAction,
  collateralManagementAction,
  eModeAction,
  flashLoanAction,
};
export { positionContextProvider, healthFactorProvider };
