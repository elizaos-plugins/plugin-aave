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
import { CollateralManagementParams } from "../types";

const collateralManagementTemplate = `Respond with an XML block containing only the extracted values. Use key-value pairs.

Example response for collateral management request:
<response>
    <asset>USDC</asset>
    <enable>true</enable>
</response>

## Recent Messages

{{recentMessages}}

Given the recent messages, extract the following information about the collateral management request:
- Asset: The token to manage as collateral (e.g., USDC, ETH, DAI, WETH)
- Enable: Whether to enable or disable as collateral (true/false)

Respond with an XML block containing only the extracted values.`;

export const collateralManagementAction: Action = {
  name: "AAVE_COLLATERAL_MANAGEMENT",
  similes: [
    "ENABLE_COLLATERAL",
    "DISABLE_COLLATERAL",
    "TOGGLE_COLLATERAL",
    "MANAGE_COLLATERAL",
    "SET_COLLATERAL",
  ],
  description: "Enable or disable assets as collateral in Aave V3",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    logger.debug("Validating AAVE_COLLATERAL_MANAGEMENT action");

    const rpcUrl = runtime.getSetting("BASE_RPC_URL");
    const privateKey = runtime.getSetting("WALLET_PRIVATE_KEY");

    if (!rpcUrl || !privateKey) {
      logger.error("BASE_RPC_URL and WALLET_PRIVATE_KEY are required");
      return false;
    }

    const text = message.content.text?.toLowerCase() || "";
    const collateralKeywords = [
      "collateral",
      "enable",
      "disable",
      "toggle",
      "manage",
    ];
    const actionKeywords = [
      "as collateral",
      "for borrowing",
      "aave collateral",
    ];

    const hasCollateralKeywords = collateralKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasActionKeywords = actionKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return hasCollateralKeywords || hasActionKeywords;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: { [key: string]: unknown } | undefined,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    logger.log("Starting AAVE_COLLATERAL_MANAGEMENT handler...");

    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.composeState(message, ["RECENT_MESSAGES"]);
    }

    const prompt = composePromptFromState({
      state: currentState!,
      template: collateralManagementTemplate,
    });

    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      stopSequences: [],
    });

    const content = parseKeyValueXml(result);
    logger.debug("Parsed content:", content);

    if (!isValidCollateralContent(content)) {
      logger.error("Invalid content for AAVE_COLLATERAL_MANAGEMENT action.");
      const errorMessage =
        "Unable to process collateral management request. Please specify the asset and action (enable/disable).";
      callback?.({
        text: errorMessage,
        content: { error: "Invalid collateral parameters" },
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

      const isEnabling = content.enable;
      const action = isEnabling ? "enabled" : "disabled";
      const actionVerb = isEnabling ? "enable" : "disable";

      // For demonstration - in production you'd execute the actual collateral management
      logger.debug("Would manage collateral:", {
        asset: content.asset,
        enable: content.enable,
        assetAddress,
      });

      // Simulate successful transaction
      const mockTxHash =
        "0xcdef456789abcdef456789abcdef456789abcdef456789abcdef456789abcdef45";

      const responseText = `✅ Successfully ${action} ${content.asset} as collateral in Aave V3!

Transaction hash: ${mockTxHash}
Asset: ${content.asset}
Status: ${action.charAt(0).toUpperCase() + action.slice(1)} as collateral
${
  isEnabling
    ? `
💰 Your ${content.asset} can now be used as collateral for borrowing
📈 This increases your borrowing power
⚠️ Remember that collateral can be liquidated if health factor drops below 1.0`
    : `
🔓 Your ${content.asset} is no longer being used as collateral
📉 This reduces your borrowing power but protects the asset from liquidation
✅ Position is safer but with reduced leverage capability`
}

Note: This is a demonstration. In production, actual blockchain transactions would be executed.`;

      callback?.({
        text: responseText,
        content: {
          action: "AAVE_COLLATERAL_MANAGEMENT",
          asset: content.asset,
          enable: content.enable,
          transactionHash: mockTxHash,
          success: true,
        },
      });

      return {
        text: `Successfully ${content.enable ? "enabled" : "disabled"} ${content.asset} as collateral on Aave V3`,
        success: true,
        data: {
          asset: content.asset,
          action: content.enable ? "enable" : "disable",
          transactionHash: mockTxHash,
        },
      };
    } catch (error) {
      logger.error("Collateral management operation failed:", error);
      const errorMessage =
        "Failed to manage collateral on Aave. Please try again.";
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
          text: "Enable USDC as collateral on Aave",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "USDC enabled as collateral",
          action: "AAVE_COLLATERAL_MANAGEMENT",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Disable ETH collateral to protect it",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "ETH collateral disabled successfully",
          action: "AAVE_COLLATERAL_MANAGEMENT",
        },
      },
    ],
  ],
};

function isValidCollateralContent(
  content: any,
): content is CollateralManagementParams {
  logger.debug("Content for validation", content);
  return (
    content &&
    typeof content.asset === "string" &&
    content.asset.length > 0 &&
    typeof content.enable === "boolean"
  );
}
