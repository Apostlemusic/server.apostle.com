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
].filter(Boolean);

const app = express();
const server = http.createServer(app); 

app.use(cookieParser());
app.use(express.json());

app.use(express.urlencoded({ extended: true })); // Parses URL-encoded data

// Set up bodyParser to parse incoming requests
app.use(bodyParser.json({ limit: "200mb" }));
app.use(bodyParser.urlencoded({ limit: "200mb", extended: true }));

const corsOptions = {
    // Always allow; cors will echo the request origin, which is required when credentials: true
    origin: function (_origin, callback) { callback(null, true); },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    // Include common headers; cors also mirrors Access-Control-Request-Headers automatically
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
// Handle preflight for all routes
app.options('*', cors(corsOptions));

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
// Alias to support clients calling /api/admin/auth/* (e.g., /api/admin/auth/login)
app.use('/api/admin/auth', adminRoute)
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