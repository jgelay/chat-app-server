import * as express from 'express';
import * as http from 'http';
import * as WebSocket  from 'ws';

const app = express();

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

wss.on('connection', function(connection) {
    connection.on()
})