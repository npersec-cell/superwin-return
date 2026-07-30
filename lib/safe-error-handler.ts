// Safe error messages mapping - prevents technical information leakage
// Date: 2026-06-08

import { NextResponse } from "next/server";

export type AppErrorType = 
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMIT'
  | 'INSUFFICIENT_BALANCE'
  | 'PREDICTION_CLOSED'
  | 'ALREADY_RESOLVED'
  | 'INVALID_INPUT'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  type: AppErrorType;
  statusCode: number;
  userMessage: string;

  constructor(
    type: AppErrorType,
    userMessage: string,
    statusCode: number = 400
  ) {
    super(userMessage);
    this.type = type;
    this.userMessage = userMessage;
    this.statusCode = statusCode;
  }

  toResponse() {
    return {
      ok: false,
      error: this.userMessage,
      code: this.type
    };
  }
}

// Safe error message mapping - translates technical errors to user-friendly messages
const ERROR_MESSAGES: Record<string, string> = {
  // Auth errors
  'Unauthorized': 'Please sign in to use the system',
  'Forbidden': 'You do not have permission to perform this action',
  'Unauthorized access': 'Unauthorized access',

  // Validation errors
  'Invalid input': 'Invalid input',
  'Validation failed': 'Validation failed. Please check your input',
  'Missing required field': 'Please fill in all required fields',

  // Business logic errors
  'Insufficient balance': 'Insufficient coin balance',
  'Coin balance too low': 'Insufficient coin balance',  
  'Prediction is closed': 'Predictions are now closed',
  'Prediction already resolved': 'This prediction has already been resolved',
  'Already predicted': 'You have already predicted on this question',
  'Minimum bet amount': 'Bet amount must be greater than 0',

  // Rate limiting
  'Rate limit exceeded': 'Too many requests. Please wait a moment',
  'Too many requests': 'Too many requests. Please wait a moment',

  // Database errors (generic - never show technical details)
  'Database error': 'Connection error. Please try again',
  'Foreign key violation': 'Failed to save data',
  'Unique violation': 'Duplicate entry already exists',
  'Check violation': 'Data does not meet system requirements',

  // Generic fallbacks
  'Internal server error': 'Internal system error. Please contact support',
  'Unknown error': 'Unknown error. Please try again',
};

// Get safe error message (never leak technical details)
export function getSafeErrorMessage(error: unknown, defaultMessage: string = 'An error occurred. Please try again'): string {
  if (error instanceof AppError) {
    return error.userMessage;
  }

  if (error instanceof Error) {
    const message = error.message;

    // Check for known error patterns
    for (const [pattern, safeMessage] of Object.entries(ERROR_MESSAGES)) {
      if (message.toLowerCase().includes(pattern.toLowerCase())) {
        return safeMessage;
      }
    }

    // Never return raw technical messages
    // Only return safe generic message
    return defaultMessage;
  }

  if (typeof error === 'string') {
    // Try to map string errors
    for (const [pattern, safeMessage] of Object.entries(ERROR_MESSAGES)) {
      if (error.toLowerCase().includes(pattern.toLowerCase())) {
        return safeMessage;
      }
    }
    return defaultMessage;
  }

  return defaultMessage;
}

// Create safe error response (for API routes)
export function createSafeErrorResponse(
  error: unknown,
  statusCode: number = 500,
  customMessage?: string
): NextResponse {
  const safeMessage = customMessage || getSafeErrorMessage(error);
  
  // Determine appropriate status code
  let finalStatusCode = statusCode;
  if (error instanceof AppError) {
    finalStatusCode = error.statusCode;
  } else if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('unauthorized') || msg.includes('unauthenticated')) {
      finalStatusCode = 401;
    } else if (msg.includes('forbidden') || msg.includes('permission')) {
      finalStatusCode = 403;
    } else if (msg.includes('not found')) {
      finalStatusCode = 404;
    } else if (msg.includes('validation') || msg.includes('invalid')) {
      finalStatusCode = 400;
    } else if (msg.includes('rate limit')) {
      finalStatusCode = 429;
    }
  }

  return NextResponse.json(
    { ok: false, error: safeMessage },
    { status: finalStatusCode }
  );
}

// Helper: Log error internally (for debugging) without leaking to client
export function logErrorInternally(context: string, error: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context}]`, error);
  } else {
    // In production, log only safe info
    const safeInfo = {
      context,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      message: error instanceof Error ? error.message : String(error).substring(0, 100),
      timestamp: new Date().toISOString(),
    };
    console.error(JSON.stringify(safeInfo));
  }
}
