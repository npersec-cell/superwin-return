// Safe error messages mapping - prevents technical leakage
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
  'Unauthorized': 'เข้าสู่ก่อนใช้งานระบบ',
  'Forbidden': 'ไม่มีสิทธิ์ในการทำรายการนี้',
  'Unauthorized access': 'ไม่มีสิทธิ์ในการเข้าถึง',

  // Validation errors
  'Invalid input': 'ข้อมูลไม่ถูกต้อง',
  'Validation failed': 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  'Missing required field': 'กรุณากรอกข้อมูลให้ครบถ้วน',

  // Business logic errors
  'Insufficient balance': 'เหรียญไม่เพียงพอ',
  'Coin balance too low': 'เหรียญไม่เพียงพอ',  
  'Prediction is closed': 'ปิดรับการทายแล้ว',
  'Prediction already resolved': 'สรุปผลไปแล้ว',
  'Already predicted': 'คุณได้ทายคำถามนี้แล้ว',
  'Minimum bet amount': 'จำนวนเหรียญต้องมากกว่า 0',

  // Rate limiting
  'Rate limit exceeded': 'ทำรายการบ่อยครั้ง กรุณารอสักครู่',
  'Too many requests': 'ทำรายการบ่อยครั้ง กรุณารอสักครู่',

  // Database errors (generic - never show technical details)
  'Database error': 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง',
  'Foreign key violation': 'เกิดข้อผิดพลาดในการบันทึกข้อมูล',
  'Unique violation': 'ข้อมูลซ้ำกับที่มีอยู่ในระบบ',
  'Check violation': 'ข้อมูลไม่ถูกต้องตามเงื่อนไขของระบบ',

  // Generic fallbacks
  'Internal server error': 'เกิดข้อผิดพลาดภายในระบบ กรุณาติดต่อผู้ดูแล',
  'Unknown error': 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ กรุณาลองใหม่อีกครั้ง',
};

// Get safe error message (never leak technical details)
export function getSafeErrorMessage(error: unknown, defaultMessage: string = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'): string {
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
