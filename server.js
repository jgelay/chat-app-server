import MongoClient from 'mongodb';
import express from 'express';
import bcrypt from 'bcrypt';
import session from 'express-session';
import flash from 'express-flash';
import cors from 'cors';
import passport from 'passport';
import pg from 'pg';
import expressWs from 'express-ws';
import initializePassport from './passport-config.js';
import * as serveroperations from './server-crud-config.js'
import util from 'util';


const servers = [];
const url = 'mongodb://127.0.0.1:27017';
var db = null;
var servercollection = null;
var clientcollection = null;
var messagecollection = null;
var channelcollection = null;

const getUniqueID = () => {
    const s4 = () => Math.floor((1+ Math.random()) * 0x10000).toString(16).substring(1);
    return s4() + s4() + '-' + s4();
}


//Connect to the Postgres DB
const app = express();
expressWs(app);
const pgclient = new pg.Client({
    host: 'localhost', // server name or IP address;
    port: 5432,
    database: 'mydb',
    user: 'postgres',
    password: ''
});
pgclient.connect();

MongoClient.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}, (err,client) => {
    if (err) {
        return console.log(err);
    }

    db = client.db('chatrDB');
    servercollection = db.collection('_servers');
    channelcollection = db.collection('_channels');
    clientcollection = db.collection('_clients');
    messagecollection = db.collection('_messages');
    serveroperations.initializeServerArray(servercollection, servers);
    console.log("Mongo Collections retrieved"); 
});

//initializing PassportJS
initializePassport(passport, async username => {
    try {
        const text = 'SELECT * FROM client_info WHERE username = $1';
        const value = [username];
        const resp = await pgclient.query(text,value);
        return resp.rows[0];
    } catch (err) {
        console.log(err.stack);
    }
}, async userid => {
    try {
        const text = 'SELECT * FROM client_info WHERE userid = $1';
        const value = [userid];
        const resp = await pgclient.query(text,value);
        return resp.rows[0];
    } catch (err) {
        console.log(err.stack);
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}))
app.use(flash())
app.use(session({
    secret: "secretcode",
    resave: false,
    saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

app.post("/Login", passport.authenticate('local', {
    failureFlash: true,
}), (req,res) =>  {
    if (req.isAuthenticated()){
        serveroperations.initializeClientDocumentation(clientcollection, servercollection,  res, req.user.userid, req.user.serverid)
    }
})

//Insert client information to the postgres DB after registering to the web-app
app.post("/Register", async (req, res) => {
    try {
        const text = 'INSERT INTO client_info(username, password, email, createdat, lastchange, userid) VALUES($1, $2, $3, $4, $5, $6) RETURNING *'
        const hashedPassword = await bcrypt.hash(req.body.password, 10)
        const formatYmd = date => date.toISOString().slice(0, 10);
        const todayDate = formatYmd(new Date());
        const userID = getUniqueID();
        const values = [req.body.username, hashedPassword, req.body.email, todayDate, todayDate, userID]
        const resp = await pgclient.query(text, values);
        console.log(resp.rows[0]);

        const client = {
            userid: userID,
            username: req.body.username,
            servers: {},
        }
        await clientcollection.insertOne(client);

        res.sendStatus(201);
    } catch (err) {
        console.log(err.stack);
    }
})

app.post("/InvitedToServer", async (req, res) => {
    console.log("Hello from InvitedToServer")
    //console.log("Req: " + util.inspect(req.body.invitelink))
    try {
        const text = 'SELECT serverid from invite_links WHERE invitelink = $1'
        const values = [req.body.invitelink]
        console.log("Invite Link: " + req.body.invitelink)
        const resp = await pgclient.query(text, values);
        const serverid = (resp.rows[0].serverid);
        if (serverid === '') {
            res.status(200).send("Server not found")
        } else {
            if (req.isAuthenticated()) {
                console.log("Session is still active")
                console.log("Req session.userid: " + req.user.userid + " Req session.username: " + req.user.username)
                serveroperations.addMemberToServer(servercollection,clientcollection,serverid,req.user.userid,req.user.username)
                res.status(200).send("Invite accepted")
            } else {
                res.status(200).send("No valid session exists")
            }
        }
    } catch (err) {
        console.log(err)
    }
})

app.get("/Session", (req,res) =>  {
    if (req.isAuthenticated()) {
        res.status(200).send("Session is still active")
    } else {
        res.status(200).send("No valid session exists")
    }
})

app.get("/server/:serverid", (req,res) => {
    if (req.isAuthenticated()){
        serveroperations.getServer(clientcollection, servercollection, messagecollection, res, req.user.userid, req.params.serverid);
    }
})

app.get("/server/:serverid/:channelid", (req,res) => {
    console.log("Changed channel requested")
    console.log(req.params.channelid)
    if (req.isAuthenticated()) {
        serveroperations.getChannel(messagecollection, res, 12, req.params.channelid);
    }
})

app.post("/server/:serverid/:channelname", (req,res) => {
    if (req.isAuthenticated()) {
        serveroperations.createNewChannel(servercollection, res, req.params.serverid, req.params.channelname, getUniqueID);
    }
})

app.post("/server/:servername", (req,res) => {
    if (req.isAuthenticated()) {
        serveroperations.createNewServer(servercollection, clientcollection, res, servers, req.params.servername, req.user.userid, req.user.username, getUniqueID, pgclient);
    }
})

app.post('/logout', function (req, res) {
    req.logout();
    res.status(200).send("Logged out successfully");
})

app.on('upgrade', async function(request) {
    console.log(request);
})

app.ws('/', function(ws, req) {
    if (req.isAuthenticated()){
        serveroperations.addConnectionToServer(clientcollection, ws, servers, req.user.userid)
    } else {
        ws.close()
    }

    ws.on('message', function(message) {
        const dataFromClient = JSON.parse(message);
        if (dataFromClient.type === "createchannel") {
            serveroperations.createNewChannel(servercollection, channelcollection, ws, dataFromClient.serverid, req.user.userid, dataFromClient.channel, getUniqueID);
        } else if (dataFromClient.type === "deleteserver") {
            serveroperations.deleteServer(clientcollection, servercollection, servers, dataFromClient.serverid, req.user.userid);
        } else if (dataFromClient.type === "deletechannel") {
            serveroperations.deleteChannel(servercollection, servers, dataFromClient.serverid, dataFromClient.channelid)
        } else if (dataFromClient.type === "message") {
            serveroperations.sendMessage(messagecollection, servers, dataFromClient.serverid, dataFromClient.channelid, req.user.userid, req.user.username, dataFromClient.message);
        } else if (dataFromClient.type == "getinvite") {
            serveroperations.getInvite(ws, dataFromClient.serverid, req.user.userid, pgclient)
        }
    });
    //console.log('socket', req.isAuthenticated());
  });
  
app.listen(8000);





