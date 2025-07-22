import {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
  logger,
} from "@elizaos/core";
import BigNumber from "bignumber.js";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { AaveV3Base } from "@bgd-labs/aave-address-book";

export const healthFactorProvider: Provider = {
  name: "healthFactorProvider",
  description:
    "Provides detailed health factor analysis and risk assessment for Aave V3 positions",
  dynamic: true,
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
  ): Promise<ProviderResult> => {
    logger.debug("healthFactorProvider::get");

    const rpcUrl = runtime.getSetting("BASE_RPC_URL");
    const walletAddress = runtime.getSetting("WALLET_ADDRESS");

    if (!rpcUrl) {
      logger.error("BASE_RPC_URL not configured");
      return {
        text: "Health factor data unavailable - RPC URL not configured",
        data: { error: "RPC URL required" },
      };
    }

    if (!walletAddress) {
      logger.debug(
        "healthFactorProvider: No wallet address configured, returning neutral context",
      );
      return {
        text: "Health factor data available when wallet address is provided",
        data: { provider: "healthFactorProvider", status: "neutral" },
      };
    }

    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });

      // Get user account data from Aave Pool
      const poolAddress = AaveV3Base.POOL;
      const userData = await publicClient.readContract({
        address: poolAddress as `0x${string}`,
        abi: [
          {
            inputs: [
              { internalType: "address", name: "user", type: "address" },
            ],
            name: "getUserAccountData",
            outputs: [
              {
                internalType: "uint256",
                name: "totalCollateralETH",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalDebtETH",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "availableBorrowsETH",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "currentLiquidationThreshold",
                type: "uint256",
              },
              { internalType: "uint256", name: "ltv", type: "uint256" },
              {
                internalType: "uint256",
                name: "healthFactor",
                type: "uint256",
              },
            ],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "getUserAccountData",
        args: [walletAddress as `0x${string}`],
      });

      const [
        totalCollateralETH,
        totalDebtETH,
        availableBorrowsETH,
        currentLiquidationThreshold,
        ltv,
        healthFactor,
      ] = userData as readonly [bigint, bigint, bigint, bigint, bigint, bigint];

      // Convert to BigNumber for calculations
      const healthFactorBN = new BigNumber(healthFactor.toString()).dividedBy(
        1e18,
      );
      const totalCollateralBN = new BigNumber(
        totalCollateralETH.toString(),
      ).dividedBy(1e18);
      const totalDebtBN = new BigNumber(totalDebtETH.toString()).dividedBy(
        1e18,
      );

      if (totalDebtBN.eq(0)) {
        return {
          text: "No debt position found - health factor analysis not applicable",
          data: {
            address: walletAddress,
            healthFactor: null,
            status: "no_debt",
            totalCollateral: totalCollateralBN.toNumber(),
            totalDebt: 0,
          },
          values: {
            healthFactor: null,
            totalCollateral: totalCollateralBN.toNumber(),
            totalDebt: 0,
          },
        };
      }

      // Analyze health factor
      const healthFactorFormatted = healthFactorBN.isFinite()
        ? healthFactorBN.toFixed(2)
        : "∞";

      const analysis = analyzeHealthFactor(healthFactorBN);
      const recommendations = getRecommendations(healthFactorBN);

      // Calculate LTV
      const ltvBN = new BigNumber(ltv.toString()).dividedBy(10000);
      const currentLTV = totalCollateralBN.gt(0)
        ? totalDebtBN.dividedBy(totalCollateralBN).times(100)
        : new BigNumber(0);

      // Calculate liquidation risk
      let liquidationInfo = "";
      if (healthFactorBN.lt(1.5) && healthFactorBN.isFinite()) {
        const liquidationThresholdBN = new BigNumber(
          currentLiquidationThreshold.toString(),
        ).dividedBy(10000);
        const collateralDropToLiquidation = totalCollateralBN
          .times(healthFactorBN.minus(1).dividedBy(healthFactorBN))
          .times(100);

        liquidationInfo = `
Liquidation Risk Analysis:
- Collateral can drop ${collateralDropToLiquidation.toFixed(1)}% before liquidation
- Current liquidation threshold: ${liquidationThresholdBN.times(100).toFixed(1)}%`;
      }

      const summary = `Health Factor Analysis:

${analysis.emoji} Health Factor: ${healthFactorFormatted}
Status: ${analysis.status}
Risk Level: ${analysis.riskLevel}

Safety Metrics:
- Current LTV: ${currentLTV.toFixed(1)}% / Max LTV: ${ltvBN.times(100).toFixed(1)}%
- Total Collateral: ${totalCollateralBN.toFixed(4)} ETH
- Total Debt: ${totalDebtBN.toFixed(4)} ETH
${liquidationInfo}

Recommendations:
${recommendations.map((r) => `- ${r}`).join("\n")}

Remember: Health Factor > 1.0 prevents liquidation. Aim for > 1.5 for safety.`;

      return {
        text: summary,
        data: {
          address: walletAddress,
          healthFactor: healthFactorBN.toNumber(),
          status: analysis.status.toLowerCase().replace(" ", "_"),
          riskLevel: analysis.riskLevel,
          totalCollateral: totalCollateralBN.toNumber(),
          totalDebt: totalDebtBN.toNumber(),
          currentLTV: currentLTV.toNumber(),
          maxLTV: ltvBN.times(100).toNumber(),
          recommendations,
          liquidationThreshold: new BigNumber(
            currentLiquidationThreshold.toString(),
          )
            .dividedBy(10000)
            .times(100)
            .toNumber(),
        },
        values: {
          healthFactor: healthFactorBN.toNumber(),
          totalCollateral: totalCollateralBN.toNumber(),
          totalDebt: totalDebtBN.toNumber(),
          currentLTV: currentLTV.toNumber(),
          riskScore: calculateRiskScore(healthFactorBN),
        },
      };
    } catch (error) {
      logger.error("healthFactorProvider: Error fetching health factor data:", {
        error: error instanceof Error ? error.message : String(error),
        address: walletAddress,
        rpcUrl,
      });
      return {
        text: "Health factor data temporarily unavailable",
        data: {
          provider: "healthFactorProvider",
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          address: walletAddress,
        },
      };
    }
  },
};

function analyzeHealthFactor(healthFactor: BigNumber): {
  status: string;
  riskLevel: string;
  emoji: string;
} {
  if (!healthFactor.isFinite()) {
    return {
      status: "No Debt Position",
      riskLevel: "No Risk",
      emoji: "🟢",
    };
  }

  if (healthFactor.lt(1)) {
    return {
      status: "LIQUIDATABLE",
      riskLevel: "EXTREME - Liquidation Active",
      emoji: "🔴🚨",
    };
  } else if (healthFactor.lt(1.1)) {
    return {
      status: "CRITICAL",
      riskLevel: "Very High - Immediate Action Required",
      emoji: "🔴",
    };
  } else if (healthFactor.lt(1.5)) {
    return {
      status: "RISKY",
      riskLevel: "High - Monitor Closely",
      emoji: "🟡",
    };
  } else if (healthFactor.lt(2)) {
    return {
      status: "MODERATE",
      riskLevel: "Medium - Acceptable Risk",
      emoji: "🟢",
    };
  } else if (healthFactor.lt(3)) {
    return {
      status: "SAFE",
      riskLevel: "Low",
      emoji: "🟢",
    };
  } else {
    return {
      status: "VERY SAFE",
      riskLevel: "Very Low",
      emoji: "🟢",
    };
  }
}

function getRecommendations(healthFactor: BigNumber): string[] {
  const recommendations: string[] = [];

  if (!healthFactor.isFinite()) {
    recommendations.push(
      "Consider borrowing against your collateral to put it to work",
    );
    recommendations.push("Your position is risk-free with no debt");
    return recommendations;
  }

  if (healthFactor.lt(1.1)) {
    recommendations.push(
      "🚨 URGENT: Add collateral immediately to avoid liquidation",
    );
    recommendations.push("🚨 URGENT: Repay debt to improve health factor");
    recommendations.push(
      "Consider using a flash loan to restructure your position",
    );
  } else if (healthFactor.lt(1.5)) {
    recommendations.push("Add more collateral to create a safety buffer");
    recommendations.push(
      "Consider repaying some debt to improve your position",
    );
    recommendations.push("Monitor market prices closely for your assets");
    recommendations.push("Set up alerts for health factor changes");
  } else if (healthFactor.lt(2)) {
    recommendations.push(
      "Your position is relatively safe but monitor regularly",
    );
    recommendations.push("Consider your risk tolerance before borrowing more");
  } else {
    recommendations.push("Your position is very safe");
    recommendations.push("You have room to borrow more if needed");
    recommendations.push(
      "Consider enabling eMode for better capital efficiency",
    );
  }

  return recommendations;
}

function calculateRiskScore(healthFactor: BigNumber): number {
  if (!healthFactor.isFinite()) {
    return 0; // No risk
  }

  if (healthFactor.lt(1)) {
    return 100; // Maximum risk
  } else if (healthFactor.lt(1.1)) {
    return 90;
  } else if (healthFactor.lt(1.5)) {
    return 70;
  } else if (healthFactor.lt(2)) {
    return 40;
  } else if (healthFactor.lt(3)) {
    return 20;
  } else {
    return 10; // Very low risk
  }
}
