const mysql = require('mysql2/promise');
require('dotenv').config({ path: './config.env' });

class MySQLConnection {
  constructor() {
    this.pool = null;
  }

  async connect() {
    try {
      this.pool = mysql.createPool({
        host: process.env.FRAPPE_DB_HOST || '172.16.20.130',
        user: process.env.FRAPPE_DB_USER || 'root',
        password: process.env.FRAPPE_DB_PASSWORD || 'YUDRy6bmrtxF2Xlw',
        database: process.env.FRAPPE_DB_NAME || '_2e0c5564d1360251',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        multipleStatements: false,
        timezone: '+07:00'
      });

      // Test connection
      const connection = await this.pool.getConnection();
      console.log('✅ [Notification Service] MySQL Frappe DB connected successfully');
      connection.release();
    } catch (error) {
      console.error('❌ [Notification Service] MySQL Frappe DB connection failed:', error.message);
      throw error;
    }
  }

  async query(sql, params = []) {
    try {
      if (!this.pool) {
        console.error('❌ [MySQL] Connection pool not initialized');
        return [];
      }

      console.log(`🔍 [MySQL] Executing query: ${sql}`);
      console.log(`🔍 [MySQL] Params:`, params);

      const [rows] = await this.pool.execute(sql, params);
      
      console.log(`✅ [MySQL] Query result: ${rows.length} row(s)`);
      return rows;
    } catch (error) {
      console.error('❌ [MySQL] Query error:', error.message);
      throw error;
    }
  }

  async end() {
    if (this.pool) {
      await this.pool.end();
      console.log('🔌 [MySQL] Connection pool closed');
    }
  }
}

module.exports = new MySQLConnection();

