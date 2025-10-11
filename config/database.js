const { MongoClient } = require('mongodb');
require('dotenv').config({ path: './config.env' });

class Database {
  constructor() {
    this.client = null;
    this.db = null;
  }

  async connect() {
    try {
      this.client = new MongoClient(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });

      await this.client.connect();
      this.db = this.client.db(process.env.MONGODB_DB);
      
      console.log('✅ [Notification Service] MongoDB connected successfully');
    } catch (error) {
      console.error('❌ [Notification Service] MongoDB connection failed:', error.message);
      throw error;
    }
  }

  async query(collection, operation, ...args) {
    try {
      const col = this.db.collection(collection);
      return await col[operation](...args);
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  // SQL query method for Frappe database queries
  async sqlQuery(sqlString, params = []) {
    try {
      // Use MySQL connection to Frappe database
      const mysqlConnection = require('./mysqlConnection');
      return await mysqlConnection.query(sqlString, params);
    } catch (error) {
      console.error('SQL query error:', error);
      throw error;
    }
  }

  // MongoDB-style methods
  async insert(collection, doc) {
    const result = await this.query(collection, 'insertOne', doc);
    return result.insertedId;
  }

  async update(collection, filter, update) {
    return await this.query(collection, 'updateOne', filter, { $set: update });
  }

  async get(collection, filter, options = {}) {
    return await this.query(collection, 'findOne', filter, options);
  }

  async getAll(collection, filter = {}, options = {}) {
    const cursor = await this.query(collection, 'find', filter, options);
    return await cursor.toArray();
  }

  async delete(collection, filter) {
    return await this.query(collection, 'deleteOne', filter);
  }

  async exists(collection, filter) {
    const count = await this.query(collection, 'countDocuments', filter);
    return count > 0;
  }

  // Frappe-compatible methods for backward compatibility
  async insertDoc(doctype, doc) {
    return await this.insert(doctype, doc);
  }

  async updateDoc(doctype, name, doc) {
    return await this.update(doctype, { name }, doc);
  }

  async getDoc(doctype, name, fields = null) {
    const options = fields ? { projection: fields } : {};
    return await this.get(doctype, { name }, options);
  }

  async getAllDocs(doctype, filters = {}, fields = null, sort = null, limit = null) {
    const options = {};
    if (fields) options.projection = fields;
    if (sort) options.sort = sort;
    if (limit) options.limit = limit;
    
    return await this.getAll(doctype, filters, options);
  }

  async deleteDoc(doctype, name) {
    return await this.delete(doctype, { name });
  }

  async existsDoc(doctype, filters) {
    return await this.exists(doctype, filters);
  }
}

module.exports = new Database();