const conf = require('./config')
const db = require('./db');
const ad = require('./admin');
const google = require('./google');
const googleapis = require('googleapis').google;
const {promisify} = require('util');
const WebSocket = require('ws');
const url = require('url');
const http = require('http');
const uuid = require('uuid/v4');
const fs = require('fs');

var wss,https

async function init(){
  await sleep(1000)
  await Promise.all([
    db.init(),
    wsSetup(),
    httpsSetup()
  ])
}
function wsSetup(){
  return new Promise((r,rj)=>{
    wss = new WebSocket.Server({noServer:true})
    wss.on('connection', session)
    console.log("RECORDS, LOGGING: Websockets ready");
  })
}
function httpsSetup(){
  return new Promise((r,rj)=>{
    https = http.createServer(httpRequest).listen(9876)
    https.on('upgrade', (req, sock, head)=>{
      wss.handleUpgrade(req, sock, head, (ws)=>{
        wss.emit('connection', ws, req)
      })
    })
    r()
  })
}
async function session(ws){
  await sleep(200)
  var auth = await google.prepare(ws)
  var peopleAPI = googleapis.people({
    version: 'v1',
    auth:auth.auth
  })
  var classroomAPI = googleapis.classroom({
    version: 'v1',
    auth:auth.auth
  })
  var user = await peopleAPI.people.get({resourceName:'people/me',personFields:'emailAddresses,names'})
  console.log(`RECORDS, LOGGING: User ${user.data.names[0].displayName} has connected with email ${user.data.emailAddresses[0].value}.`);
  var userQuery = await db.getUserByAddress(user.data.emailAddresses[0].value)
  var userID, address, name, admin
  if(userQuery != undefined){
    userID = userQuery[0]
    address = userQuery[1]
    name = userQuery[2]
    admin = userQuery[3] == 1
  } else {
    userID = uuid()
    admin = false // To make a user admin, run `UPDATE users SET admin=b'1' WHERE address='email';`
    var addUserQuery = await db.addUser(userID, user.data.emailAddresses[0].value, user.data.names[0].displayName)
    address = user.data.emailAddresses[0].value
    name = user.data.names[0].displayName
  }
  ws.send(JSON.stringify({
    action:"ready",
    name:name,
    email:address,
    balance:db.getBalance(userID)
  }))
  ws.on('message', async (stringMessage)=>{
    var message = JSON.parse(stringMessage)
        switch (message.action) {
          case "getBalance":
            {
              var balance = await db.getBalance(userID)
              ws.send(JSON.stringify({
                action: "balance",
                balance: balance
              }))
              break;
            }
          case "sendCoin":{
            var targetAddress = message.target
            var isBalanceSufficient
            var target
            await Promise.all([
              new Promise(async (r,rj)=>{
                var balance = await db.getBalance(userID)
                isBalanceSufficient = balance > message.amount
                r()
              }),
              new Promise(async (r,rj)=>{
                target = await db.getUserByAddress(targetAddress)
                r()
              })
            ])
            console.log(isBalanceSufficient);
            if (message.amount !== parseInt(message.amount, 10) || !/[A-Za-z0-9]*\@[A-Za-z0-9]*\.[a-z]{3}/.test(message.target)) {
              ws.send(JSON.stringify({
                action:"sendResponse",
                status:"badInput"
              }))
            }
            else if(isBalanceSufficient && target != undefined){
              await db.addTransaction(userID, target[0], message.amount)
              ws.send(JSON.stringify({
                action:"sendResponse",
                status:"ok"
              }))
            } else if (target == undefined) {
              ws.send(JSON.stringify({
                action:"sendResponse",
                status:"nonexistentTarget"
              }))
            } else if (!isBalanceSufficient) {
              ws.send(JSON.stringify({
                action:"sendResponse",
                status:"insufficientBalance"
            }))
            }
            break;
          }
          case "mintCoin":{
            if (message.amount !== parseInt(message.amount, 10)) {
              ws.send(JSON.stringify({
                action:"sendResponse",
                status:"badInput"
              }))
            }
            else if(admin){
              await db.addTransaction('nobody', userID, message.amount)
              ws.send(JSON.stringify({
                action: "mintResponse",
                status: "ok"
              }))
            } else {
              ws.send(JSON.stringify({
                action: "mintResponse",
                status: "denied"
              }))
              console.log(`RECORDS, WARNING: UNAUTHORIZED USER ${name} ATTEMPTS TO MINT ${message.amount}`);
            }
            break;
          }
          case "voidCoin":{
            if (message.amount !== parseInt(message.amount, 10)) {
              ws.send(JSON.stringify({
                action:"sendResponse",
                status:"badInput"
              }))
            }
            else if(admin){
              await db.addTransaction(userID, 'nobody', message.amount)
              ws.send(JSON.stringify({
                action: "voidResponse",
                status: "ok"
              }))
            } else {
              ws.send(JSON.stringify({
                action: "voidResponse",
                status: "denied"
              }))
              console.log(`RECORDS, WARNING: UNAUTHORIZED USER ${name} ATTEMPTS TO VOID ${message.amount}`);
            }
            break;
          }
          case "getClasses":{
            var result = await google.getCourses(classroomAPI)
            if(result.err){
              ws.send(JSON.stringify({
                action:"getClassesResponse",
                status:"ServerError",
                err:result.err
              }))
            } else {
              var courses = result.res.data.courses
              if(courses && courses.length){
                ws.send(JSON.stringify({
                  action:"getClassesResponse",
                  status:"ok",
                  classes:courses
                }))
              }
            }
            break;
          }
          case "getStudents":{
            var result = await google.getStudents(classroomAPI, message.classID)
            if(result.err){
              ws.send(JSON.stringify({
                action:"getStudentsResponse",
                status:"ServerError",
                err:result.err
              }))
            } else {
              console.log(result.res.data);
              var students = result.res.data.students
              ws.send(JSON.stringify({
                action:"getStudentsResponse",
                status:"ok",
                students:students
              }))
            }
            break;
          }
          case "oauthInfo":{}
          case "elevate":{
            if(!admin){
              console.log(`RECORDS, WARNING: UNAUTHORIZED USER ${name} ATTEMPTS ELEVATED ACTION ${message.procedure} WITH BODY ${message.body}`);
              ws.send(JSON.stringify({
                action: "elevateResponse",
                status: "denied"
              }))
              return;
            } else {
              console.log(`RECORDS, LOGGING: USER ${name} EXECUTES ELEVATED ACTION ${message.procedure} WITH BODY ${message.body}`);
              ad.handle(message, ws).catch((re)=>{
                ws.send(JSON.stringify({
                  action: "elevateResponse",
                  status: "error",
                  contents:re
                }))
              })
            }
            break;
          }
          default:
            console.error(`RECORDS, WARNING: User ${name} attempts invalid action.`);
        }
  })
  ws.on('close', async ()=>{
    console.log(`RECORDS, LOGGING: User ${name} has disconnected.`);
  })
}
async function httpRequest(req, res){
  console.log(`RECORDS, LOGGING: HTTP request for ${req.url}`);
  if(req.url.startsWith("/oauth")){
    google.callback(req, res)
  }
  else if(req.url.includes("stage1.js")){
    res.writeHead(200)
    res.end(fs.readFileSync('clientjs/stage1.js'))
  }
  else if(req.url.includes("stage2.js")){
    res.writeHead(200)
    res.end(fs.readFileSync('clientjs/stage2.js'))
  }
  else if(req.url.startsWith("/app")){
    console.log("RECORDS, PROBLEM: You've incorrectly proxied the app path.");
  }
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

init()
