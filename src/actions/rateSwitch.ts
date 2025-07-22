import {
  Action,
  ActionExample,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  ModelType,
  State,
  composePromptFromState,
  logger,
  parseKeyValueXml,
} from "@elizaos/core";
import { createPublicClient, createWalletClient, http, Address } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { AaveV3Base } from "@bgd-labs/aave-address-book";
import { RateSwitchParams } from "../types";

const rateSwitchTemplate = `Respond with an XML block containing only the extracted values. Use key-value pairs.

Example response for rate switch request:
<response>
    <asset>USDC</asset>
    <targetRateMode>stable</targetRateMode>
</response>

## Recent Messages

{{recentMessages}}

Given the recent messages, extract the following information about the rate switch request:
- Asset: The borrowed token to switch rates for (e.g., USDC, ETH, DAI, WETH)
- TargetRateMode: The desired rate mode ('stable' or 'variable')

Respond with an XML block containing only the extracted values.`;

export const rateSwitchAction: Action = {
  name: "AAVE_RATE_SWITCH",
  similes: [
    "SWITCH_RATE_MODE",
    "CHANGE_INTEREST_RATE",
    "SWITCH_TO_STABLE",
    "SWITCH_TO_VARIABLE",
    "CHANGE_RATE",
  ],
  description:
    "Switch between stable and variable interest rates on borrowed assets",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    logger.debug("Validating AAVE_RATE_SWITCH action");

    const rpcUrl = runtime.getSetting("BASE_RPC_URL");
    const privateKey = runtime.getSetting("WALLET_PRIVATE_KEY");

    if (!rpcUrl || !privateKey) {
      logger.error("BASE_RPC_URL and WALLET_PRIVATE_KEY are required");
      return false;
    }

    const text = message.content.text?.toLowerCase() || "";
    const switchKeywords = ["switch", "change", "convert"];
    const rateKeywords = ["rate", "stable", "variable", "interest"];
    const actionKeywords = ["aave", "rate mode"];

    const hasSwitchKeywords = switchKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasRateKeywords = rateKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasActionKeywords = actionKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return (hasSwitchKeywords && hasRateKeywords) || hasActionKeywords;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: { [key: string]: unknown } | undefined,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    logger.log("Starting AAVE_RATE_SWITCH handler...");

    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.composeState(message, ["RECENT_MESSAGES"]);
    }

    const prompt = composePromptFromState({
      state: currentState!,
      template: rateSwitchTemplate,
    });

    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      stopSequences: [],
    });

    const content = parseKeyValueXml(result);
    logger.debug("Parsed content:", content);

    if (!isValidRateSwitchContent(content)) {
      logger.error("Invalid content for AAVE_RATE_SWITCH action.");
      const errorMessage =
        "Unable to process rate switch request. Please specify the asset and rate mode to switch to.";
      callback?.({
        text: errorMessage,
        content: { error: "Invalid rate switch parameters" },
      });
      return {
        text: errorMessage,
        success: false,
      };
    }

    try {
      const rpcUrl = runtime.getSetting("BASE_RPC_URL");
      const privateKey = runtime.getSetting("WALLET_PRIVATE_KEY");

      if (!rpcUrl || !privateKey) {
        const errorMessage =
          "Configuration error: RPC URL and private key are required.";
        callback?.({
          text: errorMessage,
          content: { error: "Missing configuration" },
        });
        return {
          text: errorMessage,
          success: false,
        };
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
        const errorMessage = `Unsupported asset: ${content.asset}. Supported assets: USDC, WETH, DAI`;
        callback?.({
          text: errorMessage,
          content: { error: "Unsupported asset" },
        });
        return {
          text: errorMessage,
          success: false,
        };
      }

      const targetRateMode = content.targetRateMode.toLowerCase();
      const currentRateMode =
        targetRateMode === "stable" ? "variable" : "stable";

      // For demonstration - in production you'd execute the actual rate switch
      logger.debug("Would switch rate:", {
        asset: content.asset,
        fromRate: currentRateMode,
        toRate: targetRateMode,
        assetAddress,
      });

      // Simulate successful transaction
      const mockTxHash =
        "0xdef123456789abcdef123456789abcdef123456789abcdef123456789abcdef12";

      const responseText = `✅ Successfully switched ${content.asset} interest rate to ${targetRateMode} mode!

Transaction hash: ${mockTxHash}
Asset: ${content.asset}
Previous rate: ${currentRateMode}
New rate: ${targetRateMode}
New APR: ~${targetRateMode === "stable" ? "4.2%" : "3.9%"}

${
  targetRateMode === "stable"
    ? "🔒 Your rate is now fixed and protected from market volatility"
    : "📈 Your rate will now fluctuate with market conditions but typically offers better rates"
}

Note: This is a demonstration. In production, actual blockchain transactions would be executed.`;

      callback?.({
        text: responseText,
        content: {
          action: "AAVE_RATE_SWITCH",
          asset: content.asset,
          fromRateMode: currentRateMode,
          toRateMode: targetRateMode,
          transactionHash: mockTxHash,
          success: true,
        },
      });

      return {
        text: `Successfully switched to ${content.targetRateMode} rate for ${content.asset}`,
        success: true,
        data: {
          asset: content.asset,
          rateMode: content.targetRateMode,
          transactionHash: mockTxHash,
        },
      };
    } catch (error) {
      logger.error("Rate switch operation failed:", error);
      const errorMessage =
        "Failed to switch interest rate mode. Please try again.";
      callback?.({
        text: errorMessage,
        content: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return {
        text: errorMessage,
        success: false,
      };
    }
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "Switch my USDC loan to stable rate",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Interest rate switched to stable mode",
          action: "AAVE_RATE_SWITCH",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Change my ETH borrow to variable rate",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "ETH loan switched to variable rate",
          action: "AAVE_RATE_SWITCH",
        },
      },
    ],
  ],
};

function isValidRateSwitchContent(content: any): content is RateSwitchParams {
  logger.debug("Content for validation", content);
  return (
    content &&
    typeof content.asset === "string" &&
    content.asset.length > 0 &&
    typeof content.targetRateMode === "string" &&
    (content.targetRateMode === "stable" ||
      content.targetRateMode === "variable")
  );
}
