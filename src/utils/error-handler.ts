import { BigNumber } from 'bignumber.js';
import {
  AaveError,
  AaveErrorCode,
  InterestRateMode,
  SupplyParams,
  WithdrawParams,
  BorrowParams,
  RepayParams,
} from '../types/index.js';
// Simple error handler - createError function for basic error creation
function createError(
  message: string, 
  code: AaveErrorCode = AaveErrorCode.UNKNOWN,
  cause?: Error,
  context?: Record<string, any>
): AaveError {
  return new AaveError(message, code, cause, context);
}

// Simple rate mode name function
function getRateModeName(mode: InterestRateMode): string {
  switch (mode) {
    case InterestRateMode.STABLE:
      return 'Stable';
    case InterestRateMode.VARIABLE:
      return 'Variable';
    default:
      return 'Unknown';
  }
}

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * Error context for structured error reporting
 */
export interface ErrorContext {
  /** Operation being performed */
  operation?: 'supply' | 'withdraw' | 'borrow' | 'repay' | 'market_data';
  /** Transaction hash if available */
  transactionHash?: string;
  /** Gas used or estimated */
  gasUsed?: string;
  /** Asset involved in the operation */
  asset?: string;
  /** Amount involved in the operation */
  amount?: string;
  /** User address */
  user?: string;
  /** Interest rate mode for borrow/repay operations */
  interestRateMode?: InterestRateMode;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Error recovery suggestion
 */
export interface ErrorRecovery {
  /** Action user can take to resolve the error */
  action: string;
  /** Additional context or instructions */
  details?: string;
  /** Whether the action requires user intervention */
  requiresUserAction: boolean;
}

/**
 * Processed error result with user-friendly information
 */
export interface ProcessedError {
  /** Original error */
  originalError: Error;
  /** Mapped Aave error */
  aaveError: AaveError;
  /** User-friendly message */
  userMessage: string;
  /** Technical message for logging */
  technicalMessage: string;
  /** Recovery suggestions */
  recovery?: ErrorRecovery;
  /** Error context */
  context: ErrorContext;
  /** Whether error is retryable */
  isRetryable: boolean;
  /** Log level for this error */
  logLevel: 'error' | 'warn' | 'info';
}

// =============================================================================
// AAVE V3 CONTRACT ERROR CODES
// =============================================================================

/**
 * Aave V3 protocol error codes and their descriptions
 * These are the actual error codes from Aave V3 contracts
 */
export const AAVE_PROTOCOL_ERRORS: Record<string, { code: AaveErrorCode; description: string; userMessage: string; recovery?: ErrorRecovery }> = {
  // Pool errors (P prefix)
  'P_INVALID_FLASHLOAN_EXECUTOR_RETURN': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    description: 'Invalid flashloan executor return',
    userMessage: 'Flash loan execution failed. Please check your flash loan logic.',
    recovery: {
      action: 'Review and fix your flash loan implementation',
      requiresUserAction: true,
    },
  },
  'P_VT_TRANSFER_NOT_SUPPORTED': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    description: 'Variable debt token transfer not supported',
    userMessage: 'Cannot transfer debt tokens. Use repay and borrow operations instead.',
    recovery: {
      action: 'Use repay() and borrow() functions for debt management',
      requiresUserAction: true,
    },
  },
  'P_ASSET_NOT_LISTED': {
    code: AaveErrorCode.ASSET_NOT_SUPPORTED,
    description: 'Asset is not listed in the pool',
    userMessage: 'This asset is not supported by Aave protocol.',
    recovery: {
      action: 'Use a supported asset from the Aave markets',
      requiresUserAction: true,
    },
  },
  'P_INVALID_AMOUNT': {
    code: AaveErrorCode.INVALID_PARAMETERS,
    description: 'Invalid amount provided',
    userMessage: 'The amount provided is invalid. Please check the amount and try again.',
    recovery: {
      action: 'Ensure amount is positive and within acceptable range',
      requiresUserAction: true,
    },
  },

  // Reserve errors (R prefix)
  'R_LIQUIDITY_INDEX_OVERFLOW': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    description: 'Liquidity index overflow',
    userMessage: 'Internal calculation error. Please try again later.',
    recovery: {
      action: 'Wait and retry the operation',
      requiresUserAction: false,
    },
  },
  'R_VARIABLE_BORROW_INDEX_OVERFLOW': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    description: 'Variable borrow index overflow',
    userMessage: 'Internal calculation error. Please try again later.',
    recovery: {
      action: 'Wait and retry the operation',
      requiresUserAction: false,
    },
  },
  'R_LIQUIDITY_RATE_OVERFLOW': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    description: 'Liquidity rate overflow',
    userMessage: 'Interest rate calculation error. Please try again later.',
    recovery: {
      action: 'Wait and retry the operation',
      requiresUserAction: false,
    },
  },
  'R_VARIABLE_BORROW_RATE_OVERFLOW': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    description: 'Variable borrow rate overflow',
    userMessage: 'Interest rate calculation error. Please try again later.',
    recovery: {
      action: 'Wait and retry the operation',
      requiresUserAction: false,
    },
  },

  // Validation errors (V prefix)
  'V_INCONSISTENT_FLASHLOAN_PARAMS': {
    code: AaveErrorCode.INVALID_PARAMETERS,
    description: 'Inconsistent flashloan parameters',
    userMessage: 'Flash loan parameters are inconsistent.',
    recovery: {
      action: 'Check flash loan asset and amount parameters',
      requiresUserAction: true,
    },
  },
  'V_COLLATERAL_BALANCE_IS_ZERO': {
    code: AaveErrorCode.INSUFFICIENT_COLLATERAL,
    description: 'Collateral balance is zero',
    userMessage: 'You have no collateral deposited. Please supply collateral first.',
    recovery: {
      action: 'Supply assets as collateral before borrowing',
      requiresUserAction: true,
    },
  },
  'V_HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD': {
    code: AaveErrorCode.HEALTH_FACTOR_TOO_LOW,
    description: 'Health factor below liquidation threshold',
    userMessage: 'This operation would put your position at risk of liquidation.',
    recovery: {
      action: 'Supply more collateral or reduce borrowing amount',
      requiresUserAction: true,
    },
  },
  'V_COLLATERAL_CANNOT_COVER_NEW_BORROW': {
    code: AaveErrorCode.INSUFFICIENT_COLLATERAL,
    description: 'Insufficient collateral for new borrow',
    userMessage: 'You don\'t have enough collateral to borrow this amount.',
    recovery: {
      action: 'Supply more collateral or reduce borrow amount',
      requiresUserAction: true,
    },
  },
  'V_STABLE_BORROWING_NOT_ENABLED': {
    code: AaveErrorCode.STABLE_BORROWING_NOT_ENABLED,
    description: 'Stable borrowing not enabled for asset',
    userMessage: 'Stable rate borrowing is not available for this asset.',
    recovery: {
      action: 'Use variable rate borrowing instead',
      requiresUserAction: true,
    },
  },
  'V_NO_DEBT_OF_SELECTED_TYPE': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    description: 'No debt of selected type',
    userMessage: 'You don\'t have debt in the selected interest rate mode.',
    recovery: {
      action: 'Check your debt positions and select the correct rate mode',
      requiresUserAction: true,
    },
  },
  'V_NO_STABLE_RATE_LOAN_IN_RESERVE': {
    code: AaveErrorCode.STABLE_BORROWING_NOT_ENABLED,
    description: 'No stable rate loan exists',
    userMessage: 'No stable rate loan exists for this asset.',
    recovery: {
      action: 'Use variable rate borrowing',
      requiresUserAction: true,
    },
  },
  'V_NO_VARIABLE_RATE_LOAN_IN_RESERVE': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    description: 'No variable rate loan exists',
    userMessage: 'No variable rate loan exists for this asset.',
    recovery: {
      action: 'Check your borrow positions',
      requiresUserAction: true,
    },
  },
  'V_UNDERLYING_BALANCE_ZERO': {
    code: AaveErrorCode.INSUFFICIENT_BALANCE,
    description: 'Underlying balance is zero',
    userMessage: 'You don\'t have any balance of this asset to supply.',
    recovery: {
      action: 'Acquire the asset first or check your balance',
      requiresUserAction: true,
    },
  },
  'V_INTEREST_RATE_REBALANCE_CONDITIONS_NOT_MET': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    description: 'Interest rate rebalance conditions not met',
    userMessage: 'Cannot rebalance interest rate. Conditions not met.',
    recovery: {
      action: 'Try again later when market conditions change',
      requiresUserAction: false,
    },
  },

  // Asset configuration errors (A prefix)
  'A_INTEREST_RATE_REBALANCE_CONDITIONS_NOT_MET': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    description: 'Rebalance conditions not met',
    userMessage: 'Cannot rebalance stable rate. Market conditions not suitable.',
    recovery: {
      action: 'Try again when utilization rate changes',
      requiresUserAction: false,
    },
  },
  'A_NO_MORE_RESERVES_ALLOWED': {
    code: AaveErrorCode.POOL_PAUSED,
    description: 'No more reserves allowed',
    userMessage: 'Maximum number of assets reached in the pool.',
    recovery: {
      action: 'Contact Aave governance to add more reserves',
      requiresUserAction: true,
    },
  },

  // Supply/Withdraw specific
  'S_NOT_ENOUGH_AVAILABLE_USER_BALANCE': {
    code: AaveErrorCode.INSUFFICIENT_BALANCE,
    description: 'Insufficient user balance',
    userMessage: 'You don\'t have enough balance to complete this operation.',
    recovery: {
      action: 'Check your wallet balance and reduce the amount',
      requiresUserAction: true,
    },
  },
  'W_NO_ATOKEN_BALANCE': {
    code: AaveErrorCode.INSUFFICIENT_BALANCE,
    description: 'No aToken balance to withdraw',
    userMessage: 'You don\'t have any supplied balance to withdraw.',
    recovery: {
      action: 'Check your supplied positions',
      requiresUserAction: true,
    },
  },

  // Borrow/Repay specific
  'B_BORROW_CAP_EXCEEDED': {
    code: AaveErrorCode.AMOUNT_TOO_HIGH,
    description: 'Borrow cap exceeded',
    userMessage: 'Borrowing this amount would exceed the protocol\'s borrow cap.',
    recovery: {
      action: 'Reduce the borrow amount',
      requiresUserAction: true,
    },
  },
  'B_SUPPLY_CAP_EXCEEDED': {
    code: AaveErrorCode.AMOUNT_TOO_HIGH,
    description: 'Supply cap exceeded',
    userMessage: 'Supplying this amount would exceed the protocol\'s supply cap.',
    recovery: {
      action: 'Reduce the supply amount',
      requiresUserAction: true,
    },
  },

  // Reserve status errors
  'RESERVE_INACTIVE': {
    code: AaveErrorCode.RESERVE_INACTIVE,
    description: 'Reserve is inactive',
    userMessage: 'This asset is currently inactive in the Aave protocol.',
    recovery: {
      action: 'Choose an active asset or wait for reactivation',
      requiresUserAction: true,
    },
  },
  'RESERVE_FROZEN': {
    code: AaveErrorCode.RESERVE_FROZEN,
    description: 'Reserve is frozen',
    userMessage: 'This asset is currently frozen. Only repay and withdraw operations are allowed.',
    recovery: {
      action: 'Choose an unfrozen asset or wait for unfreeze',
      requiresUserAction: true,
    },
  },
  'RESERVE_PAUSED': {
    code: AaveErrorCode.POOL_PAUSED,
    description: 'Reserve is paused',
    userMessage: 'Operations on this asset are temporarily paused.',
    recovery: {
      action: 'Wait for the asset to be unpaused',
      requiresUserAction: false,
    },
  },
};

// =============================================================================
// NETWORK AND TRANSACTION ERROR PATTERNS
// =============================================================================

/**
 * Common network error patterns and their mappings
 */
export const NETWORK_ERROR_PATTERNS: Record<string, { code: AaveErrorCode; userMessage: string; isRetryable: boolean }> = {
  // RPC errors
  'network timeout': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Network connection timed out. Please try again.',
    isRetryable: true,
  },
  'connection refused': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Unable to connect to the network. Please check your connection.',
    isRetryable: true,
  },
  'socket hang up': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Network connection interrupted. Please try again.',
    isRetryable: true,
  },
  'request timeout': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Request timed out. Please try again.',
    isRetryable: true,
  },
  'rate limit': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Too many requests. Please wait a moment and try again.',
    isRetryable: true,
  },
  'insufficient funds for gas': {
    code: AaveErrorCode.INSUFFICIENT_BALANCE,
    userMessage: 'Insufficient ETH for gas fees. Please add more ETH to your wallet.',
    isRetryable: false,
  },
  'gas limit exceeded': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Transaction requires too much gas. Try reducing the amount.',
    isRetryable: false,
  },
  'replacement transaction underpriced': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Transaction replacement fee too low. Increase gas price.',
    isRetryable: true,
  },
  'nonce too low': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Transaction nonce is outdated. Please refresh and try again.',
    isRetryable: true,
  },
  'already known': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Transaction already pending. Please wait for confirmation.',
    isRetryable: false,
  },
};

/**
 * Gas estimation error patterns
 */
export const GAS_ERROR_PATTERNS: Record<string, { code: AaveErrorCode; userMessage: string; recovery: ErrorRecovery }> = {
  'execution reverted': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Transaction would fail. Please check your parameters.',
    recovery: {
      action: 'Review transaction parameters and account balances',
      requiresUserAction: true,
    },
  },
  'out of gas': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Transaction ran out of gas. Increase gas limit.',
    recovery: {
      action: 'Increase gas limit or reduce transaction complexity',
      requiresUserAction: true,
    },
  },
  'invalid opcode': {
    code: AaveErrorCode.TRANSACTION_FAILED,
    userMessage: 'Invalid transaction. Please check your parameters.',
    recovery: {
      action: 'Verify all transaction parameters are correct',
      requiresUserAction: true,
    },
  },
};

// =============================================================================
// ERROR MAPPING FUNCTIONS
// =============================================================================

/**
 * Maps Aave protocol errors to user-friendly messages
 * @param error - Original error
 * @param context - Error context
 * @returns Mapped AaveError
 */
export function mapAaveError(error: Error, context: ErrorContext = {}): AaveError {
  const errorMessage = error.message.toLowerCase();
  
  // Check for specific Aave protocol errors first
  for (const [pattern, errorInfo] of Object.entries(AAVE_PROTOCOL_ERRORS)) {
    if (errorMessage.includes(pattern.toLowerCase()) || errorMessage.includes(`execution reverted: ${pattern.toLowerCase()}`)) {
      return new AaveError(
        errorInfo.userMessage,
        errorInfo.code,
        error,
        {
          ...context,
          protocolError: pattern,
          recovery: errorInfo.recovery,
        }
      );
    }
  }

  // Check for network errors
  for (const [pattern, errorInfo] of Object.entries(NETWORK_ERROR_PATTERNS)) {
    if (errorMessage.includes(pattern)) {
      return new AaveError(
        errorInfo.userMessage,
        errorInfo.code,
        error,
        {
          ...context,
          networkError: pattern,
          isRetryable: errorInfo.isRetryable,
        }
      );
    }
  }

  // Check for gas-related errors
  for (const [pattern, errorInfo] of Object.entries(GAS_ERROR_PATTERNS)) {
    if (errorMessage.includes(pattern)) {
      return new AaveError(
        errorInfo.userMessage,
        errorInfo.code,
        error,
        {
          ...context,
          gasError: pattern,
          recovery: errorInfo.recovery,
        }
      );
    }
  }

  // Handle common error patterns with heuristics
  if (errorMessage.includes('insufficient')) {
    if (errorMessage.includes('balance') || errorMessage.includes('funds')) {
      return new AaveError(
        'Insufficient balance to complete this operation.',
        AaveErrorCode.INSUFFICIENT_BALANCE,
        error,
        context
      );
    }
    if (errorMessage.includes('collateral')) {
      return new AaveError(
        'Insufficient collateral for this operation.',
        AaveErrorCode.INSUFFICIENT_COLLATERAL,
        error,
        context
      );
    }
  }

  if (errorMessage.includes('health factor')) {
    return new AaveError(
      'This operation would put your position at risk of liquidation.',
      AaveErrorCode.HEALTH_FACTOR_TOO_LOW,
      error,
      context
    );
  }

  if (errorMessage.includes('not enabled') && errorMessage.includes('stable')) {
    return new AaveError(
      'Stable rate borrowing is not enabled for this asset.',
      AaveErrorCode.STABLE_BORROWING_NOT_ENABLED,
      error,
      context
    );
  }

  if (errorMessage.includes('paused')) {
    return new AaveError(
      'The pool or asset is currently paused.',
      AaveErrorCode.POOL_PAUSED,
      error,
      context
    );
  }

  if (errorMessage.includes('frozen')) {
    return new AaveError(
      'The asset is currently frozen.',
      AaveErrorCode.RESERVE_FROZEN,
      error,
      context
    );
  }

  // Default to unknown error
  return new AaveError(
    'An unexpected error occurred. Please try again.',
    AaveErrorCode.UNKNOWN,
    error,
    context
  );
}

/**
 * Handles contract-specific errors with enhanced context
 * @param error - Contract error
 * @param contractName - Name of the contract
 * @param methodName - Name of the method that failed
 * @param context - Additional context
 * @returns ProcessedError
 */
export function handleContractError(
  error: Error,
  contractName: string,
  methodName: string,
  context: ErrorContext = {}
): ProcessedError {
  const enhancedContext = {
    ...context,
    contractName,
    methodName,
  };

  const aaveError = mapAaveError(error, enhancedContext);
  
  return {
    originalError: error,
    aaveError,
    userMessage: aaveError.message,
    technicalMessage: `Contract error in ${contractName}.${methodName}: ${error.message}`,
    context: enhancedContext,
    isRetryable: determineRetryability(aaveError),
    logLevel: determineLogLevel(aaveError),
    recovery: aaveError.context?.recovery,
  };
}

/**
 * Handles transaction-related errors with gas and network context
 * @param error - Transaction error
 * @param transactionHash - Transaction hash if available
 * @param context - Error context
 * @returns ProcessedError
 */
export function handleTransactionError(
  error: Error,
  transactionHash?: string,
  context: ErrorContext = {}
): ProcessedError {
  const enhancedContext = {
    ...context,
    transactionHash,
  };

  const aaveError = mapAaveError(error, enhancedContext);
  
  let userMessage = aaveError.message;
  let technicalMessage = error.message;
  
  // Enhance messages for transaction-specific context
  if (transactionHash) {
    technicalMessage = `Transaction ${transactionHash} failed: ${error.message}`;
  }

  // Add specific guidance for common transaction errors
  if (aaveError.code === AaveErrorCode.INSUFFICIENT_BALANCE && context.operation) {
    const operation = context.operation;
    const asset = context.asset || 'the asset';
    
    switch (operation) {
      case 'supply':
        userMessage = `You don't have enough ${asset} to supply this amount.`;
        break;
      case 'borrow':
        userMessage = `You don't have enough collateral to borrow this amount of ${asset}.`;
        break;
      case 'repay':
        userMessage = `You don't have enough ${asset} to repay this amount.`;
        break;
      case 'withdraw':
        userMessage = `You don't have enough supplied ${asset} to withdraw this amount.`;
        break;
    }
  }

  return {
    originalError: error,
    aaveError,
    userMessage,
    technicalMessage,
    context: enhancedContext,
    isRetryable: determineRetryability(aaveError),
    logLevel: determineLogLevel(aaveError),
    recovery: generateRecoverySuggestion(aaveError, context),
  };
}

/**
 * Handles BigNumber and ethers.js specific errors
 * @param error - Error from BigNumber or ethers operations
 * @param context - Error context
 * @returns ProcessedError
 */
export function handleBigNumberError(error: Error, context: ErrorContext = {}): ProcessedError {
  const errorMessage = error.message.toLowerCase();
  let aaveError: AaveError;
  let userMessage: string;

  if (errorMessage.includes('invalid number') || errorMessage.includes('not a number')) {
    aaveError = new AaveError(
      'Invalid number format provided.',
      AaveErrorCode.INVALID_PARAMETERS,
      error,
      context
    );
    userMessage = 'Please enter a valid number.';
  } else if (errorMessage.includes('overflow') || errorMessage.includes('too large')) {
    aaveError = new AaveError(
      'Number is too large to process.',
      AaveErrorCode.AMOUNT_TOO_HIGH,
      error,
      context
    );
    userMessage = 'The amount is too large. Please use a smaller number.';
  } else if (errorMessage.includes('underflow') || errorMessage.includes('negative')) {
    aaveError = new AaveError(
      'Negative numbers are not allowed.',
      AaveErrorCode.INVALID_PARAMETERS,
      error,
      context
    );
    userMessage = 'Please enter a positive number.';
  } else if (errorMessage.includes('division by zero')) {
    aaveError = new AaveError(
      'Division by zero error in calculation.',
      AaveErrorCode.TRANSACTION_FAILED,
      error,
      context
    );
    userMessage = 'Internal calculation error. Please try again.';
  } else {
    aaveError = new AaveError(
      'Number processing error.',
      AaveErrorCode.INVALID_PARAMETERS,
      error,
      context
    );
    userMessage = 'There was an error processing the numbers. Please check your input.';
  }

  return {
    originalError: error,
    aaveError,
    userMessage,
    technicalMessage: `BigNumber/ethers error: ${error.message}`,
    context,
    isRetryable: false,
    logLevel: 'warn',
    recovery: {
      action: 'Check input values and try again',
      requiresUserAction: true,
    },
  };
}

// =============================================================================
// OPERATION-SPECIFIC ERROR HANDLERS
// =============================================================================

/**
 * Creates error context for supply operations
 * @param params - Supply parameters
 * @returns Error context
 */
export function createSupplyErrorContext(params: Partial<SupplyParams>): ErrorContext {
  return {
    operation: 'supply',
    asset: params.asset,
    amount: params.amount?.toString(),
    user: params.user,
  };
}

/**
 * Creates error context for withdraw operations
 * @param params - Withdraw parameters
 * @returns Error context
 */
export function createWithdrawErrorContext(params: Partial<WithdrawParams>): ErrorContext {
  return {
    operation: 'withdraw',
    asset: params.asset,
    amount: params.amount?.toString(),
    user: params.user,
  };
}

/**
 * Creates error context for borrow operations
 * @param params - Borrow parameters
 * @returns Error context
 */
export function createBorrowErrorContext(params: Partial<BorrowParams>): ErrorContext {
  return {
    operation: 'borrow',
    asset: params.asset,
    amount: params.amount?.toString(),
    user: params.user,
    interestRateMode: params.interestRateMode,
  };
}

/**
 * Creates error context for repay operations
 * @param params - Repay parameters
 * @returns Error context
 */
export function createRepayErrorContext(params: Partial<RepayParams>): ErrorContext {
  return {
    operation: 'repay',
    asset: params.asset,
    amount: params.amount?.toString(),
    user: params.user,
    interestRateMode: params.interestRateMode,
  };
}

// =============================================================================
// ERROR ANALYSIS UTILITIES
// =============================================================================

/**
 * Determines if an error is retryable
 * @param error - AaveError to analyze
 * @returns true if retryable
 */
export function determineRetryability(error: AaveError): boolean {
  // Network and temporary errors are generally retryable
  const retryableCodes = [
    AaveErrorCode.UNKNOWN,
    AaveErrorCode.TRANSACTION_FAILED,
  ];

  if (retryableCodes.includes(error.code)) {
    // Check context for specific retryability hints
    if (error.context?.isRetryable !== undefined) {
      return error.context.isRetryable as boolean;
    }
    return true;
  }

  // Validation and configuration errors are not retryable without changes
  const nonRetryableCodes = [
    AaveErrorCode.INSUFFICIENT_BALANCE,
    AaveErrorCode.INSUFFICIENT_COLLATERAL,
    AaveErrorCode.ASSET_NOT_SUPPORTED,
    AaveErrorCode.INVALID_PARAMETERS,
    AaveErrorCode.HEALTH_FACTOR_TOO_LOW,
    AaveErrorCode.STABLE_BORROWING_NOT_ENABLED,
    AaveErrorCode.AMOUNT_TOO_HIGH,
  ];

  return !nonRetryableCodes.includes(error.code);
}

/**
 * Determines appropriate log level for an error
 * @param error - AaveError to analyze
 * @returns Log level
 */
export function determineLogLevel(error: AaveError): 'error' | 'warn' | 'info' {
  switch (error.code) {
    case AaveErrorCode.INVALID_PARAMETERS:
    case AaveErrorCode.ASSET_NOT_SUPPORTED:
      return 'warn';
    
    case AaveErrorCode.INSUFFICIENT_BALANCE:
    case AaveErrorCode.INSUFFICIENT_COLLATERAL:
    case AaveErrorCode.HEALTH_FACTOR_TOO_LOW:
      return 'info';
    
    default:
      return 'error';
  }
}

/**
 * Generates contextual recovery suggestions
 * @param error - AaveError
 * @param context - Error context
 * @returns Recovery suggestion
 */
export function generateRecoverySuggestion(error: AaveError, context: ErrorContext): ErrorRecovery | undefined {
  // Use predefined recovery if available
  if (error.context?.recovery) {
    return error.context.recovery as ErrorRecovery;
  }

  const { operation, asset, interestRateMode } = context;

  switch (error.code) {
    case AaveErrorCode.INSUFFICIENT_BALANCE:
      if (operation === 'supply' || operation === 'repay') {
        return {
          action: `Acquire more ${asset || 'tokens'} or reduce the amount`,
          requiresUserAction: true,
        };
      }
      return {
        action: 'Check your wallet balance and try a smaller amount',
        requiresUserAction: true,
      };

    case AaveErrorCode.INSUFFICIENT_COLLATERAL:
      return {
        action: 'Supply more collateral or reduce the borrow amount',
        details: 'Your collateral is not sufficient for this borrow amount',
        requiresUserAction: true,
      };

    case AaveErrorCode.HEALTH_FACTOR_TOO_LOW:
      return {
        action: 'Supply additional collateral or repay some debt first',
        details: 'This operation would put your position at risk of liquidation',
        requiresUserAction: true,
      };

    case AaveErrorCode.STABLE_BORROWING_NOT_ENABLED:
      return {
        action: 'Use variable rate borrowing instead',
        details: `Stable rate is not available for ${asset || 'this asset'}`,
        requiresUserAction: true,
      };

    case AaveErrorCode.ASSET_NOT_SUPPORTED:
      return {
        action: 'Choose a supported asset from the Aave markets',
        requiresUserAction: true,
      };

    case AaveErrorCode.RESERVE_FROZEN:
      return {
        action: 'Only withdraw and repay operations are allowed for frozen assets',
        requiresUserAction: true,
      };

    case AaveErrorCode.RESERVE_INACTIVE:
      return {
        action: 'Choose an active asset or wait for this asset to be reactivated',
        requiresUserAction: true,
      };

    case AaveErrorCode.POOL_PAUSED:
      return {
        action: 'Wait for the pool to be unpaused and try again',
        requiresUserAction: false,
      };

    default:
      return {
        action: 'Review the error details and try again',
        requiresUserAction: true,
      };
  }
}

// =============================================================================
// LOGGING INTEGRATION
// =============================================================================

/**
 * Formats error for structured logging
 * @param processedError - Processed error information
 * @returns Log object
 */
export function formatErrorForLogging(processedError: ProcessedError): Record<string, any> {
  return {
    timestamp: new Date().toISOString(),
    level: processedError.logLevel,
    error: {
      type: processedError.aaveError.name,
      code: processedError.aaveError.code,
      message: processedError.technicalMessage,
      userMessage: processedError.userMessage,
      stack: processedError.originalError.stack,
    },
    context: processedError.context,
    recovery: processedError.recovery,
    isRetryable: processedError.isRetryable,
  };
}

/**
 * Logs error using ElizaOS logging patterns
 * @param processedError - Processed error to log
 * @param logger - Logger instance (optional)
 */
export function logError(processedError: ProcessedError, logger?: any): void {
  const logData = formatErrorForLogging(processedError);
  
  if (logger) {
    logger[processedError.logLevel]('Aave operation failed', logData);
  } else {
    // Fallback to console logging with structured format
    const logPrefix = `[${processedError.logLevel.toUpperCase()}] Aave Error:`;
    console[processedError.logLevel === 'error' ? 'error' : 'log'](
      logPrefix,
      JSON.stringify(logData, null, 2)
    );
  }
}

// =============================================================================
// HIGH-LEVEL ERROR PROCESSING
// =============================================================================

/**
 * Processes any error into a user-friendly format with full context
 * @param error - Original error
 * @param operation - Operation that failed
 * @param params - Operation parameters
 * @param transactionHash - Transaction hash if available
 * @returns Processed error with user-friendly information
 */
export function processError(
  error: Error,
  operation: 'supply' | 'withdraw' | 'borrow' | 'repay' | 'market_data',
  params?: any,
  transactionHash?: string
): ProcessedError {
  let context: ErrorContext;

  // Create context based on operation type
  switch (operation) {
    case 'supply':
      context = createSupplyErrorContext(params || {});
      break;
    case 'withdraw':
      context = createWithdrawErrorContext(params || {});
      break;
    case 'borrow':
      context = createBorrowErrorContext(params || {});
      break;
    case 'repay':
      context = createRepayErrorContext(params || {});
      break;
    default:
      context = { operation };
  }

  if (transactionHash) {
    context.transactionHash = transactionHash;
  }

  // Handle specific error types
  if (error.message.includes('BigNumber') || error.message.includes('invalid number')) {
    return handleBigNumberError(error, context);
  }

  if (transactionHash || error.message.includes('transaction')) {
    return handleTransactionError(error, transactionHash, context);
  }

  // Default contract error handling
  return handleContractError(error, 'AavePool', operation, context);
}

/**
 * Creates user-friendly error messages for specific operations
 * @param error - Processed error
 * @returns Enhanced user message
 */
export function createUserFriendlyMessage(error: ProcessedError): string {
  const { aaveError, context } = error;
  const { operation, asset, amount, interestRateMode } = context;

  let baseMessage = aaveError.message;
  let operationContext = '';

  // Add operation-specific context
  switch (operation) {
    case 'supply':
      operationContext = `while supplying ${amount ? `${amount} ` : ''}${asset || 'tokens'}`;
      break;
    case 'withdraw':
      operationContext = `while withdrawing ${amount ? `${amount} ` : ''}${asset || 'tokens'}`;
      break;
    case 'borrow':
      const rateType = interestRateMode ? getRateModeName(interestRateMode).toLowerCase() : '';
      operationContext = `while borrowing ${amount ? `${amount} ` : ''}${asset || 'tokens'}${rateType ? ` at ${rateType} rate` : ''}`;
      break;
    case 'repay':
      const repayRateType = interestRateMode ? getRateModeName(interestRateMode).toLowerCase() : '';
      operationContext = `while repaying ${amount ? `${amount} ` : ''}${asset || 'debt'}${repayRateType ? ` (${repayRateType} rate)` : ''}`;
      break;
  }

  if (operationContext) {
    baseMessage = `${baseMessage} This error occurred ${operationContext}.`;
  }

  // Add recovery suggestion if available
  if (error.recovery) {
    baseMessage += ` ${error.recovery.action}.`;
    if (error.recovery.details) {
      baseMessage += ` ${error.recovery.details}.`;
    }
  }

  return baseMessage;
}

/**
 * Main error handler function - processes and logs errors
 * @param error - Original error
 * @param operation - Operation type
 * @param params - Operation parameters
 * @param transactionHash - Transaction hash if available
 * @param logger - Logger instance
 * @returns Processed error ready for user consumption
 */
export function handleError(
  error: Error,
  operation: 'supply' | 'withdraw' | 'borrow' | 'repay' | 'market_data',
  params?: any,
  transactionHash?: string,
  logger?: any
): ProcessedError {
  const processedError = processError(error, operation, params, transactionHash);
  
  // Enhance user message
  processedError.userMessage = createUserFriendlyMessage(processedError);
  
  // Log the error
  logError(processedError, logger);
  
  return processedError;
}