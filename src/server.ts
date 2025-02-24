import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { 
  getAllTables, 
  getTableSchema, 
  getTableDetails, 
  executeQuery,
  getTableStats 
} from "./db.js";

async function main() {
  // Create MCP server
  const server = new McpServer({
    name: "CockroachDB-MCP",
    version: "1.0.0"
  });

  // =========================================================
  // RESOURCES: Expose table schemas and information
  // =========================================================
  
  // List all tables
  server.resource(
    "tables-list",
    "db://tables",
    async (uri) => {
      try {
        const tables = await getAllTables();
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(tables, null, 2),
            mimeType: "application/json"
          }]
        };
      } catch (error: any) {
        console.error("Error fetching tables:", error);
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching tables: ${error.message}`,
            mimeType: "text/plain"
          }]
        };
      }
    }
  );

  // Resource template for table schemas
  server.resource(
    "table-schema",
    new ResourceTemplate("db://tables/{tableName}/schema", { 
      list: async () => {
        const tables = await getAllTables();
        return tables.map(tableName => ({ tableName }));
      }
    }),
    async (uri, { tableName }) => {
      try {
        const schema = await getTableSchema(tableName);
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(schema, null, 2),
            mimeType: "application/json"
          }]
        };
      } catch (error: any) {
        console.error(`Error fetching schema for ${tableName}:`, error);
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching schema for ${tableName}: ${error.message}`,
            mimeType: "text/plain"
          }]
        };
      }
    }
  );

  // Resource template for detailed table information
  server.resource(
    "table-details",
    new ResourceTemplate("db://tables/{tableName}/details", { 
      list: async () => {
        const tables = await getAllTables();
        return tables.map(tableName => ({ tableName }));
      }
    }),
    async (uri, { tableName }) => {
      try {
        const details = await getTableDetails(tableName);
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(details, null, 2),
            mimeType: "application/json"
          }]
        };
      } catch (error: any) {
        console.error(`Error fetching details for ${tableName}:`, error);
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching details for ${tableName}: ${error.message}`,
            mimeType: "text/plain"
          }]
        };
      }
    }
  );

  // Resource for table statistics
  server.resource(
    "table-stats",
    new ResourceTemplate("db://tables/{tableName}/stats", { 
      list: async () => {
        const tables = await getAllTables();
        return tables.map(tableName => ({ tableName }));
      }
    }),
    async (uri, { tableName }) => {
      try {
        const stats = await getTableStats(tableName);
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(stats, null, 2),
            mimeType: "application/json"
          }]
        };
      } catch (error: any) {
        console.error(`Error fetching stats for ${tableName}:`, error);
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching stats for ${tableName}: ${error.message}`,
            mimeType: "text/plain"
          }]
        };
      }
    }
  );

  // =========================================================
  // TOOLS: Provide read-only SQL queries
  // =========================================================
  
  // Tool to execute a simple query
  server.tool(
    "execute-query",
    "Execute a read-only SQL query",
    {
      query: z.string().describe("The SQL query to execute. Must be read-only (SELECT only).")
    },
    async ({ query }) => {
      // Validate this is a SELECT query for safety
      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery.startsWith('select')) {
        return {
          content: [{
            type: "text",
            text: "Error: Only SELECT queries are allowed for security reasons."
          }],
          isError: true
        };
      }

      try {
        const results = await executeQuery(query);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error executing query: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool to get sample data from a table
  server.tool(
    "get-sample-data",
    "Get a sample of data from a table",
    {
      tableName: z.string().describe("The name of the table"),
      limit: z.number().default(10).describe("Maximum number of rows to return (default 10)"),
      orderBy: z.string().optional().describe("Optional column to order by")
    },
    async ({ tableName, limit, orderBy }) => {
      try {
        // Sanitize table name to prevent SQL injection
        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          throw new Error("Invalid table name");
        }
        
        let query = `SELECT * FROM "${tableName}"`;
        
        // Add optional ORDER BY clause if provided
        if (orderBy) {
          if (!/^[a-zA-Z0-9_]+$/.test(orderBy)) {
            throw new Error("Invalid order by column");
          }
          query += ` ORDER BY "${orderBy}"`;
        }
        
        query += ` LIMIT ${limit}`;
        
        const results = await executeQuery(query);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text", 
            text: `Error fetching sample data: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool to count rows in a table
  server.tool(
    "count-rows",
    "Count the number of rows in a table",
    {
      tableName: z.string().describe("The name of the table"),
      whereClause: z.string().optional().describe("Optional WHERE condition")
    },
    async ({ tableName, whereClause }) => {
      try {
        // Sanitize table name to prevent SQL injection
        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          throw new Error("Invalid table name");
        }
        
        let query = `SELECT COUNT(*) as count FROM "${tableName}"`;
        
        // Add WHERE clause if provided
        if (whereClause) {
          query += ` WHERE ${whereClause}`;
        }
        
        const results = await executeQuery(query);
        return {
          content: [{
            type: "text",
            text: `Table ${tableName} has ${results[0].count} rows${whereClause ? ' matching the condition' : ''}.`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error counting rows: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool to get basic statistics for a column
  server.tool(
    "column-stats",
    "Get basic statistics about a column",
    {
      tableName: z.string().describe("The name of the table"),
      columnName: z.string().describe("The name of the column to analyze")
    },
    async ({ tableName, columnName }) => {
      try {
        // Sanitize inputs to prevent SQL injection
        if (!/^[a-zA-Z0-9_]+$/.test(tableName) || !/^[a-zA-Z0-9_]+$/.test(columnName)) {
          throw new Error("Invalid table or column name");
        }
        
        // Get column type first to determine appropriate statistics
        const schemaQuery = `
          SELECT data_type 
          FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        `;
        const schemaResult = await executeQuery(schemaQuery, [tableName, columnName]);
        
        if (schemaResult.length === 0) {
          throw new Error(`Column ${columnName} not found in table ${tableName}`);
        }
        
        const dataType = schemaResult[0].data_type;
        
        // Create appropriate statistics based on data type
        let statsQuery;
        if (dataType.includes('int') || dataType.includes('float') || dataType.includes('decimal') || dataType.includes('numeric')) {
          statsQuery = `
            SELECT 
              COUNT("${columnName}") as count,
              AVG("${columnName}") as mean,
              MIN("${columnName}") as min,
              MAX("${columnName}") as max,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "${columnName}") as median
            FROM "${tableName}"
            WHERE "${columnName}" IS NOT NULL
          `;
        } else if (dataType.includes('date') || dataType.includes('time')) {
          statsQuery = `
            SELECT 
              COUNT("${columnName}") as count,
              MIN("${columnName}") as min,
              MAX("${columnName}") as max
            FROM "${tableName}"
            WHERE "${columnName}" IS NOT NULL
          `;
        } else {
          // For strings and other types
          statsQuery = `
            SELECT 
              COUNT("${columnName}") as count,
              COUNT(DISTINCT "${columnName}") as distinct_count,
              MAX(LENGTH("${columnName}")) as max_length
            FROM "${tableName}"
            WHERE "${columnName}" IS NOT NULL
          `;
        }
        
        const statsResult = await executeQuery(statsQuery);
        
        // Add null count
        const nullQuery = `
          SELECT COUNT(*) as null_count
          FROM "${tableName}"
          WHERE "${columnName}" IS NULL
        `;
        const nullResult = await executeQuery(nullQuery);
        
        // Combine results
        const stats = {
          ...statsResult[0],
          null_count: nullResult[0].null_count,
          data_type: dataType
        };
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(stats, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error getting column statistics: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // =========================================================
  // PROMPTS: Common data analysis tasks
  // =========================================================
  
  // Prompt for data exploration
  server.prompt(
    "explore-table",
    "Generate a prompt to explore a database table",
    {
      tableName: z.string().describe("The name of the table to explore")
    },
    async ({ tableName }) => {
      try {
        const schema = await getTableSchema(tableName);
        const sampleDataQuery = `SELECT * FROM "${tableName}" LIMIT 5`;
        const sampleData = await executeQuery(sampleDataQuery);
        const stats = await getTableStats(tableName);
        
        const schemaText = JSON.stringify(schema, null, 2);
        const sampleDataText = JSON.stringify(sampleData, null, 2);
        const statsText = JSON.stringify(stats, null, 2);
        
        return {
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `I want to explore the "${tableName}" table in my CockroachDB database. Here's the schema:\n\n${schemaText}\n\nHere's a sample of the data:\n\n${sampleDataText}\n\nTable Statistics:\n${statsText}\n\nPlease help me understand this data, identify key patterns, and suggest some useful analyses I could perform. What insights can I derive from this table?`
            }
          }]
        };
      } catch (error: any) {
        return {
          messages: [{
            role: "user", 
            content: {
              type: "text",
              text: `I wanted to explore the "${tableName}" table but encountered an error: ${error.message}. Can you suggest how I might troubleshoot this issue?`
            }
          }]
        };
      }
    }
  );

  // Prompt for query generation
  server.prompt(
    "generate-query",
    "Generate a prompt to get help writing an SQL query",
    {
      objective: z.string().describe("What you want to achieve with the query")
    },
    async ({ objective }) => {
      try {
        const tables = await getAllTables();
        const tableListText = tables.join(", ");
        
        // Get schema information for each table
        const tableSchemas = await Promise.all(
          tables.map(async (table) => {
            const schema = await getTableSchema(table);
            return { table, columns: schema };
          })
        );
        
        const schemaText = JSON.stringify(tableSchemas, null, 2);
        
        return {
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `I need help writing a SQL query for CockroachDB to ${objective}.\n\nAvailable tables: ${tableListText}\n\nHere are the schemas for these tables:\n\n${schemaText}\n\nCan you help me write an efficient query for this purpose? Please explain your approach step by step and consider CockroachDB's performance characteristics.`
            }
          }]
        };
      } catch (error: any) {
        return {
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `I need help writing a SQL query for CockroachDB to ${objective}. However, I encountered an error when trying to get table information: ${error.message}. Can you still help me outline an approach based on the objective?`
            }
          }]
        };
      }
    }
  );

  // Prompt for data analysis
  server.prompt(
    "analyze-query-results",
    "Generate a prompt to analyze query results",
    {
      query: z.string().describe("The SQL query you want to analyze"),
      analysisGoal: z.string().describe("What you want to learn from this data")
    },
    async ({ query, analysisGoal }) => {
      // Only attempt to run the query if it's a SELECT statement
      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery.startsWith('select')) {
        return {
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `I want to analyze the results of this query: \`${query}\` to ${analysisGoal}. However, for security reasons, this prompt can only run SELECT queries. Can you help me modify this query to be read-only while still achieving my analysis goals?`
            }
          }]
        };
      }
      
      try {
        const results = await executeQuery(query);
        const resultsText = JSON.stringify(results, null, 2);
        
        return {
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `I ran this SQL query against my CockroachDB database:\n\n\`\`\`sql\n${query}\n\`\`\`\n\nAnd got these results:\n\n\`\`\`json\n${resultsText}\n\`\`\`\n\nI want to ${analysisGoal}. Can you analyze these results and provide insights? Please include observations about patterns, anomalies, and potential business implications of this data.`
            }
          }]
        };
      } catch (error: any) {
        return {
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `I tried to run this query: \`${query}\` to ${analysisGoal}, but I got this error: ${error.message}. Can you help me fix this query? I'm using CockroachDB, which is PostgreSQL-compatible.`
            }
          }]
        };
      }
    }
  );

  // Prompt for performance optimization
  server.prompt(
    "optimize-query",
    "Generate a prompt to optimize a SQL query",
    {
      query: z.string().describe("The SQL query you want to optimize")
    },
    async ({ query }) => {
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `I need to optimize this CockroachDB query for better performance:\n\n\`\`\`sql\n${query}\n\`\`\`\n\nCan you analyze this query and suggest optimizations? Please consider:\n\n1. Index usage and potential new indexes\n2. Query structure and JOINs\n3. WHERE clause optimizations\n4. CockroachDB-specific optimizations\n5. Any other potential performance improvements`
          }
        }]
      };
    }
  );

  // Connect the server to the stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CockroachDB MCP Server running on stdio");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});

