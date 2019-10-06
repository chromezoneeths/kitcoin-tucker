const conf = require('./config')
const db = require('./db');
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
    console.log("WebSocket server ready");
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
  console.log("New session, waiting 100 ms");
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
  console.log(`User ${user.data.names[0].displayName} has connected with email ${user.data.emailAddresses[0].value}.`);
  var userQuery = await db.getUserByAddress(user.data.emailAddresses[0].value)
  var userID, address, name, admin
  if(userQuery != undefined){
    console.log("This user already exists in the users table.");
    console.log(userQuery);
    userID = userQuery[0]
    address = userQuery[1]
    name = userQuery[2]
    admin = userQuery[3] == 1
  } else {
    console.log("This user is absent from the users table. Adding them...");
    userID = uuid()
    admin = false // To make a user admin, run `UPDATE users SET admin=b'1' WHERE address='email';`
    var addUserQuery = await db.addUser(userID, user.data.emailAddresses[0].value, user.data.names[0].displayName)
    address = user.data.emailAddresses[0].value
    name = user.data.names[0].displayName
    console.log("Done");
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
          default:
            console.error("Received invalid action call.");
        }
  })
}
async function httpRequest(req, res){
  console.log(`HTTP request for ${req.url}`);
  if(req.url.startsWith("/oauth")){
    console.log("This request looks like an OAuth callback.");
    google.callback(req, res)
    // const qs = new url.URL(req.url, conf.oauthCallbackUrl)
    //       .searchParams;
    // for(var i in pendingOAuthCallbacks){
    //   if(pendingOAuthCallbacks[i].id == qs.get(`uuid`)){
    //     console.log(`Received login message ${pendingOAuthCallbacks[i].id}`);
    //     const {tokens} = await pendingOAuthCallbacks[i].client.getToken(qs.get('code'));
    //     res.writeHead(200)
    //     res.end("<script>setTimeout(()=>{window.close()},300)</script>")
    //     pendingOAuthCallbacks[i].client.credentials = tokens
    //     pendingOAuthCallbacks[i].reslve({auth:pendingOAuthCallbacks[i].client})
    //   }
    // }
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
    console.log("You've incorrectly proxied the app path to the backend. This is a bug.");
  }
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

init()
