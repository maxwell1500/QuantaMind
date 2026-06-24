import { describe, it, expect } from "vitest";
import { parseCsv, csvToCollection } from "../csvImport";

const TOOLS = JSON.stringify([
  { name: "get_weather", description: "Get weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
  { name: "cancel_order", description: "Cancel an order", parameters: { type: "object", properties: { order_id: { type: "number" } }, required: ["order_id"] } },
]);

const HEADER = "id,prompt,expected_tool,expected_args";

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes, and trailing newline", () => {
    const grid = parseCsv('a,b\n"x,y","he said ""hi"""\n');
    expect(grid).toEqual([["a", "b"], ["x,y", 'he said "hi"']]);
  });

  it("handles newlines inside quoted fields and CRLF", () => {
    const grid = parseCsv('a,b\r\n"line1\nline2",2\r\n');
    expect(grid).toEqual([["a", "b"], ["line1\nline2", "2"]]);
  });

  it("drops fully-blank lines", () => {
    expect(parseCsv("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("csvToCollection", () => {
  it("maps a clean CSV (single + abstain) into ToolTasks", () => {
    const csv = `${HEADER}\nweather-paris,"Weather in Paris?",get_weather,"{""city"":""Paris""}"\nrefuse-greet,"Say hello",,`;
    const r = csvToCollection(csv, TOOLS);
    expect(r.headerError).toBeNull();
    expect(r.toolsError).toBeNull();
    expect(r.rows.every((row) => row.ok)).toBe(true);
    expect(r.tasks).toHaveLength(2);
    expect(r.tasks![0]).toMatchObject({ id: "weather-paris", category: "single", expected: { type: "call", name: "get_weather", args: { city: "Paris" } } });
    expect(r.tasks![1]).toMatchObject({ id: "refuse-greet", category: "abstain", expected: { type: "no_call" } });
  });

  it("locates a misordered header and blocks", () => {
    const csv = "id,prompt,tool,expected_args\nx,p,get_weather,{}";
    const r = csvToCollection(csv, TOOLS);
    expect(r.headerError).toContain("Column 3 must be `expected_tool`");
    expect(r.tasks).toBeNull();
  });

  it("flags invalid expected_args JSON on its row", () => {
    const csv = `${HEADER}\nx,"p",get_weather,"{not json}"`;
    const r = csvToCollection(csv, TOOLS);
    expect(r.rows[0]).toMatchObject({ row: 1, ok: false });
    expect(r.rows[0].message).toContain("not valid JSON");
    expect(r.tasks).toBeNull();
  });

  it("rejects a tool not declared in the Tools box", () => {
    const csv = `${HEADER}\nx,"p",wire_money,"{}"`;
    const r = csvToCollection(csv, TOOLS);
    expect(r.rows[0].message).toContain("not declared in the Tools schema");
    expect(r.tasks).toBeNull();
  });

  it("rejects duplicate ids", () => {
    const csv = `${HEADER}\ndup,"p1",get_weather,"{""city"":""A""}"\ndup,"p2",get_weather,"{""city"":""B""}"`;
    const r = csvToCollection(csv, TOOLS);
    expect(r.rows[1].message).toContain("Duplicate id");
    expect(r.tasks).toBeNull();
  });

  it("rejects args on an abstain row (tool empty but args present)", () => {
    const csv = `${HEADER}\nx,"p",,"{""city"":""A""}"`;
    const r = csvToCollection(csv, TOOLS);
    expect(r.rows[0].message).toContain("must be empty when `expected_tool` is empty");
    expect(r.tasks).toBeNull();
  });

  it("reports an invalid Tools box", () => {
    const csv = `${HEADER}\nx,"p",get_weather,"{}"`;
    const r = csvToCollection(csv, "{ not an array }");
    expect(r.toolsError).toBeTruthy();
    expect(r.tasks).toBeNull();
  });

  it("requires a non-empty id and prompt", () => {
    const csv = `${HEADER}\n,"p",get_weather,"{}"\nok,"",get_weather,"{}"`;
    const r = csvToCollection(csv, TOOLS);
    expect(r.rows[0].message).toContain("`id` is required");
    expect(r.rows[1].message).toContain("`prompt` is required");
  });
});
