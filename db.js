// This file contains abstractions for database calls. It should do any injection filtering.
const sqllib = require('@mysql/xdevapi');
const conf = require('./config')
const uuid = require('uuid/v4');
var client
exports.init = ()=>{
  return new Promise(async (r,rj)=>{
    console.log("Connecting to " + conf.dbIP);
    client = sqllib.getClient(
      { user:conf.dbUser, password:conf.dbPassword, host:conf.dbIP, port: conf.dbPort },
      { pooling: { enabled: true, maxIdleTime: 30000, maxSize: 25, queueTimeout: 10000 } }
    )
    var sess = await client.getSession()
    await sess.sql("CREATE SCHEMA IF NOT EXISTS kitcoin;").execute()
    await sess.sql("USE kitcoin").execute()
    await Promise.all([
      sess.sql(`CREATE TABLE IF NOT EXISTS transactions (uuid VARCHAR(36), sender VARCHAR(96), recipient VARCHAR(96), amount INTEGER)`).execute(),
      sess.sql(`CREATE TABLE IF NOT EXISTS users (uuid VARCHAR(36), address VARCHAR(96), name VARCHAR(128), admin BIT(1), teacher BIT(1), vendor BIT(1))`).execute()
    ])
    console.log("Done initializing database.");
    sess.close()
    r()
  })
}
exports.addUser = (id, address, name)=>{
  return new Promise(async (r,rj)=>{
    var sess = await client.getSession()
    await sess.sql('USE kitcoin').execute()
    await sess.sql(`INSERT INTO users (uuid,address,name) VALUES ('${id}','${address}','${name}')`).execute()
    sess.close()
    r()
  })
}
exports.addTransaction = (sender, recipient, amount)=>{
  return new Promise(async (r,rj)=>{
    var sess = await client.getSession()
    await sess.sql("use kitcoin").execute()
    await sess.sql(`INSERT INTO transactions (uuid, sender, recipient, amount) VALUES ('${uuid()}', '${sender}', '${recipient}', '${amount}')`).execute()
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
    sess.close()
    r(balance)
  })
}
exports.getUserByAddress = (address)=>{
  return new Promise(async (r,rj)=>{
    var sess = await client.getSession()
    var users = sess.getSchema('kitcoin').getTable("users")
    await users.select().where(`address='${address}'`).execute((i)=>{
      r(i)
      return
    })
    r()
  })
}
exports.getUserByID = (uuid)=>{
  return new Promise(async (r,rj)=>{
    var sess = await client.getSession()
    var users = sess.getSchema('kitcoin').getTable("users")
    await users.select().where(`uuid='${uuid}'`).execute((i)=>{
      r(i)
    })
    r()
  })
}
