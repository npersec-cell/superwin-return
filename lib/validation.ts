import { z, ZodError } from "zod";
import { NextRequest, NextResponse } from "next/server";

/**
 * Helper function to validate request body with Zod
 * Returns parsed data or sends 400 response
 */
export async function validateRequest<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  try {
    const body = await request.json();
    const parsed = schema.parse(body);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof ZodError) {
      const messages = error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "input";
        return `${path}: ${issue.message}`;
      });

      const response = NextResponse.json(
        {
          ok: false,
          error: "Validation failed",
          details: messages,
        },
        { status: 400 }
      );
      return { success: false, response };
    }

    // JSON parse error
    const response = NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON in request body",
      },
      { status: 400 }
    );
    return { success: false, response };
  }
}

/**
 * Helper to format Zod validation errors for API responses
 */
export function formatZodErrors(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "input";
    return `${path}: ${issue.message}`;
  });
}

// ───────────────────────────────────────────────
// Zod Schemas for API Validation
// ───────────────────────────────────────────────

/** UUID validation */
export const uuidSchema = z.string().uuid("Invalid UUID format");

/** Prediction ID parameter */
export const predictionIdParamSchema = z.object({
  predictionId: uuidSchema,
});

/** Option ID parameter */
export const optionIdParamSchema = z.object({
  optionId: uuidSchema,
});

/** Predict request body (POST /api/predictions/predict) */
export const predictBodySchema = z.object({
  predictionId: uuidSchema,
  optionId: uuidSchema,
  amount: z
    .number()
    .int("Amount must be a whole number")
    .positive("Amount must be greater than 0")
    .max(100000, "Maximum prediction is 100,000 coins"),
  insurance: z.boolean().optional().default(false),
});

/** Resolve prediction body (POST /api/admin/predictions/:id/resolve) */
export const resolveBodySchema = z.object({
  winningOptionId: uuidSchema,
});

/** Admin create prediction body (POST /api/admin/predictions) */
export const createPredictionBodySchema = z.object({
  tournamentName: z
    .string()
    .min(1, "Tournament name is required")
    .max(200, "Tournament name too long (max 200 characters)"),
  question: z
    .string()
    .min(1, "Question is required")
    .max(500, "Question too long (max 500 characters)"),
  opensAt: z
    .string()
    .optional()
    .nullable(),
  closesAt: z.string().min(1, "Close time is required"),
  feeRate: z
    .number()
    .min(0, "Fee rate cannot be negative")
    .max(1, "Fee rate cannot exceed 100%")
    .optional()
    .default(0.03),
  status: z
    .enum(["draft", "open", "closed", "resolved", "canceled"])
    .optional()
    .default("draft"),
  options: z
    .array(z.string().min(1, "Option label cannot be empty"))
    .min(2, "At least 2 options are required")
    .max(50, "Maximum 50 options allowed"),
  numberWarEnabled: z.boolean().optional().default(false),
  numberWarOpenAt: z.string().optional().nullable(),
  numberWarCloseAt: z.string().optional().nullable(),
  sponsorPool: z.number().int().min(0).optional().default(500),
});

/** Admin update prediction body (PATCH /api/admin/predictions/:id) */
export const updatePredictionBodySchema = z.object({
  tournamentName: z
    .string()
    .min(1)
    .max(200)
    .optional(),
  question: z
    .string()
    .min(1)
    .max(500)
    .optional(),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
  feeRate: z
    .number()
    .min(0)
    .max(1)
    .optional(),
  status: z
    .enum(["draft", "open", "closed", "resolved", "canceled"])
    .optional(),
  options: z
    .array(
      z.object({
        id: uuidSchema,
        label: z.string().min(1).max(200),
      })
    )
    .optional(),
  numberWarEnabled: z.boolean().optional(),
  numberWarOpenAt: z.string().optional().nullable(),
  numberWarCloseAt: z.string().optional().nullable(),
});

/** Admin user role update body (POST /api/admin/users/make-admin, /api/admin/users/remove-admin) */
export const adminUserRoleSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email format"),
});

/** User create prediction body (POST /api/predictions/create) — feeRate fixed at 0.05 */
export const createUserPredictionBodySchema = z.object({
  tournamentName: z
    .string()
    .min(1, "Tournament name is required")
    .max(200, "Tournament name too long (max 200 characters)"),
  round: z
    .string()
    .min(1, "Round is required")
    .max(200, "Round too long (max 200 characters)"),
  question: z
    .string()
    .min(1, "Question is required")
    .max(500, "Question too long (max 500 characters)"),
  opensAt: z
    .string()
    .optional()
    .nullable(),
  closesAt: z.string().min(1, "Close time is required"),
  feeRate: z
    .number()
    .refine((val) => val === 0.05, "Fee rate must be 0.05")
    .default(0.05),
  status: z
    .enum(["draft", "open", "closed", "resolved", "canceled"])
    .optional()
    .default("open"),
  options: z
    .array(z.string().min(1, "Option label cannot be empty"))
    .min(2, "At least 2 options are required")
    .max(50, "Maximum 50 options allowed"),
});

