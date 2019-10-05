// This file contains abstractions for database calls. It should do any injection filtering.
const sqllib = require('@mysql/xdevapi');
const conf = require('./config')
var client
exports.init = ()=>{
  return new Promise(async (r,rj)=>{
    client = sqllib.getClient(
      { user:conf.dbUser, host:conf.dbLocation, port: conf.dbPort },
      { pooling: { enabled: true, maxIdleTime: 30000, maxSize: 25, queueTimeout: 10000 } }
    )
    var sess = await client.getSession()
    await sess.sql("CREATE SCHEMA IF NOT EXISTS kitcoin; USE kitcoin;")
    await Promise.all([
      sess.sql(`CREATE TABLE IF NOT EXISTS transactions (uuid VARCHAR(36), sender VARCHAR(96), recipient VARCHAR(96), amount INTEGER)`).execute(),
      sess.sql(`CREATE TABLE IF NOT EXISTS users (uuid VARCHAR(36), address VARCHAR(96), name VARCHAR(128), admin BIT(1), teacher BIT(1), vendor BIT(1))`).execute()
    ])
    console.log("Done initializing database.");
    r()
  })
}
exports.getBalance = (uuid)=>{
  return new Promise(async (r,rj)=>{
    var balance = 0
    var sess = await client.getSession()
    var transactions = sess.getSchema('kitcoin').getTable("transactions")
    await Promise.all([
      transactions.select().where(`recipient='${uuid}'`).execute((doc)=>{balance += doc[3]}),
      transactions.select().where(`sender='${uuid}'`).execute((doc)=>{balance -= doc[3]})
    ])
    resolve(balance)
  })
}
exports.getUUID = (address)=>{
  return new Promise(async (r,rj)=>{
    //todo
  })
}
exports.getAddress = (uuid)=>{
  return new Promise(async (r,rj)=>{
    //todo
  })
}
