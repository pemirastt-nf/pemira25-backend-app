import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ea9dd5af6befb4b8b1b9d17d75f0f5afea1f3bde012cc1fa58cc5f926ab355e121ddb710eaaf6684e309d6f906946d8985b8a1ad5be14efc62e2029a9a5f50b0';

export interface AdminAuthRequest extends Request {
     user?: any;
}

export const authenticateAdmin = (req: AdminAuthRequest, res: Response, next: NextFunction) => {
     let token = req.cookies.admin_token;

     if (!token) {
          const authHeader = req.headers['authorization'];
          if (authHeader && authHeader.startsWith('Bearer ')) {
               token = authHeader.split(' ')[1];
          }
     }

     if (!token) {
          return res.status(401).json({ error: 'Unauthorized: No token provided' });
     }

     jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
          if (err) {
               return res.status(403).json({ error: 'Forbidden: Invalid token' });
          }

          // Role Check
          if (decoded.role === 'voter') {
               return res.status(403).json({ error: 'Forbidden: Voters cannot access admin area' });
          }

          req.user = decoded;
          next();
     });
};


export const requireSuperAdmin = (req: AdminAuthRequest, res: Response, next: NextFunction) => {
     const role = req.user?.role;
     if (role !== 'super_admin') {
          return res.status(403).json({ error: 'Forbidden: Requires Super Admin' });
     }
     next();
};

// RBAC Middleware
export const requireOperatorTPS = (req: AdminAuthRequest, res: Response, next: NextFunction) => {
     const role = req.user?.role;
     // Allow Super Admin, Panitia, or specific Operator TPS
     if (role === 'super_admin' || role === 'panitia' || role === 'operator_tps') {
          return next();
     }
     return res.status(403).json({ error: 'Forbidden: Requires Operator TPS Access' });
};

export const requireOperatorSuara = (req: AdminAuthRequest, res: Response, next: NextFunction) => {
     const role = req.user?.role;
     if (role === 'super_admin' || role === 'panitia' || role === 'operator_suara') {
          return next();
     }
     return res.status(403).json({ error: 'Forbidden: Requires Operator Suara Access' });
};

export const requireOperatorChat = (req: AdminAuthRequest, res: Response, next: NextFunction) => {
     const role = req.user?.role;
     if (role === 'super_admin' || role === 'panitia' || role === 'operator_chat') {
          return next();
     }
     return res.status(403).json({ error: 'Forbidden: Requires Operator Chat Access' });
};
