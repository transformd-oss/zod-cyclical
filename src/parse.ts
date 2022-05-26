import {
  z,
  ZodTypeAny,
  ZodError,
  ZodLazy,
  ZodOptional,
  ZodObject,
  ZodRecord,
  ZodArray,
  ZodUnion,
  AnyZodObject,
} from "zod";

function isObject(
  value: unknown
): value is Record<string, unknown> | Array<unknown> {
  return !!(value && typeof value === "object");
}

const placeholder = { $placeholder: true };
const Placeholder = z.object({ $placeholder: z.literal(true) });

interface Ctx {
  path: string[];
  seen: Set<unknown>;
}

export function parse<SCHEMA extends ZodTypeAny>(
  schema: SCHEMA,
  value: unknown,
  ctx?: Ctx
):
  | { success: true; data: z.infer<SCHEMA> }
  | { success: false; error: ZodError } {
  const { path = [], seen = new Set() } = ctx ?? {};
  ctx = { path, seen };

  if (!isObject(value)) {
    const $ = schema.safeParse(value);
    if (!$.success) {
      return { ...$, error: applyCtx($.error, ctx) };
    }
    return $;
  }

  // * `value` is an object

  if (seen.has(value)) {
    return { success: true, data: value };
  } else {
    seen.add(value);
  }

  // * `value` has not been validated before, previously unseen

  if (Array.isArray(value)) {
    // TODO: Handle array value inputs.
    return { success: true, data: value };
  }

  // * `value` is an object/record, not an array

  const defer = new Map<string, unknown>();
  const partialValue = Object.fromEntries(
    Object.entries(value).map(([key, value]) => {
      if (!isObject(value)) {
        return [key, value];
      }
      defer.set(key, value);
      return [key, placeholder];
    })
  );

  const partialSchema = toPartialSchema(schema);
  const $ = partialSchema.safeParse(partialValue);
  if (!$.success) {
    return { ...$, error: applyCtx($.error, ctx) };
  }

  let rootSchema = toRootSchema(schema);
  if (rootSchema instanceof ZodUnion) {
    let orootschema: ZodTypeAny | undefined = undefined;
    let $: ReturnType<typeof parse> | undefined = undefined;
    for (const oschema of rootSchema.options) {
      const $$ = parse(oschema, value, ctx);
      $ = $$;
      orootschema = oschema;
      if ($$.success) {
        break;
      }
    }
    if (!$ || !orootschema) {
      throw new TypeError("invariant: union must have at least 1 option");
    }
    if (!$.success) {
      return { ...$, error: applyCtx($.error, ctx) };
    }
    if (orootschema instanceof ZodUnion) {
      throw new TypeError("invariant: not supported yet");
    }
    rootSchema = orootschema;
  }

  for (const [dkey, dvalue] of defer.entries()) {
    let dschema: ZodTypeAny;
    if (rootSchema instanceof ZodObject) {
      dschema = (rootSchema as AnyZodObject).shape[dkey];
      if (!dschema) {
        continue;
      }
    } else if (rootSchema instanceof ZodRecord) {
      dschema = (rootSchema as ZodRecord<ZodTypeAny>).element;
    } else {
      throw new TypeError("invariant: unsupported schema type");
    }

    const $ = parse(dschema, dvalue, { ...ctx, path: [...ctx.path, dkey] });
    if (!$.success) {
      return { ...$, error: applyCtx($.error, ctx) };
    }
  }

  return { success: true, data: value };
}

function toPlaceholderUnion(schema: ZodTypeAny): ZodTypeAny {
  return z.union([schema, Placeholder]);
}

/**
 * Recursively walks a zod schema converting object-like types to as support the
 * Placeholder schema.
 */
function toPartialSchema(
  schema: ZodTypeAny,
  ctx?: { depth: number }
): ZodTypeAny {
  const { depth = 0 } = ctx ?? {};
  ctx = { depth };

  // TODO: Optimise?
  if (depth == 5) {
    return schema;
  } else {
    ctx.depth++;
  }

  let next = schema;
  if (schema instanceof ZodObject) {
    Object.entries(schema.shape as Record<string, ZodTypeAny>).forEach(
      ([key, schema]) => {
        next = (next as AnyZodObject).extend({
          [key]: toPlaceholderUnion(toPartialSchema(schema, ctx)),
        });
      }
    );
  } else if (schema instanceof ZodRecord) {
    next = z.record(
      toPlaceholderUnion(toPartialSchema(schema.valueSchema, ctx))
    );
  } else if (schema instanceof ZodArray) {
    next = z.array(toPlaceholderUnion(toPartialSchema(schema.element, ctx)));
  } else if (schema instanceof ZodLazy) {
    next = toPartialSchema(schema.schema, ctx);
  } else if (schema instanceof ZodUnion) {
    next = z.union([
      ...schema.options.map((option) => toPartialSchema(option, ctx)),
      Placeholder,
    ] as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
  } else {
    next = z.union([toPartialSchema(schema, ctx), Placeholder]);
  }

  return next;
}

/**
 * Recursively unwraps zod schema types until a root type is reached.
 */
function toRootSchema(schema: ZodTypeAny): ZodTypeAny {
  return schema instanceof ZodLazy
    ? toRootSchema(schema.schema)
    : schema instanceof ZodOptional
    ? toRootSchema(schema._def.innerType)
    : schema;
}

/**
 * Applies contextual information to given zod error.
 * - prefixes path on all issues
 */
function applyCtx(error: ZodError, ctx: Ctx) {
  const { path } = ctx;
  return new ZodError(
    error.issues.map((issue) => ({
      ...issue,
      path: [...path, ...issue.path],
    }))
  );
}
