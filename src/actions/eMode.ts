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
import { eModeParams } from "../types";

const eModeTemplate = `Respond with an XML block containing only the extracted values. Use key-value pairs.

Example response for eMode request:
<response>
    <categoryId>1</categoryId>
    <enable>true</enable>
</response>

## Recent Messages

{{recentMessages}}

Given the recent messages, extract the following information about the eMode request:
- CategoryId: The eMode category ID (1 for stablecoins, 2 for ETH correlated assets)
- Enable: Whether to enable or disable eMode (true/false)

Common eMode categories:
- Category 1: Stablecoins (USDC, DAI, USDT)
- Category 2: ETH derivatives (ETH, stETH, wstETH)

Respond with an XML block containing only the extracted values.`;

export const eModeAction: Action = {
  name: "AAVE_EMODE",
  similes: [
    "ENABLE_EMODE",
    "DISABLE_EMODE",
    "TOGGLE_EMODE",
    "EFFICIENCY_MODE",
    "HIGH_EFFICIENCY",
  ],
  description:
    "Enable or disable Efficiency Mode (eMode) in Aave V3 for higher borrowing power with correlated assets",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    logger.debug("Validating AAVE_EMODE action");

    const rpcUrl = runtime.getSetting("BASE_RPC_URL");
    const privateKey = runtime.getSetting("WALLET_PRIVATE_KEY");

    if (!rpcUrl || !privateKey) {
      logger.error("BASE_RPC_URL and WALLET_PRIVATE_KEY are required");
      return false;
    }

    const text = message.content.text?.toLowerCase() || "";
    const eModeKeywords = [
      "emode",
      "efficiency mode",
      "high efficiency",
      "enable emode",
      "disable emode",
    ];
    const actionKeywords = [
      "aave emode",
      "efficiency",
      "higher ltv",
      "better rates",
    ];

    const hasEModeKeywords = eModeKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasActionKeywords = actionKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return hasEModeKeywords || hasActionKeywords;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: { [key: string]: unknown } | undefined,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    logger.log("Starting AAVE_EMODE handler...");

    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.composeState(message, ["RECENT_MESSAGES"]);
    }

    const prompt = composePromptFromState({
      state: currentState!,
      template: eModeTemplate,
    });

    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      stopSequences: [],
    });

    const content = parseKeyValueXml(result);
    logger.debug("Parsed content:", content);

    if (!isValidEModeContent(content)) {
      logger.error("Invalid content for AAVE_EMODE action.");
      const errorMessage =
        "Unable to process e-mode request. Please specify the category ID.";
      callback?.({
        text: errorMessage,
        content: { error: "Invalid e-mode parameters" },
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

      const isEnabling = content?.enable ?? false;
      const categoryId = content?.categoryId || 0;
      const action = isEnabling ? "enabled" : "disabled";

      // Get category information
      const categoryInfo = getCategoryInfo(categoryId);

      // For demonstration - in production you'd execute the actual eMode setting
      logger.debug("Would set eMode:", {
        categoryId,
        enable: content.enable,
        categoryInfo,
      });

      // Simulate successful transaction
      const mockTxHash =
        "0xedef789abcdef789abcdef789abcdef789abcdef789abcdef789abcdef789abcdef";

      const responseText = isEnabling
        ? `✅ Successfully enabled Efficiency Mode (eMode) in Aave V3!

Transaction hash: ${mockTxHash}
Category: ${categoryId} - ${categoryInfo.name}
Status: eMode enabled

Benefits of eMode:
🎯 Higher LTV: Up to ${categoryInfo.ltv}% (vs standard ~80%)
📈 Higher Liquidation Threshold: ${categoryInfo.liquidationThreshold}%
💰 Better borrowing power with correlated assets
⚡ Optimized for ${categoryInfo.description}

⚠️ Remember: eMode works best when your collateral and borrowed assets are in the same category.

Note: This is a demonstration. In production, actual blockchain transactions would be executed.`
        : `✅ Successfully disabled Efficiency Mode (eMode) in Aave V3!

Transaction hash: ${mockTxHash}
Status: eMode disabled
Previous Category: ${categoryId} - ${categoryInfo.name}

Changes:
📉 LTV reduced to standard rates (~80%)
📉 Liquidation threshold reduced to standard rates
🔄 Back to standard borrowing parameters
✅ More flexibility to use diverse assets

Note: This is a demonstration. In production, actual blockchain transactions would be executed.`;

      callback?.({
        text: responseText,
        content: {
          action: "AAVE_EMODE",
          categoryId: content?.categoryId || 0,
          enable: content?.enable ?? false,
          categoryInfo,
          transactionHash: mockTxHash,
          success: true,
        },
      });

      return {
        text: `Successfully ${categoryId === 0 ? "disabled" : "enabled"} E-Mode on Aave V3`,
        success: true,
        data: {
          categoryId: categoryId,
          transactionHash: mockTxHash,
        },
      };
    } catch (error) {
      logger.error("E-Mode operation failed:", error);
      const errorMessage = "Failed to set e-mode. Please try again.";
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
          text: "Enable eMode for stablecoins on Aave",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Efficiency Mode enabled for stablecoin category",
          action: "AAVE_EMODE",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Disable efficiency mode on Aave",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Efficiency Mode disabled",
          action: "AAVE_EMODE",
        },
      },
    ],
  ],
};

function isValidEModeContent(content: any): content is eModeParams {
  logger.debug("Content for validation", content);
  return (
    content &&
    typeof content.categoryId === "number" &&
    content.categoryId >= 0 &&
    content.categoryId <= 2 &&
    typeof content.enable === "boolean"
  );
}

function getCategoryInfo(categoryId: number): {
  name: string;
  description: string;
  ltv: number;
  liquidationThreshold: number;
} {
  switch (categoryId) {
    case 1:
      return {
        name: "Stablecoins",
        description: "USD-pegged stablecoins (USDC, DAI, USDT)",
        ltv: 93,
        liquidationThreshold: 95,
      };
    case 2:
      return {
        name: "ETH Correlated",
        description: "ETH and ETH derivative assets (ETH, stETH, wstETH)",
        ltv: 90,
        liquidationThreshold: 93,
      };
    default:
      return {
        name: "Disabled",
        description: "Standard mode with diverse assets",
        ltv: 80,
        liquidationThreshold: 85,
      };
  }
}
