-- Core schema for account management (production-ready baseline)
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(200) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(180) UNIQUE,
  phone VARCHAR(40),
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','MANAGER','USER')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE','DISABLED','LOCKED','PENDING')) DEFAULT 'ACTIVE',
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by BIGINT,
  updated_by BIGINT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT,
  action VARCHAR(100) NOT NULL,
  target_user_id BIGINT,
  metadata JSONB,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_user_id);
