# PEMIRA Backend

Backend service for the PEMIRA (Pemilihan Raya) voting system STT Terpadu Nurul Fikri. Built with Express, TypeScript, and Drizzle ORM.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Authentication**: JWT (JSON Web Tokens)
- **Queue**: BullMQ (with Redis)
- **Email**: Nodemailer
- **Documentation**: Swagger / OpenAPI

## Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v16+)
- [PNPM](https://pnpm.io/) (Package Manager)
- [PostgreSQL](https://www.postgresql.org/)
- [Redis](https://redis.io/) (Required for background jobs/OTP)

## Installation

1. Clone the repository and navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Install dependencies using PNPM:
   ```bash
   pnpm install
   ```

## Configuration

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Configure the `.env` file with your local settings:

   ```env
   PORT=5000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000

   # Database (PostgreSQL)
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=yourpassword
   DB_NAME=pemira_db

   # Redis (Required for BullMQ/Emails)
   REDIS_URL=redis://localhost:6379
   # OR
   REDIS_HOST=localhost
   REDIS_PORT=6379

   # Security
   JWT_SECRET=your_super_secret_key_change_me

   # Email (SMTP) - Context: used for sending OTPs
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASSWORD=your_app_password
   SMTP_FROM="PEMIRA STTNF <no-reply@pemira.sttnf.ac.id>"
   ```

## Database Setup

This project uses Drizzle ORM. You can run migrations or push schema directly (for dev).

1. Generate SQL migrations:

   ```bash
   pnpm db:generate
   ```

2. Push schema changes to the database (Development):

   ```bash
   pnpm db:push
   ```

3. (Optional) Run migrations:
   ```bash
   pnpm db:migrate
   ```

## Running the Application

### Development

Starts the server with hot-reloading using `ts-node-dev`.

```bash
pnpm dev
```

### Production

Build the TypeScript code and start the compiled application.

```bash
pnpm build
pnpm start
```

## API Documentation

The API is documented using Swagger.

- **URL**: `http://localhost:5000/api-docs`
- **JSON Spec**: `http://localhost:5000/api-docs.json` (if enabled)

## Folder Structure

- `src/config` - Configuration files (DB, Mail, Redis, Swagger)
- `src/controllers` - Request handlers
- `src/db` - Database schema and migration scripts
- `src/middleware` - Auth and validation middleware
- `src/routes` - API route definitions
- `src/services` - Business logic (optional)
- `src/utils` - Helper functions
- `src/worker` - Background workers (e.g., Email worker)

## Background Workers

The application uses **BullMQ** to handle background tasks like sending emails. Ensure **Redis** is running before starting the application.

- The email worker is initialized automatically in `src/index.ts`.
