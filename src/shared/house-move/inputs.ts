import { z } from "zod";
import { typedPence } from "../money.ts";
import type { Rate, SignedRate } from "../rates.ts";

import { month } from "./months.ts";

const money = typedPence;

/** Rate inputs are whole basis points: 459 is 4.59%. Growth can be negative. */
const rate = z
  .number()
  .int()
  .min(0)
  .max(10_000)
  .transform((n) => n as Rate);

const interestRate = rate.refine((value) => value <= 2_000, "Enter a rate no higher than 20%");

const growth = z
  .number()
  .int()
  .min(-2_000)
  .max(2_000)
  .transform((n) => n as SignedRate);

export const costAmount = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("fixed"), amount: money }),
  z.strictObject({ kind: z.literal("sale-percent"), rate }),
  z.strictObject({ kind: z.literal("purchase-percent"), rate }),
]);

export const costItem = z.strictObject({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  amount: costAmount,
  plusVat: z.boolean(),
  timing: z.enum(["completion", "upfront"]),
});

export const deposit = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("percent"), rate }),
  z.strictObject({ kind: z.literal("amount"), amount: money }),
]);

export const houseMoveInputs = z
  .strictObject({
    asOf: month.refine((value) => value >= "2000-01", "Use January 2000 or later"),
    homeValue: money,
    mortgage: z.strictObject({
      balance: money,
      rate: interestRate,
      remainingMonths: z.number().int().min(1).max(600),
      paymentOverride: money.nullable(),
      fixedRate: z.strictObject({ until: month, followOnRate: interestRate }).nullable(),
      monthlyOverpayment: money,
      oneOffOverpayments: z.array(z.strictObject({ month, amount: money })),
      overpaymentMode: z.enum(["shorten-term", "lower-payment"]),
      annualOverpaymentAllowance: rate,
      ercBands: z
        .array(z.strictObject({ until: month, rate }))
        .refine(
          (bands) => bands.every((band, i) => i === 0 || band.until > (bands[i - 1]?.until ?? "")),
          "ERC band months must be strictly increasing",
        ),
      exitFee: money,
    }),
    targetPrice: money,
    deposit,
    growth: z.strictObject({ home: growth, target: growth, inflation: growth }),
    region: z.enum(["england-ni", "scotland"]),
    cash: z.strictObject({
      savings: money,
      monthlySaving: money,
      interestRate,
    }),
    costs: z
      .array(costItem)
      .refine(
        (costs) => new Set(costs.map((c) => c.id)).size === costs.length,
        "Cost ids must be unique",
      ),
    borrowingCheck: z
      .strictObject({
        annualIncome: money,
        incomeGrowth: growth,
        multiple: z
          .number()
          .positive()
          .max(10)
          .refine(
            (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9,
            "Use a multiple to at most two decimal places",
          ),
      })
      .nullable(),
  })
  .superRefine((input, ctx) => {
    for (const [i, payment] of input.mortgage.oneOffOverpayments.entries()) {
      if (payment.month <= input.asOf)
        ctx.addIssue({
          code: "custom",
          path: ["mortgage", "oneOffOverpayments", i, "month"],
          message: "Overpayments must be after the as-of month, whose payment is already included",
        });
    }
  });

export type HouseMoveInputs = z.infer<typeof houseMoveInputs>;

/** Reading stored inputs has a separate boundary for future shape migrations. */
export const storedHouseMoveInputs = houseMoveInputs;
