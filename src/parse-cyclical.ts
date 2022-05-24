import { z, ZodTypeAny, AnyZodObject } from "zod";

function isZodObject<T extends ZodTypeAny>(schema: T): T is AnyZodObject {
  return schema._def;
}

export function parseCyclical<SCHEMA extends ZodTypeAny>(
  data: unknown,
  schema: SCHEMA
): Result<z.infer<SCHEMA>> {
  const seen = new Set<unknown>();

  function walk(data: unknown, schema: ZodTypeAny): void {
    console.log(data);

    if (seen.has(data)) {
      console.log("cycle!");
      return;
    }

    if (data && typeof data === "object") {
      schema._def.typeName;
      // ZodLazy => schema() => inner type
      // ZodObject => .shape => map of all the properties
      // ZodOptional => ._def.innerType => inner type

      seen.add(data);
      Object.entries(data).forEach(([, value]) => {
        walk(value, schema);
      });
    }
  }

  walk(data, schema);

  return Result({} as z.infer<SCHEMA>);
}
