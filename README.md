# CockroachDB MCP Server

This MCP server connects to a CockroachDB instance, exposing table schemas as resources, running read-only SQL queries as tools, and providing prompts for common data analysis tasks.

## Features

### Resources

- `db://tables` - List all tables in the database
- `db://tables/{tableName}/schema` - Get the schema for a specific table
- `db://tables/{tableName}/details` - Get detailed information about a table including indexes and primary keys
- `db://tables/{tableName}/stats` - Get statistics about a table (row count, size)

### Tools

- `execute-query` - Execute a read-only SQL query
- `get-sample-data` - Get a sample of data from a table with options for limit and ordering
- `count-rows` - Count the number of rows in a table with optional WHERE condition
- `column-stats` - Generate statistics for a specific column (min, max, avg, etc.)

### Prompts

- `explore-table` - Generate a prompt to explore a database table
- `generate-query` - Generate a prompt to get help writing an SQL query
- `analyze-query-results` - Generate a prompt to analyze query results
- `optimize-query` - Generate a prompt to optimize a SQL query

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npx tsc
   ```

## Configuration

Set the following environment variables to configure your CockroachDB connection:

- `DB_USER`: Database user (default: 'root')
- `DB_HOST`: Database host (default: 'localhost')
- `DB_PORT`: Database port (default: '26257')
- `DB_NAME`: Database name (default: 'defaultdb')
- `DB_PASSWORD`: Database password (default: '')
- `DB_SSL`: Whether to use SSL (default: 'false')

Example:
```bash
export DB_USER=root
export DB_HOST=localhost
export DB_PORT=26257
export DB_NAME=mydatabase
export DB_PASSWORD=mypassword
export DB_SSL=true
```

## Running the server

```bash
node dist/server.js
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
      "args": ["/path/to/cockroachdb-mcp-server/dist/server.js"],
      "env": {
        "DB_USER": "root",
        "DB_HOST": "localhost",
        "DB_PORT": "26257",
        "DB_NAME": "mydatabase",
        "DB_PASSWORD": "mypassword",
        "DB_SSL": "false"
      }
    }
  }
}
```

3. Restart Claude for Desktop

## Example Queries

Here are some example queries you can ask Claude:

1. "What tables are available in my CockroachDB database?"
2. "Can you show me the schema for the 'customers' table?"
3. "How many orders do we have for customer ID 123?"
4. "Write a query to find the top 10 products by revenue in the last month"
5. "Analyze the results of this customer retention query"

## Security Considerations

This server only allows read-only (SELECT) queries for security reasons. Always deploy it in a secure environment and use a database user with appropriate permissions (read-only access if possible).

## Troubleshooting

- If you encounter connection issues, verify your database credentials and ensure the CockroachDB instance is accessible from your machine.
- For SQL errors, check the server logs for detailed error messages.
- If Claude can't see the server, verify the claude_desktop_config.json is properly formatted and the path to the server.js file is correct.
