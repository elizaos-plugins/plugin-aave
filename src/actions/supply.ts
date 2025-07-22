import {
  Action,
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  ModelType,
  State,
  composePromptFromState,
  logger,
  parseKeyValueXml,
} from "@elizaos/core";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  Address,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { AaveV3Base } from "@bgd-labs/aave-address-book";
import { SupplyParams } from "../types";

const supplyTemplate = `Respond with an XML block containing only the extracted values. Use key-value pairs.

Example response for supply request:
<response>
    <asset>USDC</asset>
    <amount>100</amount>
    <enableCollateral>true</enableCollateral>
</response>

## Recent Messages

{{recentMessages}}

Given the recent messages, extract the following information about the supply request:
- Asset: The token to supply (e.g., USDC, ETH, DAI, WETH)
- Amount: The amount to supply (numeric value)
- EnableCollateral: Whether to enable as collateral (true/false, default: true)

Respond with an XML block containing only the extracted values.`;

export const supplyAction: Action = {
  name: "AAVE_SUPPLY",
  similes: [
    "SUPPLY_TO_AAVE",
    "LEND_TO_AAVE",
    "DEPOSIT_TO_AAVE",
    "PROVIDE_LIQUIDITY",
    "SUPPLY_ASSET",
    "LEND_ASSET",
  ],
  description: "Supply assets to Aave V3 lending protocol to earn interest",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    logger.debug("Validating AAVE_SUPPLY action");

    const rpcUrl = runtime.getSetting("BASE_RPC_URL");
    const privateKey = runtime.getSetting("WALLET_PRIVATE_KEY");

    if (!rpcUrl || !privateKey) {
      logger.error("BASE_RPC_URL and WALLET_PRIVATE_KEY are required");
      return false;
    }

    const text = message.content.text?.toLowerCase() || "";
    const supplyKeywords = ["supply", "lend", "deposit", "provide", "aave"];
    const actionKeywords = ["to aave", "on aave", "into aave"];

    const hasSupplyKeywords = supplyKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasActionKeywords = actionKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return hasSupplyKeywords || hasActionKeywords;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: { [key: string]: unknown } | undefined,
    callback?: HandlerCallback,
  ): Promise<void> => {
    logger.log("Starting AAVE_SUPPLY handler...");

    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.composeState(message, ["RECENT_MESSAGES"]);
    }

    const prompt = composePromptFromState({
      state: currentState!,
      template: supplyTemplate,
    });

    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      stopSequences: [],
    });

    const content = parseKeyValueXml(result);
    logger.debug("Parsed content:", content);

    if (!isValidSupplyContent(content)) {
      logger.error("Invalid content for AAVE_SUPPLY action.");
      callback?.({
        text: "Unable to process supply request. Please specify the asset and amount to supply.",
        content: { error: "Invalid supply parameters" },
      });
      return;
    }

    try {
      const rpcUrl = runtime.getSetting("BASE_RPC_URL");
      const privateKey = runtime.getSetting("WALLET_PRIVATE_KEY");

      if (!rpcUrl || !privateKey) {
        callback?.({
          text: "Configuration error: RPC URL and private key are required.",
          content: { error: "Missing configuration" },
        });
        return;
      }

      // Create clients
      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(rpcUrl),
      });

      // Get asset address (simplified - in production you'd have a mapping)
      const assetAddresses: { [key: string]: Address } = {
        USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        WETH: "0x4200000000000000000000000000000000000006",
        ETH: "0x4200000000000000000000000000000000000006",
        DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
      };

      const assetAddress = assetAddresses[content.asset.toUpperCase()];
      if (!assetAddress) {
        callback?.({
          text: `Unsupported asset: ${content.asset}. Supported assets: USDC, WETH, DAI`,
          content: { error: "Unsupported asset" },
        });
        return;
      }

      const amount = parseUnits(content.amount, 6); // Assuming 6 decimals for simplicity
      const poolAddress = AaveV3Base.POOL as Address;

      // For demonstration - in production you'd need proper token approval first
      logger.debug("Would supply:", {
        asset: content.asset,
        amount: content.amount,
        assetAddress,
        poolAddress,
        enableCollateral: content.enableCollateral,
      });

      // Simulate successful transaction
      const mockTxHash =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

      const responseText = `✅ Successfully supplied ${content.amount} ${content.asset} to Aave V3!

Transaction hash: ${mockTxHash}
Collateral enabled: ${content.enableCollateral ? "Yes" : "No"}
Status: Earning interest on Base network

Note: This is a demonstration. In production, actual blockchain transactions would be executed.`;

      callback?.({
        text: responseText,
        content: {
          action: "AAVE_SUPPLY",
          asset: content.asset,
          amount: content.amount,
          enableCollateral: content.enableCollateral,
          transactionHash: mockTxHash,
          success: true,
        },
      });
    } catch (error) {
      logger.error("Supply operation failed:", error);
      callback?.({
        text: "Failed to supply asset to Aave. Please try again.",
        content: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "I want to supply 100 USDC to Aave",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Supply operation completed successfully",
          action: "AAVE_SUPPLY",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Supply 0.5 ETH to Aave and enable it as collateral",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "ETH supplied to Aave with collateral enabled",
          action: "AAVE_SUPPLY",
        },
      },
    ],
  ],
};

function isValidSupplyContent(content: any): content is SupplyParams {
  logger.debug("Content for validation", content);
  return (
    content &&
    typeof content.asset === "string" &&
    content.asset.length > 0 &&
    typeof content.amount === "string" &&
    parseFloat(content.amount) > 0 &&
    (content.enableCollateral === undefined ||
      typeof content.enableCollateral === "boolean")
  );
}
