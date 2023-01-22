import util from 'util';

export async function initializeServerArray(servercollection, servers) {
    const cursor = servercollection.find({});
    await cursor.forEach(doc => {
        const channels = [];
        doc.channels.forEach(channel => {
            channels.push({
                channel: channel.channelid,
                members: []
            })
        })
        servers.push({server: {
            serverid: doc.serverid,
            channels: channels
        }    
        })
    });

    console.log(servers)
    console.log(servers[0].server.channels)
    return;
}

export async function initializeClientDocumentation(clientcollection, servercollection, connection, userid, serverid){
    try {
        const clientresult = await clientcollection.findOne({userid: userid});
        if (clientresult) {
            console.log("Server id: " + serverid)
            const serverresult = await servercollection.findOne({serverid: '5c69c7bd-af43'});
            clientresult.type = "initialdata";
            clientresult.status = 200;
            clientresult.server = {
                serverid: serverresult ? serverresult.serverid : '',
                servername: serverresult ? serverresult.servername : '',
            }
            clientresult.serverchannels = serverresult ? serverresult.channels: [];
            clientresult.servermembers = serverresult ? serverresult.members: [];
            console.log(clientresult);  
    
            connection.status(200).send(JSON.stringify(clientresult));
        } 
    } catch (err) {
        console.log(err.stack)
    }
    
    return;
}

export async function addConnectionToServer(clientcollection, ws, servers, userid) {
    try {
        const clientresult = await clientcollection.findOne({userid: userid})
        if (clientresult) {
            clientresult.servers.forEach(clientserver => {
                servers.forEach(server => {
                    if (server.serverid === clientserver.serverid) {
                        server.members.push(ws);
                    }
                })
            })
        }
    } catch (err) {
        console.log(err.stack)
    }
    
    return;

}

async function updateDocument(collection,filter,updateDoc,options) {
    return await collection.updateOne(filter,updateDoc,options);
}

export async function sendMessage(messagecollection, servers, serverid, channelid, senderid, sender, message) {
    const doc = {
        createdat: new Date(),
        serverid: serverid,
        channelid: channelid,
        sender: sender,
        senderid: senderid,
        message: message,
    }
    
    await messagecollection.insertOne(doc);
    console.log(doc);
    const server = servers.find(obj => {
            return obj.serverid === doc.serverid;
    })

    doc.type = "message";
    server.members.forEach(connection => {
        console.log("Server id: " + server.serverid);
        console.log("Send message: " + doc);
        connection.send(JSON.stringify(doc));
    });

    return;
}

export async function getChannel(messagecollection, connection, N, channelid) {
    const cursor = messagecollection.find({channelid:channelid}).sort({ $natural: 1 }).limit(N);
    const documents = await cursor.toArray();

    connection.status(200).send(JSON.stringify({
        type: "channelhistory",
        messages: documents,
    }))
    return;
}

export async function getServer(clientcollection, servercollection, messagecollection, connection, userid, serverid) {
    const clientresult = await clientcollection.findOne({userid: userid});
    const serverresult = await servercollection.findOne({serverid: serverid});
    const serverinfo = clientresult.servers.find(obj => {
        return obj.serverid === serverid;
    });
    const cursor = messagecollection.find({channelid:serverinfo.activechannelid}).sort({ $natural: 1 }).limit(12);;
    const documents = await cursor.toArray();

    connection.status(200).send(JSON.stringify({
        type: "serverchange",
        server: {
            serverid: serverid,
            servername: serverresult.servername,
        },
        channel: {
            channelid: serverinfo.activechannelid,
            channelname: serverinfo.activechannel,
        },
        channels: serverresult.channels,
        messages: documents,
    }))
    return;
}

export async function createNewServer(servercollection, clientcollection, connection, servers, servername, userid, username, getUniqueID, pgclient){
    try {
        const serverid = getUniqueID();
        const channelid = getUniqueID();
        const invitelink = getUniqueID();
        const query = "INSERT into invite_links(invitelink, serverid, uses, userid, createdat) VALUES($1, $2, $3, $4, $5)"
        const values = [invitelink, serverid, 1, userid, new Date()]
        const server = {
            serverid: serverid,
            servername: servername,
            ownerid: userid,
            members: [{
                username: username,
                userid: userid,
            }],
            channels: [{
                channelid: channelid,
                channelname: "#general",
            }]
        }

        await servercollection.insertOne(server);
        await clientcollection.updateOne({userid:userid},{
            $push: { 
                servers: {
                    servername: servername,
                    serverid: serverid,
                    activechannel: "#general",
                    activechannelid: channelid,
                }}
        })

        const resp = await pgclient.query(query, values);
        console.log(resp.rows[0]);
        servers.push({
            serverid: serverid,
            members: [connection],
        });

        connection.send(JSON.stringify({
            type: "servercreated",
            server: {
                serverid: serverid,
                servername: servername,
            },
            channel: {
                channelid: channelid,
                channelname: "#general",
            },
            channels: [{
                channelid: channelid,
                channelname: "#general",
            }]
        }));
    } catch (err) {
        console.log(err)
    }
    
    return;
}

export async function createNewChannel(servercollection, channelcollection, connection, serverid, userid, channelname, getUniqueID) {
    const channelid = getUniqueID();
    const channel = {
        channelid:channelid,
        channelname:channelname,
        serverid:serverid,
        members:[{
            userid: userid,
        }]
    }

    channelcollection.insertOne(channel)
    await servercollection.updateOne({serverid:serverid},
                                    {$push: {channels: {
                                                channelid:channelid,
                                                channelname:channelname}}});
    connection.send(JSON.stringify({
        type: "channelcreated",
        channel: {
            channelid: channelid,
            channelname: channelname,
        }
    }));

    return;
}

export async function deleteChannel(servercollection, servers, serverid, channelid) {
    await servercollection.updateOne({serverid:serverid},
                                        {$pull: {channels: {
                                                    channelid:channelid}}});
    console.log("Servers: " + util.inspect(servers))                                              
    const currserver = servers.find(server => server.serverid === serverid);
    console.log("Current server members: " + util.inspect(currserver))  
    currserver.members.forEach(connection => {
        connection.send(JSON.stringify({
            type:"channeldeleted",
            channelid: channelid,
        })) 
    })
    
    console.log(servers);
    return;
}

export async function deleteServer(clientcollection, servercollection, servers, serverid, userid, pgclient) {
    try {
        console.log("serverid: " + serverid + " User id: " + userid)
        await servercollection.deleteOne({serverid:serverid, ownerid:userid})
        await clientcollection.updateOne({userid: userid}, {$pull: {servers: {
                                                                    serverid: serverid}}})
                                                        
        const currserver = servers.find(server => server.serverid === serverid);
        currserver.members.forEach(connection => {
            console.log("Sending message")
            connection.send(JSON.stringify({
                type:"serverdeleted",
                serverid: serverid,
            }))
        })
        
        for (let i = 0; i < servers.length; i++) {
            if (servers[i].serverid === serverid) {
                servers.splice(i,1);
                break;
            }
        }

        const text = "DELETE FROM invite_links WHERE serverid = $1"
        const values = [serverid]
        await pgclient.query(text, values)


    } catch (err) {
        console.log(err.stack)
    }
    
    return;
}

export async function addMemberToServer(servercollection,clientcollection,serverid,userid,username) {
    console.log("Server id: " + serverid)
    try {
        await servercollection.updateOne({serverid:serverid},{
            $push: { 
                members: {
                    username: username,
                    userrid: userid,
                }}
        })

        const serverresult = await servercollection.findOne({serverid: serverid});
        const channels = serverresult.channels[0]
        console.log("Channels: " + channels)
        await clientcollection.updateOne({userid:userid},{
            $push: { 
                servers: {
                    servername: serverresult.servername,
                    serverid: serverid,
                }}
        })
    } catch (err) {
        console.log(err)
    }
    
}

export async function getInvite(connection, serverid, userid, pgclient) {
    try {
        const text = 'SELECT invitelink from invite_links WHERE serverid = $1 AND userid = $2'
        const values = [serverid, userid]
        console.log("Server id: " + serverid + " User id:" + userid)
        const resp = await pgclient.query(text, values);
        console.log(resp.rows[0].invitelink);
        connection.send(JSON.stringify({
            type: "invitelink",
            invitelink: resp.rows[0].invitelink,
        }))
    } catch (err) {
        console.log(err.stack);
    }
    
}

export async function getServerFromInvite(inviteLink, pgclient) {
    try {
        const text = 'SELECT serverid from invite_links WHERE invitelink = $1'
        const values = [inviteLink]
        console.log("Invite Link: " + inviteLink)
        const resp = await pgclient.query(text, values);
        console.log(resp.rows[0].invitelink);
        
    } catch (err) {
        console.log(err.stack);
    }
    
}