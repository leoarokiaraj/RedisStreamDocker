import { createClient,commandOptions } from 'redis';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io'
import 'dotenv/config';

const clientIds = []

const app = express();
app.use(cors());
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors:{origin:"http://localhost:3000"}
})
io.on("connection", (socket) => {
    console.log(`a user connected ${socket.id}`);
    
    clientIds.push(socket.id)

    socket.on("send_message", (data) => {
        console.log(data)
      socket.broadcast.emit("receive_message", data);
    });
  });

let redisClient = createClient({
    socket: {
        port: process.env.REDIS_PORT,
        host: process.env.REDIS_HOST
    }
})

redisClient.connect();

try {
    let resp = await redisClient.xGroupCreate(process.env.REDIS_STREAMKEY, process.env.REDIS_CONSUMER_GROUP, "$", {MKSTREAM: true})
    console.log(resp);
} catch (error) {
    console.warn(error);
}

async function processMessage(message) {
    let consumerGroups = await redisClient.xInfoGroups(process.env.REDIS_STREAMKEY)
    let consumerGroupInfo = consumerGroups.find((cg) => cg.name === process.env.REDIS_CONSUMER_GROUP)
    console.log(consumerGroupInfo);
    clientIds.forEach(element => {
        io.to(element).emit("message_queue_status", consumerGroupInfo.pending)
    });

    await sleep(5000 * (consumerGroupInfo.pending));


    console.log(message, message.id)
    await redisClient.xAck(process.env.REDIS_STREAMKEY,process.env.REDIS_CONSUMER_GROUP,[message.id]);

    let consumerGroupsRem = await redisClient.xInfoGroups(process.env.REDIS_STREAMKEY)
    let consumerGroupInfoRem = consumerGroupsRem.find((cg) => cg.name === process.env.REDIS_CONSUMER_GROUP)

    clientIds.forEach(element => {
        console.log(element, consumerGroupInfoRem.pending )
        io.to(element).emit("message_queue_status", (consumerGroupInfoRem.pending))
    });


}

async function readAndProcessMessages() {
    try {
        while (true) {
            let resp = await redisClient.xReadGroup(
                commandOptions(
                    {
                    isolated: true
                    }
                ),
                process.env.REDIS_CONSUMER_GROUP, 
                process.env.REDIS_CONSUMER_NAME, [
                    {
                    key: process.env.REDIS_STREAMKEY,
                    id: '>' 
                    }
                ], {
                    // COUNT: 1,
                    BLOCK:0
                }
            );
            
    
            console.log(resp)
    
            if (resp){
                resp[0].messages.forEach(async (message) => {
                    await processMessage(message)
                });
    
            } 
    
                
        }
        
    } catch (error) {
        console.error(error)
    }
    finally {
        redisClient.quit();
    }
   
}

httpServer.listen(process.env.REDIS_CONSUMER_PORT, () => { console.log(`listening on *:${process.env.REDIS_CONSUMER_PORT}`); });

readAndProcessMessages()
    .then(() => console.log('Message processing started.'))
    .catch(error => console.error('Error starting message processing:', error));

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}