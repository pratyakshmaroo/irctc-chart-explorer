import { test } from "node:test";
import assert from "node:assert/strict";

import { PAGE_SIZES, isValidPageSize, paginate } from "./pagination.ts";

const ROWS = Array.from({ length: 69 }, (_, i) => i);

test("page sizes 10/25/50/100 slice without truncating the dataset", () => {
  for (const size of PAGE_SIZES) {
    const first = paginate(ROWS, 1, size);
    assert.equal(first.items.length, Math.min(size, ROWS.length));
    assert.equal(first.total, ROWS.length);
    assert.equal(first.totalPages, Math.ceil(ROWS.length / size));
    const last = paginate(ROWS, first.totalPages, size);
    assert.equal(last.items.length, ROWS.length - (first.totalPages - 1) * size);
  }
});

test("25 per page over a 69-row dataset", () => {
  const p1 = paginate(ROWS, 1, 25);
  assert.equal(p1.items.length, 25);
  assert.equal(p1.totalPages, 3);
  const p3 = paginate(ROWS, 3, 25);
  assert.equal(p3.items.length, 19);
  assert.deepEqual(p3.items, ROWS.slice(50));
});

test("page beyond the last page clamps to the last page", () => {
  const p = paginate(ROWS, 999, 25);
  assert.equal(p.page, 3);
  const size10 = paginate(ROWS, 9999, 10);
  assert.equal(size10.page, 7);
  assert.equal(size10.items.length, 9);
});

test("'All' returns every row on page 1", () => {
  const p = paginate(ROWS, 3, "All");
  assert.equal(p.page, 1);
  assert.equal(p.size, "All");
  assert.equal(p.items.length, ROWS.length);
  assert.equal(p.totalPages, 1);
});

test("underlying dataset is never mutated or truncated", () => {
  const copy = [...ROWS];
  paginate(ROWS, 1, 25);
  paginate(ROWS, 2, 25);
  paginate(ROWS, 1, "All");
  assert.equal(ROWS.length, copy.length);
  assert.deepEqual(ROWS, copy);
});

test("validation of page size and page number", () => {
  assert.equal(isValidPageSize(10), true);
  assert.equal(isValidPageSize(100), true);
  assert.equal(isValidPageSize("All"), true);
  assert.equal(isValidPageSize(15), false);
  assert.throws(() => paginate(ROWS, 1, 15 as never), /invalid page size/);
  assert.throws(() => paginate(ROWS, 0, 25), /invalid page/);
  assert.throws(() => paginate(ROWS, 2, 0 as never), /invalid page size/);
});