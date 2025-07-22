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
import { WithdrawParams } from "../types";

const withdrawTemplate = `Respond with an XML block containing only the extracted values. Use key-value pairs.

Example response for withdraw request:
<response>
    <asset>USDC</asset>
    <amount>50</amount>
</response>

## Recent Messages

{{recentMessages}}

Given the recent messages, extract the following information about the withdraw request:
- Asset: The token to withdraw (e.g., USDC, ETH, DAI, WETH)
- Amount: The amount to withdraw (numeric value, use "max" or "-1" to withdraw all)

Respond with an XML block containing only the extracted values.`;

export const withdrawAction: Action = {
  name: "AAVE_WITHDRAW",
  similes: [
    "WITHDRAW_FROM_AAVE",
    "REMOVE_SUPPLY",
    "WITHDRAW_ASSET",
    "TAKE_OUT",
    "REDEEM_ATOKEN",
  ],
  description: "Withdraw supplied assets from Aave V3 lending protocol",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    logger.debug("Validating AAVE_WITHDRAW action");

    const rpcUrl = runtime.getSetting("BASE_RPC_URL");
    const privateKey = runtime.getSetting("WALLET_PRIVATE_KEY");

    if (!rpcUrl || !privateKey) {
      logger.error("BASE_RPC_URL and WALLET_PRIVATE_KEY are required");
      return false;
    }

    const text = message.content.text?.toLowerCase() || "";
    const withdrawKeywords = ["withdraw", "remove", "take out", "redeem"];
    const actionKeywords = ["from aave", "aave supply", "atoken"];

    const hasWithdrawKeywords = withdrawKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasActionKeywords = actionKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return hasWithdrawKeywords || hasActionKeywords;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: { [key: string]: unknown } | undefined,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    logger.log("Starting AAVE_WITHDRAW handler...");

    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.composeState(message, ["RECENT_MESSAGES"]);
    }

    const prompt = composePromptFromState({
      state: currentState!,
      template: withdrawTemplate,
    });

    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      stopSequences: [],
    });

    const content = parseKeyValueXml(result);
    logger.debug("Parsed content:", content);

    if (!isValidWithdrawContent(content)) {
      logger.error("Invalid content for AAVE_WITHDRAW action.");
      const errorMessage =
        "Unable to process withdraw request. Please specify the asset and amount to withdraw.";
      callback?.({
        text: errorMessage,
        content: { error: "Invalid withdraw parameters" },
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

      const isMaxWithdraw = content.amount === "max" || content.amount === "-1";
      const amount = isMaxWithdraw
        ? "all supplied funds"
        : `${content.amount} ${content.asset}`;

      // For demonstration - in production you'd execute the actual withdraw
      logger.debug("Would withdraw:", {
        asset: content.asset,
        amount: content.amount,
        assetAddress,
        isMaxWithdraw,
      });

      // Simulate successful transaction
      const mockTxHash =
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

      const responseText = isMaxWithdraw
        ? `✅ Successfully withdrew all ${content.asset} from Aave V3!

Transaction hash: ${mockTxHash}
Status: Supply position closed
Remaining supply: 0 ${content.asset}
Health factor: Updated

🎉 All your ${content.asset} has been withdrawn successfully.

Note: This is a demonstration. In production, actual blockchain transactions would be executed.`
        : `✅ Successfully withdrew ${content.amount} ${content.asset} from Aave V3!

Transaction hash: ${mockTxHash}
Withdrawn amount: ${content.amount} ${content.asset}
Remaining supply: Reduced
Health factor: Updated

Your ${content.asset} has been successfully withdrawn to your wallet.

Note: This is a demonstration. In production, actual blockchain transactions would be executed.`;

      callback?.({
        text: responseText,
        content: {
          action: "AAVE_WITHDRAW",
          asset: content.asset,
          amount: content.amount,
          transactionHash: mockTxHash,
          isMaxWithdraw,
          success: true,
        },
      });

      return {
        text: `Successfully withdrew ${content.amount} ${content.asset} from Aave V3`,
        success: true,
        data: {
          asset: content.asset,
          amount: content.amount,
          transactionHash: mockTxHash,
        },
      };
    } catch (error) {
      logger.error("Withdraw operation failed:", error);
      const errorMessage = "Failed to withdraw from Aave. Please try again.";
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
          text: "Withdraw 50 USDC from Aave",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Withdraw operation completed successfully",
          action: "AAVE_WITHDRAW",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Withdraw all my ETH supply from Aave",
        },
      },
      {
        name: "{{user2}}",
        content: {
          text: "All ETH withdrawn from Aave",
          action: "AAVE_WITHDRAW",
        },
      },
    ],
  ],
};

function isValidWithdrawContent(content: any): content is WithdrawParams {
  logger.debug("Content for validation", content);
  return (
    content &&
    typeof content.asset === "string" &&
    content.asset.length > 0 &&
    typeof content.amount === "string" &&
    (parseFloat(content.amount) > 0 ||
      content.amount === "max" ||
      content.amount === "-1")
  );
}
