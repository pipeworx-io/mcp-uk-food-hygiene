# mcp-uk-food-hygiene

UK Food Hygiene MCP — Food Standards Agency food hygiene ratings (FHRS)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Uk Food Hygiene data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
