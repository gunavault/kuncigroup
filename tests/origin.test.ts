import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOrigin } from "../src/lib/auth";
test("origin validation respects the proxy Host instead of internal Next.js port", () => {
  assert.doesNotThrow(() =>
    checkOrigin(
      new Request("http://127.0.0.1:3000/api/erp", {
        headers: { host: "localhost:8080", origin: "http://localhost:8080" },
      }),
    ),
  );
});
test("origin validation rejects cross-site POST through proxy", () => {
  assert.throws(() =>
    checkOrigin(
      new Request("http://127.0.0.1:3000/api/erp", {
        headers: {
          host: "localhost:8080",
          origin: "https://untrusted.invalid",
        },
      }),
    ),
  );
});
test("origin validation rejects null origin and permits non-browser clients", () => {
  assert.throws(() =>
    checkOrigin(
      new Request("http://127.0.0.1:3000/api/erp", {
        headers: { host: "localhost:8080", origin: "null" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    checkOrigin(new Request("http://127.0.0.1:3000/api/erp")),
  );
});

test("HTTPS proxy preserves external protocol and removes internal port", () => {
  assert.doesNotThrow(() =>
    checkOrigin(
      new Request("http://127.0.0.1:3000/api/session", {
        headers: {
          host: "erp.example.test",
          "x-forwarded-proto": "https",
          origin: "https://erp.example.test",
        },
      }),
    ),
  );
});
test("HTTPS proxy rejects another origin or downgraded protocol", () => {
  for (const origin of ["https://untrusted.invalid", "http://erp.example.test"])
    assert.throws(() =>
      checkOrigin(
        new Request("http://127.0.0.1:3000/api/session", {
          headers: {
            host: "erp.example.test",
            "x-forwarded-proto": "https",
            origin,
          },
        }),
      ),
    );
});
