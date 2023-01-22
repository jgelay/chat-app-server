function parseMessage(dataFromClient) {
    if (dataFromClient.type === "userlogin") {
        client[userID] = {
            connection: connection,
            username: dataFromClient.username,
        }
        connection.send(JSON.stringify({
            status: 200,
            type: "loginresponse",
            isAuthenticated: true,
        }))
        clients.push(connection);
    } else if (dataFromClient.type === "getInitialData") {
        initialize(clientcollection,servercollection,connection);
    } else if (dataFromClient.type === "message") {
        
        const doc = {
            createdat: new Date(),
            serverid: dataFromClient.serverid,
            channelid: dataFromClient.channelid,
            sender: client[userID].username,
            senderid: 1,
            message: dataFromClient.message,
        }

       sendMessage(messagecollection,doc);
        
    } else if (dataFromClient.type === "createChannelEvent") {
        const filter = { serverid: dataFromClient.serverid };
        const options = { upsert: false };
        const newchannel = {
            channelid: getUniqueID(),
            channelname: dataFromClient.channel,
        }

        const updateDoc = {
            $push: {
                channels: newchannel,
            }
        }
        updateDocument(servercollection,filter,updateDoc,options).then(() => {
            getDocument(servercollection,{serverid:dataFromClient.serverid}).then((getresult) =>{
                const channel = getresult.channels.filter(function(item) {return item.channelid === newchannel.channelid});
                const message = {
                    type: "newchannelcreated",
                    channelid:  channel[0].channelid,
                    channelname: channel[0].channelname,
                }
                connection.send(JSON.stringify(message))
            })
        })
    } else if (dataFromClient.type === "channelchange") {
        getChannelHistory(messagecollection,12,dataFromClient.channelid, connection);
    } else if (dataFromClient.type === "serverchange") {
        getServerChangeInformation(clientcollection,servercollection,messagecollection,dataFromClient.userid,dataFromClient.serverid,connection);
    } else if (dataFromClient.type === "createServerEvent") {
        createNewServer(servercollection,clientcollection,dataFromClient.servername,dataFromClient.userid,dataFromClient.username,connection);
    }
}