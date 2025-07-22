/**
 * Simple validation utilities for tests and basic operations
 * These are simpler versions of the complex Zod-based validations
 */

import BigNumber from 'bignumber.js';
import { InterestRateMode } from '../types/index.js';

/**
 * Check if amount represents maximum (all, max, everything, etc.)
 */
export function isMaxAmount(amount: string | BigNumber): boolean {
  if (typeof amount === 'string') {
    const normalized = amount.toLowerCase().trim();
    return ['max', 'maximum', 'all', 'everything'].includes(normalized);
  }
  
  // For BigNumber, check if it's NaN (which would happen with string 'max')
  if (amount instanceof BigNumber) {
    return false; // BigNumber instances are never considered "max"
  }
  
  return false;
}

/**
 * Simple amount parsing
 */
export function parseAmount(amount: string | number): BigNumber {
  if (amount === null || amount === undefined) {
    throw new Error('Amount cannot be null or undefined');
  }
  
  if (typeof amount === 'string') {
    const trimmed = amount.trim();
    if (!trimmed) {
      throw new Error('Amount cannot be empty');
    }
    
    // Reject obvious invalid values
    if (trimmed === 'NaN' || trimmed === 'Infinity' || trimmed === '-Infinity') {
      throw new Error('Invalid amount format');
    }
    
    const num = new BigNumber(trimmed);
    if (num.isNaN() || !num.isFinite()) {
      throw new Error('Invalid amount format');
    }
    if (num.isLessThanOrEqualTo(0)) {
      throw new Error('Amount must be greater than 0');
    }
    return num;
  }
  
  if (typeof amount === 'number') {
    if (!isFinite(amount) || isNaN(amount)) {
      throw new Error('Amount must be a finite number');
    }
  }
  
  const num = new BigNumber(amount);
  if (num.isNaN() || !num.isFinite() || num.isLessThanOrEqualTo(0)) {
    throw new Error('Amount must be a positive finite number');
  }
  return num;
}

/**
 * Simple address validation
 */
export function validateAddress(address: string): string {
  if (!address || typeof address !== 'string') {
    throw new Error('Address is required');
  }
  
  const trimmed = address.trim();
  if (!trimmed.match(/^0x[a-fA-F0-9]{40}$/i)) { // Case-insensitive
    throw new Error('Invalid address: must be a valid Ethereum address');
  }
  
  return trimmed;
}

/**
 * Simple supply params validation
 */
export function validateSupplyParams(params: any) {
  if (!params.user || !params.asset || !params.amount) {
    throw new Error('Missing required parameters: user, asset, amount');
  }
  
  return {
    user: validateAddress(params.user),
    asset: params.asset.trim(),
    amount: isMaxAmount(params.amount) ? params.amount : parseAmount(params.amount).toString(),
  };
}

/**
 * Simple withdraw params validation
 */
export function validateWithdrawParams(params: any) {
  if (!params.user || !params.asset || !params.amount) {
    throw new Error('Missing required parameters: user, asset, amount');
  }
  
  return {
    user: validateAddress(params.user),
    asset: params.asset.trim(),
    amount: isMaxAmount(params.amount) ? params.amount : parseAmount(params.amount).toString(),
  };
}

/**
 * Simple borrow params validation
 */
export function validateBorrowParams(params: any) {
  if (!params.user || !params.asset || !params.amount) {
    throw new Error('Missing required parameters: user, asset, amount');
  }
  
  // Validate interest rate mode if provided
  if (params.interestRateMode !== undefined) {
    if (params.interestRateMode !== InterestRateMode.STABLE && 
        params.interestRateMode !== InterestRateMode.VARIABLE) {
      throw new Error('Invalid interest rate mode: must be 1 (stable) or 2 (variable)');
    }
  }
  
  return {
    user: validateAddress(params.user),
    asset: params.asset.trim(),
    amount: parseAmount(params.amount).toString(),
    interestRateMode: params.interestRateMode || InterestRateMode.VARIABLE,
  };
}

/**
 * Simple repay params validation
 */
export function validateRepayParams(params: any) {
  if (!params.user || !params.asset || !params.amount) {
    throw new Error('Missing required parameters: user, asset, amount');
  }
  
  return {
    user: validateAddress(params.user),
    asset: params.asset.trim(),
    amount: isMaxAmount(params.amount) ? params.amount : parseAmount(params.amount).toString(),
    interestRateMode: params.interestRateMode || InterestRateMode.VARIABLE,
  };
}

/**
 * Format amount for display (simple version)
 */
export function formatAmount(amount: BigNumber): string {
  return amount.toFixed();
}