"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function () { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function (o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function (o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const migrator_1 = require("drizzle-orm/node-postgres/migrator");
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = require("pg");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
const dns_1 = require("dns");
const url_1 = require("url");
dotenv.config({ path: path_1.default.join(__dirname, '../../.env') });
function resolveHostToIPv4(connectionString) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const url = new url_1.URL(connectionString);
            const hostname = url.hostname;
            // Skip resolution for localhost or IP addresses
            const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
            if (hostname === 'localhost' || isIp) {
                return connectionString;
            }
            console.log(`Resolving IP for ${hostname}...`);
            const addresses = yield dns_1.promises.resolve4(hostname);
            if (addresses && addresses.length > 0) {
                console.log(`Resolved to IPv4: ${addresses[0]}`);
                url.hostname = addresses[0];
                return url.toString();
            }
        }
        catch (error) {
            console.warn('Manual DNS resolution failed, using original connection string:', error);
        }
        return connectionString;
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Running migrations...');
        let connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            // Fallback or construct from individual env vars if needed
            const user = process.env.DB_USER || 'postgres';
            const pass = process.env.DB_PASSWORD || '15oktober';
            const host = process.env.DB_HOST || 'localhost';
            const port = process.env.DB_PORT || '5432';
            const dbName = process.env.DB_NAME || 'pemira_db';
            connectionString = `postgres://${user}:${pass}@${host}:${port}/${dbName}`;
        }
        // Force IPv4
        const finalConnectionString = yield resolveHostToIPv4(connectionString);
        const isLocal = finalConnectionString.includes('localhost') || finalConnectionString.includes('127.0.0.1');
        const pool = new pg_1.Pool({
            connectionString: finalConnectionString,
            ssl: isLocal ? false : { rejectUnauthorized: false }
        });
        const db = (0, node_postgres_1.drizzle)(pool);
        try {
            yield (0, migrator_1.migrate)(db, { migrationsFolder: 'drizzle' });
            console.log('Migrations completed successfully');
        }
        catch (error) {
            console.error('Migration failed:', error);
            process.exit(1);
        }
        finally {
            yield pool.end();
        }
    });
}
main();
