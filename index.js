const conf = require('./config')
const db = require('./db');
const {promisify} = require('util');
const WebSocket = require('ws');
const url = require('url');
const oauthKeys = require('./oauth_info') // This won't be in the repository; make your own keys in the Google Developer Console.
const oauthScopes = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]
const http = require('http');
const uuid = require('uuid/v4');
const {google} = require('googleapis');
const fs = require('fs');
// Nothing happens yet
