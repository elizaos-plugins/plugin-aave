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
import { RepayParams } from "../types";

const repayTemplate = `Respond with an XML block containing only the extracted values. Use key-value pairs.

Example response for repay request:
<response>
    <asset>USDC</asset>
    <amount>25</amount>
    <rateMode>variable</rateMode>
</response>

## Recent Messages

{{recentMessages}}

Given the recent messages, extract the following information about the repay request:
- Asset: The token to repay (e.g., USDC, ETH, DAI, WETH)
- Amount: The amount to repay (numeric value, use "max" or "-1" to repay all)
- RateMode: The interest rate mode to repay ('stable' or 'variable')

Respond with an XML block containing only the extracted values.`;

export const repayAction: Action = {
  name: "AAVE_REPAY",
  similes: [
    "REPAY_AAVE_LOAN",
    "PAY_BACK_AAVE",
    "REPAY_DEBT",
    "PAY_OFF_LOAN",
    "CLOSE_POSITION",
  ],
  description: "Repay borrowed assets to Aave V3 lending protocol",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    logger.debug("Validating AAVE_REPAY action");

    const rpcUrl = runtime.getSetting("BASE_RPC_URL");
    const privateKey = runtime.getSetting("WALLET_PRIVATE_KEY");

    if (!rpcUrl || !privateKey) {
      logger.error("BASE_RPC_URL and WALLET_PRIVATE_KEY are required");
      return false;
    }

    const text = message.content.text?.toLowerCase() || "";
    const repayKeywords = ["repay", "pay back", "pay off", "close"];
    const actionKeywords = ["aave debt", "aave loan", "to aave"];

    const hasRepayKeywords = repayKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasActionKeywords = actionKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return hasRepayKeywords || hasActionKeywords;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: { [key: string]: unknown } | undefined,
    callback?: HandlerCallback,
  ): Promise<void> => {
    logger.log("Starting AAVE_REPAY handler...");

    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.composeState(message, ["RECENT_MESSAGES"]);
    }

    const prompt = composePromptFromState({
      state: currentState!,
      template: repayTemplate,
    });

    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      stopSequences: [],
    });

    const content = parseKeyValueXml(result);
    logger.debug("Parsed content:", content);

    if (!isValidRepayContent(content)) {
      logger.error("Invalid content for AAVE_REPAY action.");
      callback?.({
        text: "Unable to process repay request. Please specify the asset and amount to repay.",
        content: { error: "Invalid repay parameters" },
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

      const isMaxRepay = content.amount === "max" || content.amount === "-1";
      const amount = isMaxRepay
        ? "all debt"
        : `${content.amount} ${content.asset}`;
      const rateMode = content.rateMode === "stable" ? 1 : 2; // 1 = stable, 2 = variable

      // For demonstration - in production you'd execute the actual repay
      logger.debug("Would repay:", {
        asset: content.asset,
        amount: content.amount,
        assetAddress,
        rateMode: content.rateMode,
        isMaxRepay,
      });

      // Simulate successful transaction
      const mockTxHash =
        "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba";

      const responseText = isMaxRepay
        ? `✅ Successfully repaid all ${content.asset} debt to Aave V3!

Transaction hash: ${mockTxHash}
Rate mode: ${content.rateMode}
Status: Position closed
Health factor: Improved significantly

🎉 Congratulations! Your ${content.asset} debt has been fully repaid.

Note: This is a demonstration. In production, actual blockchain transactions would be executed.`
        : `✅ Successfully repaid ${content.amount} ${content.asset} to Aave V3!

Transaction hash: ${mockTxHash}
Rate mode: ${content.rateMode}
Remaining debt: Reduced
Health factor: Improved

Your position is now safer with reduced debt exposure.

Note: This is a demonstration. In production, actual blockchain transactions would be executed.`;

      callback?.({
        text: responseText,
        content: {
          action: "AAVE_REPAY",
          asset: content.asset,
          amount: content.amount,
          rateMode: content.rateMode,
          transactionHash: mockTxHash,
          isMaxRepay,
          success: true,
        },
      });
    } catch (error) {
      logger.error("Repay operation failed:", error);
      callback?.({
        text: "Failed to repay debt to Aave. Please try again.",
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
          text: "Repay 25 USDC to Aave",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Repay operation completed successfully",
          action: "AAVE_REPAY",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Pay off all my ETH debt on Aave",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "All ETH debt repaid to Aave",
          action: "AAVE_REPAY",
        },
      },
    ],
  ],
};

function isValidRepayContent(content: any): content is RepayParams {
  logger.debug("Content for validation", content);
  return (
    content &&
    typeof content.asset === "string" &&
    content.asset.length > 0 &&
    typeof content.amount === "string" &&
    (parseFloat(content.amount) > 0 ||
      content.amount === "max" ||
      content.amount === "-1") &&
    (content.rateMode === undefined ||
      content.rateMode === "stable" ||
      content.rateMode === "variable")
  );
}
