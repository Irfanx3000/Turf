-- 0010: audit log (append-only).
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id),
  actor_type varchar(20) NOT NULL DEFAULT 'user',
  action varchar(80) NOT NULL,
  entity_type varchar(60) NOT NULL,
  entity_id varchar(80),
  tenant_id uuid REFERENCES tenants(id),
  before jsonb,
  after jsonb,
  ip varchar(45),
  user_agent varchar(400),
  request_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at);
CREATE INDEX audit_logs_tenant_idx ON audit_logs (tenant_id, created_at);
