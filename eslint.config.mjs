import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Matches any statement-level `await <chain>.{insert|update|delete|upsert}(...)`
// where the caller is discarding the return value.
//
//   GOOD:  const { error } = await supabase.from('clients').insert({...});
//   BAD:   await supabase.from('clients').insert({...});
//
// Rationale: the Supabase JS client NEVER rejects promises for server
// errors. It resolves to `{ data, error }`. Treating the call like a
// plain void promise silently swallows RLS violations, missing columns,
// type mismatches, etc. We hit exactly that in handleSave for clients —
// enforce the pattern at lint time so we can't regress.
//
// The selector uses the descendant combinator (space) so it catches
// chains like `await supabase.from('x').update({...}).eq('id', y)`
// where the `.update()` is nested inside `.eq()`.
const NO_SILENCED_SUPABASE_ERROR = {
  selector:
    "ExpressionStatement > AwaitExpression CallExpression[callee.property.name=/^(insert|update|delete|upsert)$/]",
  message:
    "Supabase mutation result must be destructured: `const { error } = await supabase.from(...).insert/update/delete/upsert(...)`. Discarding the result silently swallows RLS, schema, and auth errors.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Project-wide custom rules.
  {
    rules: {
      "no-restricted-syntax": ["error", NO_SILENCED_SUPABASE_ERROR],
    },
  },
  // Access-log inserts are deliberately fire-and-forget (we never
  // block the user on a logging failure). Keep the guard on
  // everything else but exempt the logging modules.
  {
    files: ["lib/db/access-logs.ts", "app/auth/callback/route.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Tests exercise both success and failure paths intentionally.
  {
    files: ["tests/**", "scripts/**"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);

export default eslintConfig;
