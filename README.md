# mcp-uk-food-hygiene

UK Food Hygiene MCP — Food Standards Agency food hygiene ratings (FHRS)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1679+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `uk_food_hygiene_search` | Search UK restaurant food hygiene ratings from the Food Standards Agency FHRS — answers "is this restaurant clean", "is this takeaway safe to eat at", "food hygiene rating of X". Search by business name and/or address (a town, street, or postcode works), or by latitude/longitude + radius_miles for hygiene ratings near a point. Filter by business_type (restaurant, takeaway, pub, hotel, supermarket, mobile caterer...) and min_rating (1-5). Returns rating (0-5 in England/Wales/NI; Scotland uses "Pass"/"Improvement Required" under FHIS), inspection date, address, and inspection sub-scores. Example: uk_food_hygiene_search({ name: "Nandos", address: "Leeds" }) |
| `uk_food_hygiene_details` | Get the full Food Standards Agency FHRS inspection record for one UK establishment by its FHRSID (from uk_food_hygiene_search) — rating, inspection date, sub-scores for hygiene / structural compliance / confidence in management (0 = best, higher = worse), full address, local authority contact, and geocode. Use to check how clean or safe a specific UK restaurant, takeaway, cafe, or pub is. Example: uk_food_hygiene_details({ fhrsid: 537122 }) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "uk-food-hygiene": {
      "url": "https://gateway.pipeworx.io/uk-food-hygiene/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/uk-food-hygiene/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1679+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/uk_food_hygiene_search \
  -H 'Content-Type: application/json' \
  -d '{"name":"Nandos","address":"Leeds"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/uk_food_hygiene_search`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "uk-food-hygiene": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-uk-food-hygiene"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-uk-food-hygiene
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Uk Food Hygiene data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
