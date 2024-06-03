import { createClient } from 'redis';
import express from 'express';
import 'dotenv/config';
import cors from 'cors';

const corsOptions = {
  origin: process.env.CORS_URLS
};


const app = express()
app.use(cors(corsOptions));
const PORT = process.env.PORT;


let redisClient = createClient({
    socket: {
        port: process.env.REDIS_PORT,
        host: process.env.REDIS_HOST
    }
})

app.use(express.json());

await redisClient.connect();

app.get('/', (req, res) => {
  res.send('Running redis producer api...')
});

app.post('/redis-stream-data', async function(req, res) {
    console.log(`stream name: ${req.query.streamName} , body `,req.body);
    await redisClient.xAdd(req.query.streamName,'*',req.body)
    res.json(req.body);
});

app.listen(PORT, () => {
  console.log(`Node app listening on port ${PORT}`)
});