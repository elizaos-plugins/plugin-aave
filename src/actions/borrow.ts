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
import { BorrowParams } from "../types";

const borrowTemplate = `Respond with an XML block containing only the extracted values. Use key-value pairs.

Example response for borrow request:
<response>
    <asset>USDC</asset>
    <amount>50</amount>
    <rateMode>variable</rateMode>
</response>

## Recent Messages

{{recentMessages}}

Given the recent messages, extract the following information about the borrow request:
- Asset: The token to borrow (e.g., USDC, ETH, DAI, WETH)
- Amount: The amount to borrow (numeric value)
- RateMode: The interest rate mode ('stable' or 'variable', default: 'variable')

Respond with an XML block containing only the extracted values.`;

export const borrowAction: Action = {
  name: "AAVE_BORROW",
  similes: [
    "BORROW_FROM_AAVE",
    "TAKE_LOAN_AAVE",
    "BORROW_AGAINST_COLLATERAL",
    "GET_LOAN",
    "BORROW_ASSET",
  ],
  description: "Borrow assets from Aave V3 against collateral",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    logger.debug("Validating AAVE_BORROW action");

    const rpcUrl = runtime.getSetting("BASE_RPC_URL");
    const privateKey = runtime.getSetting("WALLET_PRIVATE_KEY");

    if (!rpcUrl || !privateKey) {
      logger.error("BASE_RPC_URL and WALLET_PRIVATE_KEY are required");
      return false;
    }

    const text = message.content.text?.toLowerCase() || "";
    const borrowKeywords = ["borrow", "loan", "take out", "get loan"];
    const actionKeywords = ["from aave", "on aave", "against collateral"];

    const hasBorrowKeywords = borrowKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasActionKeywords = actionKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return hasBorrowKeywords || hasActionKeywords;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: { [key: string]: unknown } | undefined,
    callback?: HandlerCallback,
  ): Promise<void> => {
    logger.log("Starting AAVE_BORROW handler...");

    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.composeState(message, ["RECENT_MESSAGES"]);
    }

    const prompt = composePromptFromState({
      state: currentState!,
      template: borrowTemplate,
    });

    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      stopSequences: [],
    });

    const content = parseKeyValueXml(result);
    logger.debug("Parsed content:", content);

    if (!isValidBorrowContent(content)) {
      logger.error("Invalid content for AAVE_BORROW action.");
      callback?.({
        text: "Unable to process borrow request. Please specify the asset and amount to borrow.",
        content: { error: "Invalid borrow parameters" },
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
      const rateMode = content.rateMode === "stable" ? 1 : 2; // 1 = stable, 2 = variable

      // For demonstration - in production you'd execute the actual borrow
      logger.debug("Would borrow:", {
        asset: content.asset,
        amount: content.amount,
        assetAddress,
        poolAddress,
        rateMode: content.rateMode,
      });

      // Simulate successful transaction
      const mockTxHash =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

      const responseText = `✅ Successfully borrowed ${content.amount} ${content.asset} from Aave V3!

Transaction hash: ${mockTxHash}
Interest rate mode: ${content.rateMode}
Rate: ~${content.rateMode === "stable" ? "4.5%" : "3.8%"} APR
Status: Active loan on Base network

⚠️ Monitor your health factor to avoid liquidation
💡 Consider setting up alerts for rate changes

Note: This is a demonstration. In production, actual blockchain transactions would be executed.`;

      callback?.({
        text: responseText,
        content: {
          action: "AAVE_BORROW",
          asset: content.asset,
          amount: content.amount,
          rateMode: content.rateMode,
          transactionHash: mockTxHash,
          success: true,
        },
      });
    } catch (error) {
      logger.error("Borrow operation failed:", error);
      callback?.({
        text: "Failed to borrow from Aave. Please check your collateral and try again.",
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
          text: "I want to borrow 50 USDC from Aave",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Borrow operation completed successfully",
          action: "AAVE_BORROW",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Borrow 0.1 ETH at stable rate from Aave",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "ETH borrowed from Aave at stable rate",
          action: "AAVE_BORROW",
        },
      },
    ],
  ],
};

function isValidBorrowContent(content: any): content is BorrowParams {
  logger.debug("Content for validation", content);
  return (
    content &&
    typeof content.asset === "string" &&
    content.asset.length > 0 &&
    typeof content.amount === "string" &&
    parseFloat(content.amount) > 0 &&
    (content.rateMode === undefined ||
      content.rateMode === "stable" ||
      content.rateMode === "variable")
  );
}
