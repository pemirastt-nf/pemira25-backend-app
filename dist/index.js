"use strict";
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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const security_1 = require("./middleware/security");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const voteRoutes_1 = __importDefault(require("./routes/voteRoutes"));
const candidateRoutes_1 = __importDefault(require("./routes/candidateRoutes"));
const db_1 = require("./config/db");
const drizzle_orm_1 = require("drizzle-orm");
// Load env
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, cors_1.default)({
    origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://10.0.3.111:3000',
        'https://pemira-sttnf.vercel.app',
        'https://pemira.nurulfikri.ac.id',
        'https://pemira.oktaa.my.id',
        process.env.FRONTEND_URL || ''
    ].filter(Boolean),
    credentials: true
}));
app.use(express_1.default.json());
// Security
(0, security_1.configureSecurity)(app);
// Routes
app.use('/api/auth', authRoutes_1.default);
app.use('/api/votes', voteRoutes_1.default);
app.use('/api/candidates', candidateRoutes_1.default);
// Health check
app.get('/health', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield db_1.db.execute((0, drizzle_orm_1.sql)`SELECT 1`);
        res.json({ status: 'ok', timestamp: new Date(), dbStatus: 'ok' });
    }
    catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ status: 'error', timestamp: new Date(), dbStatus: 'disconnected' });
    }
}));
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (process.env.JWT_SECRET === undefined || process.env.JWT_SECRET === 'super_secret_key_change_me') {
        console.warn('\x1b[33m%s\x1b[0m', 'WARNING: You are using the default JWT_SECRET. This is insecure for production!');
        console.warn('\x1b[33m%s\x1b[0m', 'Please set a strong JWT_SECRET in your .env file.');
    }
});
exports.default = app;
