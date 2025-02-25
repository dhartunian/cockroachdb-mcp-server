import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod"; // Add zod import for schema validation
import pg from 'pg';
import fetch from 'node-fetch'; // You'll need to add this dependency

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
// Get auth token from command line arguments (optional)
const authToken = args[1] || '';

const resourceBaseUrl = new URL(databaseUrl);
resourceBaseUrl.protocol = "postgres:";
resourceBaseUrl.password = "";

const pool = new pg.Pool({
  connectionString: databaseUrl,
});

// Add a resource for listing databases
server.resource(
  "databases",
  new ResourceTemplate("cockroachdb://{host}/databases/{database}", { list: async () => {
    const client = await pool.connect();
    try {
      const result = await client.query<{ name: string }>(
        `SELECT name 
         FROM crdb_internal.databases 
         WHERE name NOT IN ('system', 'postgres')`
      );
      return {
        resources: result.rows.map(row => ({
          uri: `cockroachdb://${resourceBaseUrl.host}/databases/${row.name}`,
          name: `${row.name} database`,
          mimeType: "application/json"
        }))
      };
    } finally {
      client.release();
    }
  }}),
  async (uri, params) => {
    const client = await pool.connect();
    try {
      // Get database details from CRDB internal tables with all available fields
      const result = await client.query<{
        id: string;
        name: string;
        owner: string;
        primary_region: string | null;
        secondary_region: string | null;
        regions: string[] | null;
        survival_goal: string | null;
        placement_policy: string | null;
        create_statement: string;
      }>(
        `SELECT 
          id,
          name,
          owner,
          primary_region,
          secondary_region,
          regions,
          survival_goal,
          placement_policy,
          create_statement
         FROM crdb_internal.databases 
         WHERE name = $1`,
        [params.database]
      );
      
      // Include all fields in the response
      const dbInfo = {
        id: result.rows[0]?.id,
        name: params.database,
        owner: result.rows[0]?.owner,
        primary_region: result.rows[0]?.primary_region,
        secondary_region: result.rows[0]?.secondary_region,
        regions: result.rows[0]?.regions,
        survival_goal: result.rows[0]?.survival_goal,
        placement_policy: result.rows[0]?.placement_policy,
        create_statement: result.rows[0]?.create_statement,
      };
      
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(dbInfo, null, 2),
          mimeType: "application/json"
        }]
      };
    } finally {
      client.release();
    }
  }
);

// Schema resource using CRDB catalog tables
server.resource(
  "schema",
  new ResourceTemplate("cockroachdb://{host}/databases/{database}/tables/{table}/schema", { list: async () => {
    const client = await pool.connect();
    try {
      const result = await client.query<{ table_name: string; database_name: string }>(
        `SELECT name as table_name, database_name
         FROM crdb_internal.tables 
         WHERE schema_name NOT IN ('crdb_internal', 'pg_catalog', 'information_schema')
         AND database_name IS NOT NULL`,
      );
      return {
        resources: result.rows.map(row => ({
          uri: `cockroachdb://${resourceBaseUrl.host}/databases/${row.database_name}/tables/${row.table_name}/schema`,
          name: `${row.database_name}.${row.table_name} schema`,
          mimeType: "application/json"
        }))
      };
    } finally {
      client.release();
    }
  }}),
  async (uri, params) => {
    const client = await pool.connect();
    try {
      // Get detailed column information from CRDB catalog
      const result = await client.query<{
        column_name: string;
        column_type: string;
        nullable: boolean;
        default_expr: string | null;
        hidden: boolean;
      }>(
        `SELECT 
          column_name,
          column_type,
          nullable,
          default_expr,
          hidden
         FROM crdb_internal.table_columns
         WHERE descriptor_name = $1
         ORDER BY column_id`,
        [params.table]
      );
      
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
    } finally {
      client.release();
    }
  }
);

// Add a SQL query tool
server.tool("query",
  "makes a query to the database",
  { 
    database: z.string().describe("The database to query"),
    sql: z.string().describe("The SQL statement to execute"),
    explainAnalyze: z.boolean().default(false).describe("When true, prefixes the query with EXPLAIN ANALYZE")
  },
  async ({ database, sql, explainAnalyze }) => {
    const client = await pool.connect();
    try {
      // Set the database context
      await client.query(`SET database = $1`, [database]);
      
      const startTime = Date.now();
      // Execute the query, with EXPLAIN ANALYZE if requested
      const queryToExecute = explainAnalyze ? `EXPLAIN ANALYZE ${sql}` : sql;
      const result = await client.query(queryToExecute);
      const endTime = Date.now() - startTime;

      // Format the results
      const formattedResults = {
        rowCount: result.rowCount,
        fields: result.fields?.map(f => ({
          name: f.name,
          dataTypeID: f.dataTypeID
        })),
        rows: result.rows,
        command: result.command,
        duration: `${endTime}ms`
      };
      
      // For EXPLAIN ANALYZE, format the output as text
      if (explainAnalyze) {
        // EXPLAIN ANALYZE typically returns rows with a single column containing the execution plan
        const explainOutput = result.rows.map(row => row[Object.keys(row)[0]]).join('\n');
        
        return {
          content: [
            { 
              type: "text", 
              text: `Query execution plan generated in ${endTime}ms.` 
            },
            {
              type: "text",
              text: explainOutput
            }
          ]
        };
      } else {
        // Regular query results
        return {
          content: [
            { 
              type: "text", 
              text: `Query executed successfully in ${endTime}ms.` 
            },
            {
              type: "text",
              text: JSON.stringify(formattedResults, null, 2)
            }
          ]
        };
      }
    } catch (error) {
      // Handle query errors
      return {
        content: [
          { 
            type: "text", 
            text: `Error executing query: ${error instanceof Error ? error.message : String(error)}` 
          }
        ],
        isError: true,
      };
    } finally {
      client.release();
    }
  }
);

// Add a new resource for cluster metadata
server.resource(
  "cluster-metadata",
  new ResourceTemplate("postgres://{host}/cluster-metadata/{resource}", { 
    list: async () => {
      return {
        resources: [
          {
            uri: `postgres://${resourceBaseUrl.host}/cluster-metadata/nodes`,
            name: "Cluster node metadata, store information, topology, metric snapshots, etc.",
            mimeType: "application/json"
          }
        ]
      };
    }
  }),
  async (uri, params) => {
    // Check if auth token is provided
    if (!authToken) {
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({ error: "Auth token is required for accessing cluster metadata" }, null, 2),
          mimeType: "application/json"
        }]
      };
    }

    try {
      // Extract the resource name from params
      const { resource } = params;
      
      if (resource === 'nodes') {
        // Make HTTP request to the CockroachDB admin UI API
        const apiUrl = `http://${resourceBaseUrl.hostname}:8080/_status/nodes_ui`;
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Cookie': `session="${authToken},system"; tenant=system`
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(data, null, 2),
            mimeType: "application/json"
          }]
        };
      } else {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({ error: `Unknown resource: ${resource}` }, null, 2),
            mimeType: "application/json"
          }]
        };
      }
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({ 
            error: `Failed to fetch cluster metadata: ${error instanceof Error ? error.message : String(error)}` 
          }, null, 2),
          mimeType: "application/json"
        }]
      };
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
