import { z } from "zod";

export const JSONRPCMessageSchema = z.union([
  z.object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]),
    method: z.string(),
    params: z
      .object({
        _meta: z
          .object({
            progressToken: z.union([z.string(), z.number()]).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  }),

  z.object({
    jsonrpc: z.literal("2.0"),
    method: z.string(),
    params: z
      .object({
        _meta: z.object({}).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  }),

  z.object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]),
    result: z
      .object({
        _meta: z.object({}).passthrough().optional(),
      })
      .passthrough(),
  }),

  z.object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]),
    error: z.object({
      code: z.number(),
      message: z.string(),
      data: z.any().optional(),
    }),
  }),
]);

export type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;
