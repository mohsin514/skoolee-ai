import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { matchesEnquirySearch } from "../../src/lib/admissions/enquiry-search";

// SKAI-1822: the enquiries panel loads the list once and searches it in the browser. These cases pin
// the predicate to the AND of the old API clause and the old panel clause, so the rows shown do not change.

const lead = { name: "Aisha Rahman", phone: "+971 50 123 4567", email: "Parent.Aisha@Example.test" };

test("an empty or blank query keeps every enquiry", () => {
  assert.equal(matchesEnquirySearch(lead, ""), true);
  assert.equal(matchesEnquirySearch(lead, "   "), true);
});

test("name and email match ignoring case; phone matches as typed", () => {
  assert.equal(matchesEnquirySearch(lead, "aisha"), true);
  assert.equal(matchesEnquirySearch(lead, "RAHMAN"), true);
  assert.equal(matchesEnquirySearch(lead, "example.TEST"), true);
  assert.equal(matchesEnquirySearch(lead, "123 45"), true);
  assert.equal(matchesEnquirySearch(lead, "Omar"), false);
});

test("a missing email does not match or throw", () => {
  assert.equal(matchesEnquirySearch({ name: "Omar", phone: "0500", email: null }, "example"), false);
  assert.equal(matchesEnquirySearch({ name: "Omar", phone: "0500", email: null }, "omar"), true);
});

test("a padded query is filtered exactly as the old API + panel pair filtered it", () => {
  // Old API trimmed the query; old panel did not. Leading space only matched where the text has one.
  assert.equal(matchesEnquirySearch(lead, " rahman"), true);
  assert.equal(matchesEnquirySearch(lead, " aisha"), false);
});

test("phone matching stays case-sensitive the way the API's contains was", () => {
  const ext = { name: "Lead", phone: "0500 ext 12", email: null };
  assert.equal(matchesEnquirySearch(ext, "ext"), true);
  assert.equal(matchesEnquirySearch(ext, "EXT"), false);
});

test("useListField with history: replace rewrites the entry instead of pushing one per keystroke", async () => {
  mock.module("react", {
    namedExports: {
      useCallback: (fn: unknown) => fn,
      useSyncExternalStore: (_subscribe: unknown, snapshot: () => string) => snapshot(),
    },
  });
  const calls: string[] = [];
  const location = { pathname: "/dashboard", search: "?tab=enquiries", hash: "" };
  const history = {
    state: null,
    pushState: (_s: unknown, _t: string, url: string) => { calls.push(`push ${url}`); location.search = url.slice(url.indexOf("?")); },
    replaceState: (_s: unknown, _t: string, url: string) => { calls.push(`replace ${url}`); location.search = url.slice(url.indexOf("?")); },
  };
  (globalThis as any).window = { location, history, dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
  try {
    const { useListField } = await import("../../src/hooks/use-list-field");
    const [, setSearch] = useListField<string>("enquiries.search", "", "enquiries.page", { history: "replace" });
    for (const value of ["a", "ai", "ais"]) setSearch(value);
    assert.deepEqual(calls.map((c) => c.split(" ")[0]), ["replace", "replace", "replace"]);
    assert.match(calls.at(-1)!, /enquiries\.search=ais/);
    assert.match(calls.at(-1)!, /tab=enquiries/);

    const [, setStatus] = useListField<string>("enquiries.status", "ALL", "enquiries.page");
    setStatus("LOST");
    assert.equal(calls.at(-1)!.split(" ")[0], "push", "fields without the option keep pushing history");
  } finally {
    delete (globalThis as any).window;
  }
});
