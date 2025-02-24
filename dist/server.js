import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pg from 'pg';
const server = new McpServer({
    name: "cockroachdb",
    version: "0.1.0"
});
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Please provide a database URL as a command-line argument");
    process.exit(1);
}
const databaseUrl = args[0];
const resourceBaseUrl = new URL(databaseUrl);
resourceBaseUrl.protocol = "postgres:";
resourceBaseUrl.password = "";
const pool = new pg.Pool({
    connectionString: databaseUrl,
});
// Add a resource for listing databases
server.resource("databases", new ResourceTemplate("postgres://{host}/databases", { list: async () => {
        const client = await pool.connect();
        try {
            const result = await client.query(`SELECT name 
         FROM crdb_internal.databases 
         WHERE name NOT IN ('system', 'postgres')`);
            return {
                resources: result.rows.map(row => ({
                    uri: `postgres://${resourceBaseUrl.host}/databases/${row.name}`,
                    name: `${row.name} database`,
                    mimeType: "application/json"
                }))
            };
        }
        finally {
            client.release();
        }
    } }), async (uri, params) => {
    const client = await pool.connect();
    try {
        // Get database details from CRDB internal tables
        const result = await client.query(`SELECT 
          owner,
          version 
         FROM crdb_internal.databases 
         WHERE name = $1`, [params.database]);
        const dbInfo = {
            name: params.database,
            owner: result.rows[0]?.owner,
            version: result.rows[0]?.version,
        };
        return {
            contents: [{
                    uri: uri.href,
                    text: JSON.stringify(dbInfo, null, 2),
                    mimeType: "application/json"
                }]
        };
    }
    finally {
        client.release();
    }
});
// Schema resource using CRDB catalog tables
server.resource("schema", new ResourceTemplate("postgres://{host}/databases/{database}/tables/{table}/schema", { list: async () => {
        const client = await pool.connect();
        try {
            const result = await client.query(`SELECT name as table_name, database_name
         FROM crdb_internal.tables 
         WHERE schema_name NOT IN ('crdb_internal', 'pg_catalog', 'information_schema')
         AND database_name IS NOT NULL`);
            return {
                resources: result.rows.map(row => ({
                    uri: `postgres://${resourceBaseUrl.host}/databases/${row.database_name}/tables/${row.table_name}/schema`,
                    name: `${row.database_name}.${row.table_name} schema`,
                    mimeType: "application/json"
                }))
            };
        }
        finally {
            client.release();
        }
    } }), async (uri, params) => {
    const client = await pool.connect();
    try {
        // Get detailed column information from CRDB catalog
        const result = await client.query(`SELECT 
          column_name,
          column_type,
          nullable,
          default_expr,
          hidden
         FROM crdb_internal.table_columns
         WHERE descriptor_name = $1
         ORDER BY column_id`, [params.table]);
        const schema = {
            table: params.table,
            columns: result.rows.map(col => ({
                name: col.column_name,
                type: col.column_type,
                nullable: col.nullable,
                default: col.default_expr || undefined,
                hidden: col.hidden
            }))
        };
        return {
            contents: [{
                    uri: uri.href,
                    text: JSON.stringify(schema, null, 2),
                    mimeType: "application/json"
                }]
        };
    }
    finally {
        client.release();
    }
});
// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
