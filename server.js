import express from "express";
import { config } from 'dotenv';
import http from 'http'; 
config();

import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import cors from 'cors';

//IMPORT ROUTES
// auth routes merged into user routes; keep using userRoute for /api/auth
import adminRoute from './routes/admin.routes.js';
import userRoute from './routes/user.routes.js';
// Legacy routes deprecated in favor of /api/content
import artistRoute from './routes/artist.routes.js';
import contentRoute from './routes/content.routes.js';
import { isVerified } from './controllers/user.controller.js'



// CORS setup
const allowedOrigins = [
    process.env.CLIENT_URL,
    process.env.ADMIN_URL,
    process.env.SERVER_URL,
    '*',
];

const app = express();
const server = http.createServer(app); 

app.use(cookieParser());
app.use(express.json());

app.use(express.urlencoded({ extended: true })); // Parses URL-encoded data

// Set up bodyParser to parse incoming requests
app.use(bodyParser.json({ limit: "200mb" }));
app.use(bodyParser.urlencoded({ limit: "200mb", extended: true }));

const corsOptions = {
    origin: function (origin, callback) {
        // console.log('URL ORIGIN', origin);
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS', 'ORIGIN>', origin));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};
app.use(cors(corsOptions));

//DOCs
import swaggerUI from 'swagger-ui-express';
import YAML from 'yamljs';
const swaggerJSDocs = YAML.load('./api.yaml');
app.use('/api-doc', swaggerUI.serve, swaggerUI.setup(swaggerJSDocs));

// Import DB connection function
import connectDB from './connection/db.js';
//import './test.js'


// Routes
app.get('/', (req, res) => {
    res.status(200).json('Home GET Request');
});
// Basic health endpoint to check DB status
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        dbConnected: !!app.locals.dbConnected,
    })
})
app.use('/api/auth', userRoute);
// Direct route for verification status to avoid any router-specific quirks
app.get('/api/auth/isVerified', isVerified)
app.use('/api/user', userRoute);
// also support plural `/api/songs` for clients that use that path
// app.use('/api/songs', songRoute);
app.use('/api/admin', adminRoute)
// Deprecated mounts removed: /api/category, /api/song, /api/playlist
app.use('/api/artist', artistRoute)
app.use('/api/content', contentRoute)





// Start server with socket after DB connection
const PORT = process.env.PORT || 10000;

// handle listen errors gracefully
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} already in use`);
        process.exit(1);
    }
    console.error('Server error', err);
});

(async () => {
    try {
        await connectDB();
        app.locals.dbConnected = true;
    } catch (err) {
        app.locals.dbConnected = false;
        if (process.env.ALLOW_START_WITHOUT_DB === 'true') {
            console.warn('DB connection failed; starting server without DB (DEV mode). Some routes may not function).');
        } else {
            console.error('Failed to start server due to DB connection error');
            process.exit(1);
        }
    }
    server.listen(PORT, () => {
        console.log(`Server running on port http://localhost:${PORT}`);
    });
})();