# CockroachDB MCP Server

This MCP server connects to a CockroachDB instance, exposing database and table schemas as resources, running SQL queries as tools, and providing prompts for query analysis.

## Features

### Resources

- `cockroachdb://{host}/databases/{database}` - Get information about a specific database
- `cockroachdb://{host}/databases/{database}/tables/{table}/schema` - Get the schema for a specific table

### Tools

- `query` - Execute a SQL query with options for execution plan analysis

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the project:
   ```bash
   npx tsc
   ```

> **Note:** You must build the project with `tsc` before using the MCP server locally.

## Configuration

The server requires a database URL as a command-line argument:

```bash
node dist/server.js postgres://user:password@host:port/database
```

## Using with Claude for Desktop

1. Open your Claude for Desktop App configuration:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add your server configuration:

```json
{
  "mcpServers": {
    "cockroachdb": {
      "command": "node",
      "args": ["/path/to/cockroachdb-mcp-server/dist/server.js", "postgres://user:password@host:port/database"]
    }
  }
}
```

3. Restart Claude for Desktop

## Using with Cline

1. Open your Cline configuration file from the extension settings under "MCP Servers". Select "Configure MCP Servers".

2. Add your server configuration:

```json
{
  "mcpServers": {
    "crdb": {
      "command": "node",
      "args": [
        "/path/to/cockroachdb-mcp-server/dist/server.js",
        "postgres://root@127.0.0.1:26257/testdb"
      ]
    }
  }
}
```

3. Restart Cline or start a new session

## Example Queries

Here are some example queries you can ask Claude:

1. "What databases are available in my CockroachDB instance?"
2. "Can you show me the schema for the 'users' table in the 'testdb' database?"
3. "Run this query on my database: SELECT * FROM users LIMIT 10"
4. "Debug this query and suggest improvements: SELECT * FROM orders WHERE customer_id = 123"

## Security Considerations

Be careful when configuring database access. Consider using a read-only user for the connection if you only need to query data.

## Troubleshooting

- If you encounter connection issues, verify your database credentials and ensure the CockroachDB instance is accessible from your machine.
- For SQL errors, check the server logs for detailed error messages.
- If Claude can't see the server, verify the configuration file is properly formatted and the path to the server.js file is correct.
