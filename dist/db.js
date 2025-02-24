import { Pool } from 'pg';
// Connection configuration
const pool = new Pool({
    user: process.env.DB_USER || 'root',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'defaultdb',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '26257'),
    ssl: process.env.DB_SSL === 'true' ? true : false,
});
// Test the connection on startup
pool.connect()
    .then(client => {
    console.error('Database connection successful');
    client.release();
})
    .catch(err => {
    console.error('Database connection error:', err);
});
// Helper function to get a client from the pool
export async function getClient() {
    return await pool.connect();
}
// Helper function to execute a query and return results
export async function executeQuery(query, params = []) {
    const client = await getClient();
    try {
        const result = await client.query(query, params);
        return result.rows;
    }
    finally {
        client.release();
    }
}
// Helper to get all table names in the database
export async function getAllTables() {
    const query = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `;
    const rows = await executeQuery(query);
    return rows.map(row => row.table_name);
}
// Get the schema for a specific table
export async function getTableSchema(tableName) {
    const query = `
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `;
    return await executeQuery(query, [tableName]);
}
// Get detailed information about a table including indexes
export async function getTableDetails(tableName) {
    // Get columns
    const columns = await getTableSchema(tableName);
    // Get indexes
    const indexQuery = `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = $1
  `;
    const indexes = await executeQuery(indexQuery, [tableName]);
    // Get primary key
    const pkQuery = `
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = $1::regclass AND i.indisprimary
  `;
    const primaryKeys = await executeQuery(pkQuery, [`public.${tableName}`]);
    return {
        columns,
        indexes,
        primaryKeys: primaryKeys.map(pk => pk.attname)
    };
}
// Get common stats for a table
export async function getTableStats(tableName) {
    // Count rows
    const countQuery = `SELECT COUNT(*) as total_rows FROM "${tableName}"`;
    const countResult = await executeQuery(countQuery);
    // Get approx size
    const sizeQuery = `SELECT pg_size_pretty(pg_total_relation_size($1)) as table_size`;
    const sizeResult = await executeQuery(sizeQuery, [`public.${tableName}`]);
    return {
        rowCount: countResult[0].total_rows,
        tableSize: sizeResult[0].table_size
    };
}
