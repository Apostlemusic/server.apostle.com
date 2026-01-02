import mongoose from "mongoose";
import { config } from 'dotenv';
config();
// Connect without deprecated options (they're ignored by modern drivers)
function redactUri(uri) {
    try {
        // redact credentials if present
        return uri.replace(/(mongodb\+srv:\/\/)(.*@)/, '$1<redacted>@');
    } catch (e) {
        return uri;
    }
}

/**
 * connectDB - connect to MongoDB using MONGODB_URI env var
 * Throws on connection failure so callers can decide how to proceed.
 */
export async function connectDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        const msg = 'MONGODB_URI environment variable is not set. Set it in .env (e.g. mongodb+srv://USER:PW@cluster0.mongodb.net/DB_NAME?retryWrites=true&w=majority)';
        console.error(msg);
        throw new Error(msg);
    }

    try {
            // Fail fast and avoid buffering commands when disconnected
            mongoose.set('bufferCommands', false);
            mongoose.set('bufferTimeoutMS', 2000);
            await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log('Connected to DB');
    } catch (err) {
        console.error('DB connection error:');
        console.error(err && err.message ? err.message : err);

        // Provide actionable hints for authentication failures
        const msg = String(err && err.message ? err.message : err).toLowerCase();
        if (msg.includes('auth') || msg.includes('authentication')) {
            console.error('\nMongo authentication failed. Check the following:');
            console.error('- Verify the username and password in your MONGODB_URI. If the password contains special characters, encode it with encodeURIComponent().');
            console.error("- Ensure the user exists in Atlas and has access to the database you're connecting to.");
            console.error('- Make sure the connection string includes the database name and required options, e.g.:');
            console.error(`  mongodb+srv://<USER>:<PASSWORD>@cluster0.sqsvsph.mongodb.net/<DB_NAME>?retryWrites=true&w=majority`);
        }

        console.error('\nRedacted connection string (for inspection):', redactUri(uri));
        throw err; // rethrow so the caller (server) can stop startup if desired
    }
}

export default connectDB;