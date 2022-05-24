import {
  z,
  ZodTypeAny,
  AnyZodObject,
  ZodError,
  ZodObject,
  ZodLazy,
  ZodOptional,
} from "zod";

//

type _Object = Record<string, unknown>;
function isObject(source: unknown): source is _Object {
  return !!(source && typeof source === "object" && !Array.isArray(source));
}

type _Array = Array<unknown>;
function isArray(source: unknown): source is _Array {
  return !!(source && Array.isArray(source));
}

/**
 * Recursively unwraps zod schema types until a root type is reached.
 */
function unwrapZodType(schema: ZodTypeAny): ZodTypeAny {
  return schema instanceof ZodLazy
    ? unwrapZodType(schema.schema)
    : schema instanceof ZodOptional
    ? unwrapZodType(schema._def.innerType)
    : schema;
}

//

export function parseCyclical<SCHEMA extends ZodTypeAny>(
  data: unknown,
  schema: SCHEMA
):
  | { success: true; data: z.infer<SCHEMA> }
  | { success: false; error: ZodError } {
  const seen = new Set<unknown>();
  const error = new ZodError([]);

  function walk(
    data: unknown,
    _schema: ZodTypeAny,
    currentPath: string[] = []
  ): void {
    // console.log(data, currentPath);

    // ZodLazy => schema() => inner type
    // ZodOptional => ._def.innerType => inner type
    // ZodObject => .shape => map of all the properties
    // ZodArray => ?

    const schema = unwrapZodType(_schema);

    if (isObject(data)) {
      if (!(schema instanceof ZodObject)) {
        const $ = schema.safeParse(data);
        if ($.success) {
          throw new TypeError(
            "invariant: non-object into object schema must fail"
          );
        }
        error.addIssues($.error.issues);
        return;
      }

      if (seen.has(data)) {
        // console.log("skipped cycle", data, currentPath);
        return;
      } else {
        seen.add(data);
      }

      // ? deferred properties
      const dprops: {
        key: string;
        data: unknown;
        schema: ZodTypeAny;
      }[] = [];

      // create partial schema with all object/array types as optional
      let partialschema: AnyZodObject = schema.extend({});
      // strip all data values that are objects/arrays
      const partialdata: Record<string, unknown> = Object.fromEntries(
        Object.entries(data).map(([key, value]) => {
          const skip = [key, value];
          const isObjectOrArray = !!(value && typeof value === "object");
          if (!isObjectOrArray) {
            return skip;
          }
          const valueSchema = partialschema.shape[key];
          if (!valueSchema) {
            return skip;
          }
          partialschema = partialschema.extend({
            [key]: valueSchema.optional(),
          });
          dprops.push({ key, data: value, schema: valueSchema });
          return [key, undefined];
        })
      );

      const $ = partialschema.safeParse(partialdata);
      if (!$.success) {
        error.addIssues($.error.issues);
        return;
      }

      for (const dprop of dprops) {
        walk(dprop.data, dprop.schema, [...currentPath, dprop.key]);
      }
    }

    if (isArray(data)) {
      return;
    }

    // if is anything else
    return;
  }

  walk(data, schema);

  if (error.issues.length) {
    return { success: false, error };
  }

  return { success: true, data };
}
