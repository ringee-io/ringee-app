import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";

/**
 * What a rejected request tells the client.
 *
 * Nest's default factory returns a flat `message: string[]` with no indication
 * of which field each line belongs to, so a form can only ever show the whole
 * list in a toast. This keeps that array exactly as it was — every existing
 * consumer still reads `message` the same way — and adds `fields`, a
 * `path → sentence` map a form can attach to the input that is actually wrong.
 *
 * Nested paths are dotted and indexed the way the client sent them
 * (`extractionFields.0.key`), so mapping back to a control needs no guessing.
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const flattened = flatten(errors);
  const fields: Record<string, string> = {};

  for (const { path, message } of flattened) {
    // First message per field wins: the constraints run in declaration order,
    // so the earliest one is the most fundamental thing to fix.
    if (!(path in fields)) fields[path] = message;
  }

  return new BadRequestException({
    statusCode: 400,
    error: "Bad Request",
    message: flattened.map((entry) => entry.message),
    fields,
  });
}

function flatten(
  errors: ValidationError[],
  parentPath = "",
): Array<{ path: string; message: string }> {
  const out: Array<{ path: string; message: string }> = [];

  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    for (const message of Object.values(error.constraints ?? {})) {
      out.push({ path, message });
    }
    if (error.children?.length) {
      out.push(...flatten(error.children, path));
    }
  }

  return out;
}
