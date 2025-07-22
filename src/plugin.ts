import type { Plugin } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { z } from "zod";
import { createDefaultConfig } from "./config";
import {
  supplyAction,
  borrowAction,
  repayAction,
  withdrawAction,
  rateSwitchAction,
  collateralManagementAction,
  eModeAction,
  flashLoanAction,
} from "./actions";
import { positionContextProvider, healthFactorProvider } from "./providers";

/**
 * Configuration schema for the Aave plugin
 */
const configSchema = z.object({
  BASE_RPC_URL: z
    .string()
    .url("BASE_RPC_URL must be a valid URL")
    .min(1, "BASE_RPC_URL is required"),
  WALLET_PRIVATE_KEY: z
    .string()
    .min(1, "WALLET_PRIVATE_KEY is required")
    .optional(),
  WALLET_ADDRESS: z.string().min(1, "WALLET_ADDRESS is required").optional(),
  HEALTH_FACTOR_ALERT: z
    .string()
    .transform((val) => parseFloat(val))
    .refine((val) => val > 1, "HEALTH_FACTOR_ALERT must be greater than 1")
    .default("1.5"),
  FLASH_LOAN_MAX_FEE: z
    .string()
    .transform((val) => parseFloat(val))
    .refine(
      (val) => val >= 0 && val <= 1,
      "FLASH_LOAN_MAX_FEE must be between 0 and 1",
    )
    .default("0.1"),
  AAVE_NETWORK: z.enum(["base", "base-sepolia"]).default("base"),
});

/**
 * Aave V3 Plugin for ElizaOS
 *
 * Provides comprehensive DeFi functionality including:
 * - Lending and borrowing
 * - Flash loans
 * - Rate switching
 * - Collateral management
 * - Efficiency mode (eMode)
 * - Health factor monitoring
 */
export const aavePlugin: Plugin = {
  name: "aave",
  description:
    "Aave V3 DeFi plugin for lending, borrowing, flash loans, and advanced DeFi operations on Base L2",

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

  evaluators: [],

  services: [],
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
